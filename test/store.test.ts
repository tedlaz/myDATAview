// Λήψη προς βάση με ψεύτικο δίκτυο, πάνω σε πραγματικό sqlite (node:sqlite).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import type { Fetch } from '../src/aade/client.ts';
import { fetchBooks, validGr } from '../src/book/fetch.ts';
import { yearlyTotals } from '../src/book/yearly.ts';
import { Store } from '../src/store.ts';
import { memoryDb } from './helpers.ts';

const dir = new URL('./fixtures/', import.meta.url);
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const pages = Object.fromEntries(
  readdirSync(dir).filter((f: string) => f.endsWith('.xml')).map((f: string) => [f.replace('.xml', ''), readFileSync(new URL(f, dir), 'utf8')]),
);
const fetchFn: Fetch = async (url) => {
  const endpoint = url.split('?')[0].split('/').pop()!;
  return { status: 200, text: async () => pages[endpoint + (url.includes('nextPartitionKey') ? '.2' : '')] };
};

function setup() {
  const store = new Store(memoryDb());
  const id = store.addCompany({ name: 'Δοκιμή', vat: golden.own_vat, env: 'prod', via_accountant: 0 });
  return { store, company: store.activeCompany()!, id };
}

const run = (s: ReturnType<typeof setup>, lookups: string[] = [], over: Partial<Parameters<typeof fetchBooks>[0]> = {}) =>
  fetchBooks({
    store: s.store, company: s.company, keys: { userId: 'u', subscriptionKey: 'k' }, from: golden.from, to: golden.to,
    fetchFn, today: () => golden.today,
    lookup: async (vat) => {
      lookups.push(vat);
      return vat === '333333333' ? 'ΠΕΛΑΤΗΣ VIES' : null;
    },
    ...over,
  });

test('η λήψη γεμίζει τα δύο βιβλία με τις σωστές καταστάσεις', async () => {
  const s = setup();
  const outcomes = await run(s);
  assert.ok(outcomes.every((o) => o.ok), JSON.stringify(outcomes));
  const marks = (kind: 'income' | 'expense', status: 'classified' | 'unclassified') =>
    s.store.documents(s.id, kind, { status }, 100, 0).map((d) => d.mark).sort();
  assert.deepEqual(marks('expense', 'unclassified'), golden.expenses.unclassified.map((i: any) => i.mark).sort());
  assert.deepEqual(marks('expense', 'classified'), golden.expenses.classified.map((i: any) => i.mark).sort());
  assert.deepEqual(marks('income', 'unclassified'), golden.income.unclassified.map((i: any) => i.mark).sort());
  assert.deepEqual(marks('income', 'classified'), golden.income.classified.map((i: any) => i.mark).sort());
});

test('ακυρωμένο που υπήρχε τοπικά αφαιρείται στην επόμενη λήψη', async () => {
  const s = setup();
  await run(s);
  const inv = { ...golden.expenses.unclassified[0], mark: '103', cls_info: [], taxes: [], lines: [] };
  s.store.saveBook(s.id, 'expense', [[inv, 'unclassified']], new Set());
  assert.ok(s.store.document(s.id, '103'));
  await run(s);
  assert.equal(s.store.document(s.id, '103'), null);
});

test('επωνυμίες: από XML, μετά VIES, και κάθε ΑΦΜ ρωτιέται μόνο αν είναι άγνωστο', async () => {
  const s = setup();
  const lookups: string[] = [];
  await run(s, lookups);
  assert.equal(s.store.document(s.id, '100')!.name, 'ΤΡΟΦΙΜΑ & ΠΟΤΑ');
  assert.equal(s.store.document(s.id, '201')!.name, 'ΠΕΛΑΤΗΣ'); // το 200 έφερε επωνυμία για το ίδιο ΑΦΜ
  assert.equal(new Set(lookups).size, lookups.length);
  assert.ok(!lookups.includes('333333333'));
  const again: string[] = [];
  await run(s, again);
  assert.ok(!again.includes('222222222')); // ήδη γνωστό
});

test('αποτυχία VIES δεν σταματά τη λήψη', async () => {
  const s = setup();
  const outcomes = await run(s, [], { lookup: async () => { throw new Error('δίκτυο'); } });
  assert.ok(outcomes.every((o) => o.ok));
});

