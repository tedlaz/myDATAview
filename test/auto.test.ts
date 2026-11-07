// Αυτόματη λήψη: πότε τρέχει, για ποιες εταιρείες, και ότι δεν ρίχνει ποτέ σφάλμα.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fetch } from '../src/aade/client.ts';
import { autoHours, autoStatus, dueCompanies, formatCountdown, nextAutoAt, nextDueAt, restartAuto, runAuto, setAutoHours } from '../src/book/auto.ts';
import { Store } from '../src/store.ts';
import { loadPages, memoryDb } from './helpers.ts';

const since = loadPages('./fixtures/since/');
const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const keys = { userId: 'u', subscriptionKey: 'k' };
const quiet: Fetch = async () => ({ status: 200, text: async () => since.empty });

function setup(ready = true) {
  const store = new Store(memoryDb());
  const id = store.addCompany({ name: 'Α', vat: '111111111', env: 'prod', via_accountant: 0 });
  if (ready) {
    for (const k of ['income', 'expense']) store.setSetting(`mark_start:${k}:${id}`, '2026-01-01');
    for (const k of ['income:RequestTransmittedDocs', 'expense:RequestDocs', 'expense:RequestTransmittedDocs']) {
      store.setSetting(`mark_wm:${k}:${id}`, '500');
    }
  }
  return { store, id };
}
const run = (store: Store, now: number, fetchFn: Fetch = quiet, loadKeys = async () => keys as typeof keys | null) =>
  runAuto({ store, loadKeys, lookup: async () => null, now, fetchFn, today: () => '31/12/2026' });

test('ανενεργή εξ ορισμού: δεν τρέχει τίποτα', async () => {
  const { store } = setup();
  assert.equal(autoHours(store), 0);
  assert.equal(await run(store, NOW), 0);
});

test('τρέχει μετά το διάστημα και όχι νωρίτερα', async () => {
  const { store, id } = setup();
  setAutoHours(store, 1);
  assert.equal(await run(store, NOW), 1);
  assert.equal(await run(store, NOW + HOUR - 1), 0);
  assert.equal(await run(store, NOW + HOUR), 1);
  assert.equal(autoStatus(store, id)?.at, NOW + HOUR);
  assert.match(autoStatus(store, id)!.result, /0 νέα παραστατικά/);
});

test('επόμενη λήψη: μετρά από την τελευταία και ακολουθεί το διάστημα', async () => {
  const { store, id } = setup();
  setAutoHours(store, 2);
  assert.ok(nextAutoAt(store, id, 2)! <= NOW); // δεν έχει τρέξει ποτέ: αμέσως
  await run(store, NOW);
  assert.equal(nextAutoAt(store, id, 2), NOW + 2 * HOUR);
  assert.equal(nextAutoAt(store, id, 1.5), NOW + 1.5 * HOUR); // αλλαγή διαστήματος
  assert.equal(dueCompanies(store, NOW + 2 * HOUR - 1).length, 0);
  assert.equal(dueCompanies(store, NOW + 2 * HOUR).length, 1);
  assert.equal(nextAutoAt(setup(false).store, 1, 2), null);
});

test('πιο κοντινή λήψη: καμία αν είναι ανενεργή ή δεν υπάρχει έτοιμη εταιρεία', async () => {
  const { store } = setup();
  assert.equal(nextDueAt(store), null);
  setAutoHours(store, 3);
  await run(store, NOW);
  assert.equal(nextDueAt(store), NOW + 3 * HOUR);
  setAutoHours(store, 0);
  assert.equal(nextDueAt(store), null);
  const empty = setup(false).store;
  setAutoHours(empty, 1);
  assert.equal(nextDueAt(empty), null);
});

test('αλλαγή διαστήματος ειδοποιεί τον χρονοδιακόπτη', () => {
  const { store } = setup();
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  setAutoHours(store, 5);
  assert.equal(calls, 1);
});

