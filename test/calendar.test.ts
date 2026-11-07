// Ημερολόγιο και ελεύθερο διάστημα αυτόματης λήψης.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatHours, parseHours } from '../src/book/auto.ts';
import { formatGr, monthGrid, parseGr, shiftMonth } from '../src/book/calendar.ts';

test('ο μήνας ξεκινά στη σωστή θέση, με πρώτη τη Δευτέρα', () => {
  const nov = monthGrid(2026, 11); // 1/11/2026 είναι Κυριακή
  assert.deepEqual(nov[0], [null, null, null, null, null, null, 1]);
  assert.deepEqual(nov[1], [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(nov[nov.length - 1][0], 30);
  assert.ok(nov.every((w) => w.length === 7));
  assert.deepEqual(monthGrid(2026, 6)[0], [1, 2, 3, 4, 5, 6, 7]); // 1/6/2026 είναι Δευτέρα
});

test('Φεβρουάριος και δίσεκτα', () => {
  const days = (y: number) => monthGrid(y, 2).flat().filter(Boolean).length;
  assert.equal(days(2024), 29);
  assert.equal(days(2026), 28);
});

test('αλλαγή μήνα πέρα από το έτος', () => {
  assert.deepEqual(shiftMonth(2026, 1, -1), { y: 2025, m: 12 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(shiftMonth(2026, 6, 0), { y: 2026, m: 6 });
});

test('ελληνική μορφή ημερομηνίας', () => {
  assert.equal(formatGr({ y: 2026, m: 3, d: 5 }), '05/03/2026');
  assert.deepEqual(parseGr('05/03/2026'), { y: 2026, m: 3, d: 5 });
  assert.equal(parseGr('2026-03-05'), null);
});

test('ώρες αυτόματης λήψης: ό,τι θέλει ο χρήστης, μέσα στα όρια', () => {
  assert.equal(parseHours('3'), 3);
  assert.equal(parseHours('1,5'), 1.5);
  assert.equal(parseHours(' 0.25 '), 0.25);
  assert.equal(parseHours('168'), 168);
  for (const bad of ['', '0', '0,1', '-2', 'αβγ', '9000']) assert.equal(parseHours(bad), null, bad);
  assert.equal(formatHours(1.5), '1,5');
});