test('αποτυχία του ενός βιβλίου δεν σταματά το άλλο', async () => {
  const s = setup();
  const partial: Fetch = async (url, init) =>
    (url.includes('RequestDocs') ? { status: 500, text: async () => 'x' } : fetchFn(url, init));
  const outcomes = await run(s, [], { fetchFn: partial });
  assert.deepEqual(outcomes.map((o) => [o.kind, o.ok]), [['income', true], ['expense', false]]);
  assert.ok(s.store.documents(s.id, 'income', {}, 100, 0).length > 0);
});

test('φίλτρα βιβλίου: μήνας, αναζήτηση και οριακοί χαρακτήρες', async () => {
  const s = setup();
  await run(s);
  assert.deepEqual(s.store.months(s.id, 'expense'), ['2026-02']);
  assert.equal(s.store.documents(s.id, 'expense', { month: '2026-03' }, 100, 0).length, 0);
  const byName = (search: string) => s.store.documents(s.id, 'expense', { search }, 100, 0).map((d) => d.vat);
  for (const typed of ['ΤΡΟΦΙΜΑ', 'τροφιμα', 'τρόφιμα']) {
    assert.ok(byName(typed).length > 0, typed);
    assert.ok(byName(typed).every((vat) => vat === '222222222'), typed); // όλα του ίδιου ΑΦΜ
  }
  assert.deepEqual(byName('555555555'), ['555555555']);
  assert.equal(byName('%').length, 0);
  assert.equal(s.store.documents(s.id, 'expense', {}, 2, 0).length, 2);
});

test('το συνοπτικό μετρά τα αχαρακτήριστα μόνο όταν ζητηθεί, και αφαιρεί τα πιστωτικά', async () => {
  const s = setup();
  await run(s);
  const net = (unc: boolean) => yearlyTotals(s.store.yearDocuments(s.id, 'income', '2026', unc), true)[2].net;
  assert.equal(net(false), 300); // 200, 202, 203
  assert.equal(net(true), 390); // + 201, − 210 (πιστωτικό)
});

test('διαγραφή εταιρείας καθαρίζει τα δεδομένα της και επιλέγει άλλη', async () => {
  const s = setup();
  await run(s);
  const other = s.store.addCompany({ name: 'Άλλη', vat: '999999999', env: 'dev', via_accountant: 0 });
  s.store.deleteCompany(s.id);
  assert.equal(s.store.documents(s.id, 'income', {}, 10, 0).length, 0);
  assert.equal(s.store.activeCompany()!.id, other);
});

test('τα κλειδιά ΑΑΔΕ δεν γράφονται ποτέ στη βάση', async () => {
  const db = memoryDb();
  const store = new Store(db);
  store.addCompany({ name: 'Δ', vat: golden.own_vat, env: 'prod', via_accountant: 0 });
  await fetchBooks({
    store, company: store.activeCompany()!, keys: { userId: 'SECRET-USER', subscriptionKey: 'SECRET-KEY' },
    from: golden.from, to: golden.to, fetchFn, today: () => golden.today, lookup: async () => null,
  });
  for (const table of ['companies', 'settings', 'names', 'documents']) {
    assert.ok(!JSON.stringify(db.all(`SELECT * FROM ${table}`)).includes('SECRET'), table);
  }
});

test('η πρώτη εταιρεία μένει ενεργή όταν προστεθεί άλλη με προηγούμενο όνομα', () => {
  const store = new Store(memoryDb());
  const first = store.addCompany({ name: 'Ω', vat: '111111111', env: 'prod', via_accountant: 0 });
  store.addCompany({ name: 'Α', vat: '222222222', env: 'prod', via_accountant: 0 });
  assert.equal(store.activeCompany()!.id, first);
});

test('παράμετρος ΦΠΑ: μηνιαίος εξ ορισμού, αποθηκεύεται, και μεταπίπτει παλιά βάση', () => {
  const store = new Store(memoryDb());
  store.addCompany({ name: 'Α', vat: '111111111', env: 'prod', via_accountant: 0 });
  const c = store.activeCompany()!;
  assert.equal(c.vat_period, 'm');
  store.updateCompany({ ...c, vat_period: 'q' });
  assert.equal(store.activeCompany()!.vat_period, 'q');

  const old = memoryDb();
  old.exec(`CREATE TABLE companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, vat TEXT NOT NULL,
    env TEXT NOT NULL DEFAULT 'prod', via_accountant INTEGER NOT NULL DEFAULT 0);
    INSERT INTO companies (name, vat) VALUES ('Παλιά', '222222222');`);
  assert.equal(new Store(old).companies()[0].vat_period, 'm');
  assert.equal(new Store(old).companies().length, 1); // δεύτερο άνοιγμα: χωρίς δεύτερη μετάπτωση
});

