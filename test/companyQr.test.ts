// Εισαγωγή εταιρείας από QR: το μήνυμα παράγεται από το myDATA Classifier (tests/test_company_qr.py).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importCompany, parseCompanyQr } from '../src/book/companyQr.ts';
import { Store } from '../src/store.ts';
import { memoryDb } from './helpers.ts';

const valid = { format: 'mydataview-company', v: 1, name: 'Ελληνική Δοκιμή ΑΕ', vat: '123456789', env: 'dev', vat_period: 'q', user: 'OWNUSER', key: 'OWNKEY' };
const qr = (over: object = {}) => JSON.stringify({ ...valid, ...over });

test('έγκυρο QR, και με ελληνικά ως \\\\uXXXX όπως το βγάζει η Python', () => {
  const ascii = qr().replace(/[^\x00-\x7f]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  assert.deepEqual(parseCompanyQr(ascii), {
    name: 'Ελληνική Δοκιμή ΑΕ', vat: '123456789', env: 'dev', vat_period: 'q', keys: { userId: 'OWNUSER', subscriptionKey: 'OWNKEY' },
  });
});

test('ό,τι άλλο απορρίπτεται', () => {
  const bad = ['', 'https://example.com', 'null', '[]', '42', qr({ format: 'άλλο' }), qr({ v: 2 }), qr({ vat: '12345' }), qr({ vat: 'ABCDEFGHI' }),
    qr({ vat: 123456789 }), qr({ env: 'test' }), qr({ vat_period: 'y' }), qr({ user: '' }), qr({ key: '  ' }), qr({ key: 5 }), qr({ name: '' }),
    qr({ name: 'x'.repeat(201) }), qr({ key: 'x'.repeat(201) })];
  for (const text of bad) assert.equal(parseCompanyQr(text), null, text);
});

function setup() {
  const saved: [number, unknown][] = [];
  return { store: new Store(memoryDb()), saved, save: async (id: number, keys: unknown) => { saved.push([id, keys]); } };
}

test('νέα εταιρεία: μπαίνει, γίνεται ενεργή, τα κλειδιά πάνε στο secure store και όχι στη βάση', async () => {
  const { store, saved, save } = setup();
  store.addCompany({ name: 'Άλλη', vat: '999999999', env: 'prod', via_accountant: 0 });
  const r = await importCompany(store, parseCompanyQr(qr())!, save);
  assert.equal(r.created, true);
  const active = store.activeCompany()!;
  assert.deepEqual([active.id, active.name, active.vat, active.env, active.vat_period, active.via_accountant], [r.id, 'Ελληνική Δοκιμή ΑΕ', '123456789', 'dev', 'q', 0]);
  assert.deepEqual(saved, [[r.id, { userId: 'OWNUSER', subscriptionKey: 'OWNKEY' }]]);
  assert.ok(!JSON.stringify(store.companies()).includes('OWNKEY'));
});

test('ίδιο ΑΦΜ και περιβάλλον: ενημερώνεται χωρίς διπλή εγγραφή και χωρίς να χαθεί η πρόοδος MARK', async () => {
  const { store, save } = setup();
  const id = store.addCompany({ name: 'Παλιό', vat: '123456789', env: 'dev', via_accountant: 1 });
  store.setSetting(`mark_start:income:${id}`, '2026-01-01');
  const r = await importCompany(store, parseCompanyQr(qr())!, save);
  assert.deepEqual([r.id, r.created], [id, false]);
  assert.equal(store.companies().length, 1);
  assert.equal(store.activeCompany()!.name, 'Ελληνική Δοκιμή ΑΕ');
  assert.equal(store.activeCompany()!.via_accountant, 0);
  assert.equal(store.setting(`mark_start:income:${id}`), '2026-01-01');
});

test('ίδιο ΑΦΜ σε άλλο περιβάλλον: χωριστή εταιρεία', async () => {
  const { store, save } = setup();
  store.addCompany({ name: 'Παραγωγή', vat: '123456789', env: 'prod', via_accountant: 0 });
  assert.equal((await importCompany(store, parseCompanyQr(qr())!, save)).created, true);
  assert.equal(store.companies().length, 2);
});

test('αποτυχία αποθήκευσης κλειδιών: καμία μισή εταιρεία', async () => {
  const { store } = setup();
  await assert.rejects(importCompany(store, parseCompanyQr(qr())!, async () => { throw new Error('keystore'); }));
  assert.equal(store.companies().length, 0);
});
