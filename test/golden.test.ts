// Ίδια XML, ίδιο αποτέλεσμα με τον Python client από τον οποίο μεταφέρθηκε ο κώδικας (test/golden.json).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { MyDataClient, MyDataError, todayGr, type Fetch } from '../src/aade/client.ts';
import type { Invoice } from '../src/aade/parse.ts';
import { parseXml } from '../src/aade/xml.ts';
import { elAmount, elDate, round2, yearlyTotals } from '../src/book/yearly.ts';

const dir = new URL('./fixtures/', import.meta.url);
const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const pages = Object.fromEntries(
  readdirSync(dir).filter((f: string) => f.endsWith('.xml')).map((f: string) => [f.replace('.xml', ''), readFileSync(new URL(f, dir), 'utf8')]),
);

type Call = { url: string; method: string };

function fakeFetch(calls: Call[] = []): Fetch {
  return async (url, init) => {
    calls.push({ url, method: init.method });
    const endpoint = url.split('?')[0].split('/').pop()!;
    const name = endpoint + (url.includes('nextPartitionKey') ? '.2' : '');
    return { status: 200, text: async () => pages[name] };
  };
}

const client = (fetchFn: Fetch) => new MyDataClient(
  { userId: 'u', subscriptionKey: 'k', env: 'prod', ownVat: golden.own_vat }, fetchFn, () => golden.today,
);

// Μόνο τα πεδία του golden: τα υπόλοιπα είναι εσωτερικά, και το JSON ενοποιεί undefined/-0.
function pick(i: Invoice, sample: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(Object.fromEntries(Object.keys(sample).map((k) => [k, (i as any)[k]]))));
}

function compare(actual: { unclassified: Invoice[]; classified: Invoice[]; cancelled: Set<string> }, expected: any) {
  for (const key of ['unclassified', 'classified'] as const) {
    assert.deepEqual(actual[key].map((i) => i.mark), expected[key].map((i: any) => i.mark), key);
    actual[key].forEach((inv, n) => assert.deepEqual(pick(inv, expected[key][n]), expected[key][n], inv.mark));
  }
  assert.deepEqual([...actual.cancelled].sort(), expected.cancelled);
}

test('έξοδα όπως ο Python client', async () => {
  compare(await client(fakeFetch()).expenses(golden.from, golden.to), golden.expenses);
});

test('έσοδα όπως ο Python client', async () => {
  compare(await client(fakeFetch()).income(golden.from, golden.to), golden.income);
});

test('συνοπτικό βιβλίο όπως το desktop', () => {
  const norm = (o: unknown) => JSON.parse(JSON.stringify(o));
  assert.deepEqual(norm(yearlyTotals(golden.yearly.docs, true)), golden.yearly.with_stock);
  assert.deepEqual(norm(yearlyTotals(golden.yearly.docs, false)), golden.yearly.without_stock);
});

test('στρογγυλοποίηση όπως το round() της Python', () => {
  for (const [x, expected] of golden.round) assert.equal(round2(x) + 0, expected + 0, String(x));
});

test('μορφοποίηση ποσών και ημερομηνιών', () => {
  for (const [x, expected] of golden.amounts) assert.equal(elAmount(x), expected, String(x));
  for (const [x, expected] of golden.dates) assert.equal(elDate(x), expected, String(x));
});

test('το «σήμερα» ακολουθεί την ώρα Ελλάδας', () => {
  assert.equal(todayGr(new Date('2026-12-31T23:30:00Z')), '01/01/2027');
  assert.equal(todayGr(new Date('2026-07-01T10:00:00Z')), '01/07/2026');
});

test('μόνο GET και μόνο στον host της ΑΑΔΕ', async () => {
  const calls: Call[] = [];
  const c = client(fakeFetch(calls));
  await c.expenses(golden.from, golden.to);
  await c.income(golden.from, golden.to);
  assert.ok(calls.length >= 6);
  for (const call of calls) {
    assert.equal(call.method, 'GET');
    assert.ok(call.url.startsWith('https://mydatapi.aade.gr/myDATA/Request'), call.url);
  }
});

test('το RequestTransmittedDocs ζητείται μία φορά ανά client', async () => {
  const calls: Call[] = [];
  const c = client(fakeFetch(calls));
  await c.expenses(golden.from, golden.to);
  await c.income(golden.from, golden.to);
  assert.equal(calls.filter((x) => x.url.includes('RequestTransmittedDocs')).length, 1);
});

test('κλειδιά λογιστή: entityVatNumber σε κάθε κλήση', async () => {
  const calls: Call[] = [];
  const c = new MyDataClient(
    { userId: 'u', subscriptionKey: 'k', env: 'dev', entityVat: '111111111', ownVat: '111111111' },
    fakeFetch(calls), () => golden.today,
  );
  await c.income(golden.from, golden.to);
  assert.ok(calls.every((x) => x.url.includes('entityVatNumber=111111111')));
  assert.ok(calls.every((x) => x.url.startsWith('https://mydataapidev.aade.gr/')));
});

test('401 και λοιπά HTTP σφάλματα', async () => {
  const status = (code: number): Fetch => async () => ({ status: code, text: async () => 'x' });
  await assert.rejects(client(status(401)).income(golden.from, golden.to), /401/);
  await assert.rejects(client(status(500)).income(golden.from, golden.to), MyDataError);
});

test('αποτυχία E3Info δεν ρίχνει τη λήψη', async () => {
  const base = fakeFetch();
  const flaky: Fetch = async (url, init) =>
    (url.includes('RequestE3Info') ? { status: 500, text: async () => 'x' } : base(url, init));
  const r = await client(flaky).expenses(golden.from, golden.to);
  assert.ok(r.unclassified.some((i) => i.mark === '107'));
});

test('μεγάλη σελίδα με πολλά &amp; αναλύεται', () => {
  const many = '<a>' + '<b>Α &amp; Β &#39;Γ&#39;</b>'.repeat(20000) + '</a>';
  const root = parseXml(many);
  assert.equal(root.kids.length, 20000);
  assert.equal(root.kids[19999].text, "Α & Β 'Γ'");
});