test('συναλλασσόμενοι: ρόλος, πλήθος, αναζήτηση και ταξινόμηση', async () => {
  const s = setup();
  await run(s);
  const list = s.store.counterparties(s.id, {}, 'name');
  const by = (vat: string) => list.find((t) => t.vat === vat)!;
  assert.deepEqual(by('333333333'), { vat: '333333333', name: 'ΠΕΛΑΤΗΣ', docs: 4, role: 'income' });
  assert.equal(by('222222222').role, 'expense');
  assert.equal(by('222222222').docs, 9);
  // Χωρίς επωνυμία πάντα στο τέλος.
  assert.equal(list[list.length - 1].name, null);
  assert.ok(list.every((t, i) => i === 0 || !t.name || !!list[i - 1].name));

  const docs = s.store.counterparties(s.id, {}, 'docs');
  assert.ok(docs.every((t, i) => i === 0 || docs[i - 1].docs >= t.docs));
  assert.deepEqual(s.store.counterparties(s.id, { search: 'πελάτης' }, 'name').map((t) => t.vat), ['333333333']);
  assert.ok(s.store.counterparties(s.id, { role: 'income' }, 'name').every((t) => t.role === 'income'));
  assert.ok(s.store.counterparties(s.id, { role: 'expense' }, 'name').every((t) => t.role === 'expense'));

  // Ίδιο ΑΦΜ σε έσοδα και έξοδα: ρόλος «και τα δύο», και εμφανίζεται και στα δύο φίλτρα.
  const inv = { ...golden.expenses.unclassified[0], mark: '700', counterpart_vat: '222222222', cls_info: [], taxes: [], lines: [] };
  s.store.saveBook(s.id, 'income', [[inv, 'unclassified']], new Set());
  const both = (role: 'income' | 'expense') => s.store.counterparties(s.id, { role }, 'name').find((t) => t.vat === '222222222');
  assert.equal(both('income')?.role, 'both');
  assert.equal(both('expense')?.role, 'both');
});

test('παραστατικά συναλλασσόμενου: και από τα δύο βιβλία, νεότερα πρώτα', async () => {
  const s = setup();
  await run(s);
  const inv = { ...golden.expenses.unclassified[0], mark: '701', issue_date: '2026-06-01', counterpart_vat: '222222222', cls_info: [], taxes: [], lines: [] };
  s.store.saveBook(s.id, 'income', [[inv, 'unclassified']], new Set());
  const docs = s.store.counterpartyDocuments(s.id, '222222222', 100, 0);
  assert.equal(docs[0].mark, '701');
  assert.deepEqual([...new Set(docs.map((d) => d.kind))].sort(), ['expense', 'income']);
  assert.equal(s.store.counterpartyDocuments(s.id, '222222222', 2, 0).length, 2);
  assert.equal(s.store.counterpartyDocuments(s.id, 'κανένα', 10, 0).length, 0);
});

test('ειδοποίηση όταν αλλάζει η ενεργή εταιρεία', () => {
  const store = new Store(memoryDb());
  let calls = 0;
  const off = store.subscribe(() => { calls += 1; });
  const id = store.addCompany({ name: 'Α', vat: '111111111', env: 'prod', via_accountant: 0 });
  assert.ok(calls > 0);
  for (const change of [() => store.setActive(id), () => store.updateCompany({ ...store.activeCompany()!, name: 'Β' }), () => store.deleteCompany(id)]) {
    calls = 0;
    change();
    assert.ok(calls > 0);
  }
  off();
  calls = 0;
  store.addCompany({ name: 'Γ', vat: '222222222', env: 'prod', via_accountant: 0 });
  assert.equal(calls, 0);
});