test('χειροκίνητη λήψη ξαναρχίζει τον χρόνο, μόνο αν πέτυχε και η αυτόματη είναι ενεργή', async () => {
  const { store, id } = setup();
  const ok = [{ kind: 'income' as const, ok: true, message: 'Έσοδα: 0 νέα.' }, { kind: 'expense' as const, ok: false, message: 'Έξοδα: σφάλμα' }];
  const failed = ok.map((o) => ({ ...o, ok: false }));

  restartAuto(store, id, ok, NOW); // ανενεργή: τίποτα
  assert.equal(autoStatus(store, id), null);

  setAutoHours(store, 2);
  await run(store, NOW);
  restartAuto(store, id, failed, NOW + HOUR); // όλα απέτυχαν: μένει η ώρα της
  assert.equal(nextAutoAt(store, id, 2), NOW + 2 * HOUR);

  let calls = 0;
  store.subscribe(() => { calls += 1; });
  restartAuto(store, id, ok, NOW + HOUR);
  assert.equal(nextAutoAt(store, id, 2), NOW + 3 * HOUR);
  assert.equal(autoStatus(store, id)?.at, NOW + HOUR);
  assert.match(autoStatus(store, id)!.result, /0 νέα/);
  assert.equal(calls, 1); // ο χρονοδιακόπτης ξαναστήνεται
  assert.equal(await run(store, NOW + 2 * HOUR), 0); // η παλιά ώρα δεν ισχύει πια
  assert.equal(await run(store, NOW + 3 * HOUR), 1);
});

test('μορφή αντίστροφης μέτρησης', () => {
  assert.equal(formatCountdown(HOUR + 5 * 60_000 + 3000), '01:05:03');
  assert.equal(formatCountdown(500), '00:00:01'); // ποτέ 00:00:00 όσο απομένει χρόνος
  assert.equal(formatCountdown(0), '00:00:00');
  assert.equal(formatCountdown(-5000), '00:00:00');
  assert.equal(formatCountdown(26 * HOUR), '1 ημ. 02:00:00');
});

test('εταιρεία χωρίς αρχική λήψη δεν ανακτάται', () => {
  const { store } = setup(false);
  setAutoHours(store, 1);
  assert.equal(dueCompanies(store, NOW).length, 0);
});

test('σφάλμα δικτύου γράφεται και δεν ξαναδοκιμάζει πριν το επόμενο διάστημα', async () => {
  const { store, id } = setup();
  setAutoHours(store, 2);
  const down: Fetch = async () => ({ status: 503, text: async () => 'x' });
  await run(store, NOW, down);
  assert.match(autoStatus(store, id)!.result, /HTTP 503/);
  assert.equal(store.setting(`mark_wm:expense:RequestDocs:${id}`), '500');
  assert.equal(dueCompanies(store, NOW + HOUR).length, 0);
});

test('χωρίς κλειδιά δεν γίνεται κλήση', async () => {
  const { store, id } = setup();
  setAutoHours(store, 1);
  let called = false;
  await run(store, NOW, async () => { called = true; return { status: 200, text: async () => '' }; }, async () => null);
  assert.ok(!called);
  assert.equal(autoStatus(store, id)?.result, 'Λείπουν τα κλειδιά ΑΑΔΕ.');
});

test('σφάλμα ανάγνωσης κλειδιών δεν ρίχνει την εργασία', async () => {
  const { store, id } = setup();
  setAutoHours(store, 1);
  await run(store, NOW, quiet, async () => { throw new Error('κλειδωμένη συσκευή'); });
  assert.match(autoStatus(store, id)!.result, /κλειδωμένη συσκευή/);
});

test('δεύτερη ταυτόχρονη κλήση δεν ξεκινά δεύτερη λήψη', async () => {
  const { store } = setup();
  setAutoHours(store, 1);
  const [a, b] = await Promise.all([run(store, NOW), run(store, NOW)]);
  assert.deepEqual([a, b], [1, 0]);
});

test('διαγραφή εταιρείας καθαρίζει και την αυτόματη λήψη', async () => {
  const { store, id } = setup();
  setAutoHours(store, 1);
  await run(store, NOW);
  store.deleteCompany(id);
  assert.equal(autoStatus(store, id), null);
});
