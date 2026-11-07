// «Νέα από MARK»: τα ίδια πατήματα δίνουν το ίδιο βιβλίο και τα ίδια W με το desktop (golden-dashboard.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Fetch } from '../src/aade/client.ts';
import { fetchBooks, fetchNewBooks, markReady } from '../src/book/fetch.ts';
import { Store } from '../src/store.ts';
import { loadPages, memoryDb } from './helpers.ts';

const golden = JSON.parse(readFileSync(new URL('./golden-dashboard.json', import.meta.url), 'utf8'));
const pages = loadPages('./fixtures/');
const since = loadPages('./fixtures/since/');
const OWN = '111111111';

function network(round: { n: number }, calls: string[] = []): Fetch {
  return async (url) => {
    calls.push(url);
    const endpoint = url.split('?')[0].split('/').pop()!;
    const param = (k: string) => new RegExp(`[?&]${k}=([^&]*)`).exec(url)?.[1];
    let body;
    if (['RequestDocs', 'RequestTransmittedDocs'].includes(endpoint) && !param('dateFrom')) {
      body = Number(param('mark')) < 9000 ? since[endpoint] : since.empty;
    } else if (round.n > 1 && endpoint === 'RequestTransmittedDocs') body = since['RequestTransmittedDocs.range'];
    else body = pages[endpoint + (param('nextPartitionKey') ? '.2' : '')];
    return { status: 200, text: async () => body };
  };
}

function setup() {
  const store = new Store(memoryDb());
  store.addCompany({ name: 'Δοκιμή', vat: OWN, env: 'prod', via_accountant: 0 });
  return { store, company: store.activeCompany()! };
}

const base = { keys: { userId: 'u', subscriptionKey: 'k' }, start: '2026-01-01', lookup: async () => null, today: () => '31/12/2026' };

function state({ store, company }: ReturnType<typeof setup>) {
  const docs = (['income', 'expense'] as const).flatMap((kind) =>
    store.documents(company.id, kind, {}, 500, 0).map((d) => [d.mark, kind, d.status]));
  const wm = Object.fromEntries(['income:RequestTransmittedDocs', 'expense:RequestDocs', 'expense:RequestTransmittedDocs']
    .map((k) => [k, store.setting(`mark_wm:${k}:${company.id}`)]));
  return { docs: docs.sort((a, b) => (a[0] < b[0] ? -1 : 1)), wm };
}

test('τρία διαδοχικά πατήματα όπως το desktop', async () => {
  const s = setup();
  const round = { n: 0 };
  for (const expected of golden.marks) {
    round.n += 1;
    const outcomes = await fetchNewBooks({ ...base, ...s, fetchFn: network(round) });
    assert.ok(outcomes.every((o) => o.ok), JSON.stringify(outcomes));
    assert.deepEqual(state(s), expected, `πάτημα ${round.n}`);
  }
});

test('η δεύτερη λήψη ζητά μόνο από το MARK, χωρίς ημερομηνίες για τα νέα', async () => {
  const s = setup();
  const round = { n: 1 };
  await fetchNewBooks({ ...base, ...s, fetchFn: network(round) });
  const calls: string[] = [];
  round.n = 2;
  const w = s.store.setting(`mark_wm:expense:RequestDocs:${s.company.id}`);
  await fetchNewBooks({ ...base, ...s, fetchFn: network(round, calls) });
  assert.ok(calls.some((u) => u.includes('RequestDocs?') && u.includes(`mark=${w}`) && !u.includes('dateFrom')));
  // Τρίτο πάτημα χωρίς νέα: καμία κλήση διαστήματος.
  const quiet: string[] = [];
  round.n = 3;
  await fetchNewBooks({ ...base, ...s, fetchFn: network(round, quiet) });
  assert.ok(quiet.every((u) => !u.includes('dateFrom')), quiet.join('\n'));
  assert.equal(quiet.length, 2); // έσοδα και έξοδα έχουν ίδιο W στο RequestTransmittedDocs: μία κλήση
});

test('σφάλμα στη δέλτα δεν προχωρά το W, οπότε τίποτα δεν χάνεται', async () => {
  const s = setup();
  const round = { n: 1 };
  await fetchNewBooks({ ...base, ...s, fetchFn: network(round) });
  const before = state(s).wm;
  const down: Fetch = async () => ({ status: 503, text: async () => 'x' });
  const outcomes = await fetchNewBooks({ ...base, ...s, fetchFn: down });
  assert.ok(outcomes.every((o) => !o.ok));
  assert.deepEqual(state(s).wm, before);
});

test('άδειο βιβλίο παίρνει το MARK του άλλου· χωρίς κανένα μένει σε αρχική λήψη', async () => {
  const empty = since.empty;
  const s = setup();
  const noIncome: Fetch = async (url) => {
    const endpoint = url.split('?')[0].split('/').pop()!;
    const body = endpoint === 'RequestTransmittedDocs' ? empty
      : pages[endpoint + (url.includes('nextPartitionKey') ? '.2' : '')];
    return { status: 200, text: async () => body };
  };
  await fetchNewBooks({ ...base, ...s, fetchFn: noIncome });
  assert.ok(markReady(s.store, s.company.id, 'income'));
  assert.equal(s.store.setting(`mark_wm:income:RequestTransmittedDocs:${s.company.id}`), '114');

  const t = setup();
  const nothing: Fetch = async (url) => ({ status: 200, text: async () => (url.includes('Info') ? '<r/>' : empty) });
  const outcomes = await fetchNewBooks({ ...base, ...t, fetchFn: nothing });
  assert.ok(!markReady(t.store, t.company.id, 'income'));
  assert.match(outcomes[0].message, /κανένα παραστατικό ακόμα/);
});

test('λήψη περιόδου δεν αγγίζει τα MARK', async () => {
  const s = setup();
  await fetchBooks({ ...base, ...s, from: '01/01/2026', to: '30/06/2026', fetchFn: network({ n: 1 }) });
  assert.ok(!markReady(s.store, s.company.id, 'expense'));
  assert.equal(s.store.setting(`mark_start:expense:${s.company.id}`), null);
});

test('αλλαγή ΑΦΜ ή περιβάλλοντος ξεχνά τα MARK', async () => {
  const s = setup();
  await fetchNewBooks({ ...base, ...s, fetchFn: network({ n: 1 }) });
  assert.ok(markReady(s.store, s.company.id, 'expense'));
  s.store.updateCompany({ ...s.company, name: 'Νέο όνομα' });
  assert.ok(markReady(s.store, s.company.id, 'expense'));
  s.store.updateCompany({ ...s.company, env: 'dev' });
  assert.ok(!markReady(s.store, s.company.id, 'expense'));
});

test('διαγραφή εταιρείας σβήνει και τα MARK, χωρίς να αγγίζει άλλη', async () => {
  const s = setup();
  const other = s.store.addCompany({ name: 'Άλλη', vat: '999999999', env: 'prod', via_accountant: 0 });
  s.store.setSetting(`mark_start:income:${other}`, '2026-01-01');
  await fetchNewBooks({ ...base, ...s, fetchFn: network({ n: 1 }) });
  s.store.deleteCompany(s.company.id);
  assert.equal(s.store.setting(`mark_start:expense:${s.company.id}`), null);
  assert.equal(s.store.setting(`mark_start:income:${other}`), '2026-01-01');
});