test('διορθωμένη επωνυμία: επιβιώνει της λήψης, φαίνεται παντού και βρίσκεται στην αναζήτηση', async () => {
  const s = setup();
  await run(s);
  assert.equal(s.store.document(s.id, '100')!.name, 'ΤΡΟΦΙΜΑ & ΠΟΤΑ');
  assert.ok(s.store.renameCounterparty('222222222', '  Διορθωμένη   Επωνυμία '));
  assert.equal(s.store.document(s.id, '100')!.name, 'Διορθωμένη Επωνυμία');
  await run(s); // το XML φέρνει ξανά το παλιό όνομα
  assert.equal(s.store.document(s.id, '100')!.name, 'Διορθωμένη Επωνυμία');
  assert.deepEqual(s.store.counterparties(s.id, { search: 'διορθωμενη' }, 'name').map((t) => t.vat), ['222222222']);
  assert.equal(s.store.counterparties(s.id, { search: 'ΤΡΟΦΙΜΑ' }, 'name').length, 0);
  assert.equal(s.store.renameCounterparty('222222222', '   '), false);
  assert.equal(s.store.document(s.id, '100')!.name, 'Διορθωμένη Επωνυμία');
  assert.ok(s.store.renameCounterparty('888888888', 'Χωρίς προηγούμενη'));
  assert.equal(s.store.names().get('888888888'), 'Χωρίς προηγούμενη');
});

test('επαναφορά: επιστρέφει η αρχική, ακόμα και μετά από δεύτερη διόρθωση, και η λήψη ενημερώνει ξανά', () => {
  const store = new Store(memoryDb());
  store.saveNames(new Map([['1', 'Αρχικό']]));
  store.renameCounterparty('1', 'Πρώτη διόρθωση');
  store.renameCounterparty('1', 'Δεύτερη διόρθωση');
  assert.ok(store.isRenamed('1'));
  assert.equal(store.resetCounterparty('1'), true);
  assert.equal(store.names().get('1'), 'Αρχικό');
  assert.ok(!store.isRenamed('1'));
  store.saveNames(new Map([['1', 'Νεότερο']]));
  assert.equal(store.names().get('1'), 'Νεότερο');
});

test('επαναφορά: νεότερη επωνυμία από τη λήψη όσο ίσχυε η διόρθωση', () => {
  const store = new Store(memoryDb());
  store.saveNames(new Map([['1', 'Αρχικό']]));
  store.renameCounterparty('1', 'Διόρθωση');
  store.saveNames(new Map([['1', 'Από λήψη']]));
  assert.equal(store.names().get('1'), 'Διόρθωση');
  store.resetCounterparty('1');
  assert.equal(store.names().get('1'), 'Από λήψη');
});

test('επαναφορά χωρίς γνωστή αρχική: ξεχνά τη διόρθωση και ενημερώνεται ξανά', () => {
  const store = new Store(memoryDb());
  store.renameCounterparty('2', 'Χωρίς προηγούμενη');
  assert.equal(store.resetCounterparty('2'), false);
  assert.equal(store.names().has('2'), false);
  assert.ok(!store.isRenamed('2'));
  store.saveNames(new Map([['2', 'Από VIES']]));
  assert.equal(store.names().get('2'), 'Από VIES');
  assert.equal(store.resetCounterparty('2'), true); // χωρίς διόρθωση: τίποτα
  assert.equal(store.names().get('2'), 'Από VIES');
});

test('επωνυμίες χωρίς διόρθωση συνεχίζουν να ενημερώνονται από τη λήψη', () => {
  const store = new Store(memoryDb());
  store.saveNames(new Map([['1', 'Παλιό']]));
  store.saveNames(new Map([['1', 'Νέο']]));
  assert.equal(store.names().get('1'), 'Νέο');
});

test('παλιά βάση επωνυμιών μεταπίπτει χωρίς απώλεια', () => {
  const old = memoryDb();
  old.exec(`CREATE TABLE names (vat TEXT PRIMARY KEY, name TEXT NOT NULL, fold TEXT NOT NULL);
    INSERT INTO names VALUES ('1', 'Όνομα', 'ΟΝΟΜΑ');`);
  const store = new Store(old);
  assert.equal(store.names().get('1'), 'Όνομα');
  assert.ok(store.renameCounterparty('1', 'Άλλο'));
  store.saveNames(new Map([['1', 'Λήψη']]));
  assert.equal(store.names().get('1'), 'Άλλο');

  // Βάση με διόρθωση από την έκδοση χωρίς αρχική επωνυμία.
  const earlier = memoryDb();
  earlier.exec(`CREATE TABLE names (vat TEXT PRIMARY KEY, name TEXT NOT NULL, fold TEXT NOT NULL, manual INTEGER NOT NULL DEFAULT 0);
    INSERT INTO names VALUES ('9', 'Διόρθωση', 'ΔΙΟΡΘΩΣΗ', 1);`);
  const migrated = new Store(earlier);
  assert.ok(migrated.isRenamed('9'));
  assert.equal(migrated.resetCounterparty('9'), false);
});

test('έλεγχος ημερομηνίας', () => {
  assert.ok(validGr('29/02/2024'));
  for (const bad of ['29/02/2026', '31/04/2026', '2026-01-01', '1/1/2026', '']) assert.ok(!validGr(bad), bad);
});

test('παραστατικό μηδενικής αξίας μετρά ως χαρακτηρισμένο (2.5 / E3_585_016), και τα έσοδα', async () => {
  const s = setup();
  const zero: Fetch = async (url, init) => {
    const r = await fetchFn(url, init);
    const body = await r.text();
    return {
      status: 200,
      text: async () => body?.replace(/<(totalNetValue|totalVatAmount)>[^<]*</g, '<$1>0<'),
    };
  };
  await run(s, [], { fetchFn: zero });
  const left = s.store.documents(s.id, 'expense', { status: 'unclassified' }, 100, 0);
  assert.ok(left.every((d) => d.invoice_type === '1.5'), JSON.stringify(left.map((d) => d.invoice_type)));
  const mark = golden.expenses.unclassified.find((i: any) => i.invoice_type !== '1.5').mark;
  const doc = s.store.document(s.id, mark)!;
  assert.equal(doc.status, 'classified');
  assert.ok(JSON.parse(doc.cls_json ?? '[]').every((c: any) => c.type === 'E3_585_016' && c.category === 'category2_5'));
  const income = s.store.documents(s.id, 'income', { status: 'unclassified' }, 100, 0);
  assert.ok(income.every((d) => d.invoice_type === '1.5'), JSON.stringify(income.map((d) => d.invoice_type)));
  assert.ok(golden.income.unclassified.some((i: any) => i.invoice_type !== '1.5'), 'το τεστ χρειάζεται αχαρακτήριστο έσοδο');
  // Παλιά βάση: διορθώνεται στο άνοιγμα.
  const db = memoryDb();
  const old = new Store(db);
  const id = old.addCompany({ name: 'Παλιά', vat: golden.own_vat, env: 'prod', via_accountant: 0 });
  const base = { ...golden.expenses.unclassified[0], cls_info: [], taxes: [], lines: [] };
  old.saveBook(id, 'expense', [
    [{ ...base, mark: '1', invoice_type: '1.1', total_net: 0, total_vat: 0 }, 'unclassified'],
    [{ ...base, mark: '2', invoice_type: '1.5', total_net: 0, total_vat: 0 }, 'unclassified'],
    [{ ...base, mark: '3', invoice_type: '1.1', total_net: 0, total_vat: 5 }, 'unclassified'],
  ], new Set());
  const again = new Store(db);
  assert.deepEqual(['1', '2', '3'].map((m) => again.document(id, m)?.status), ['classified', 'unclassified', 'unclassified']);
});

test('ίδιο UID με άλλο MARK: μένει μόνο το νεότερο MARK', () => {
  const s = setup();
  const base = { ...golden.expenses.unclassified[0], cls_info: [], taxes: [], lines: [], uid: 'U1' };
  s.store.saveBook(s.id, 'expense', [[{ ...base, mark: '200' }, 'unclassified']], new Set());
  s.store.saveBook(s.id, 'expense', [[{ ...base, mark: '100' }, 'unclassified']], new Set());
  assert.equal(s.store.document(s.id, '100'), null);
  s.store.saveBook(s.id, 'expense', [[{ ...base, mark: '300' }, 'unclassified']], new Set());
  assert.equal(s.store.document(s.id, '200'), null);
  assert.ok(s.store.document(s.id, '300'));
});
