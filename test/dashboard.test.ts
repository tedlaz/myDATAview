// Πίνακας ελέγχου: ίδια αποτελέσματα με το desktop (golden-dashboard.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { axis, counterpartyTotals, dashboard, niceStep, profitLoss, stockCheck, vatPeriods } from '../src/book/dashboard.ts';
import { monthRows, tableRows, yearlyTotals } from '../src/book/yearly.ts';
import type { Doc } from '../src/store.ts';

const golden = JSON.parse(readFileSync(new URL('./golden-dashboard.json', import.meta.url), 'utf8'));

test('καθαρό κέρδος όπως το desktop', () => {
  const { hasOpening, hasClosing, hasPurchases, ...pl } = profitLoss(golden.inc, golden.exp);
  assert.deepEqual(pl, golden.pl);
});

test('κορυφαίοι πελάτες και προμηθευτές', () => {
  assert.deepEqual(counterpartyTotals(golden.exp, true), golden.top);
  assert.deepEqual(counterpartyTotals(golden.inc, false), golden.top_in);
});

test('έλεγχος αποθεμάτων σε όλες τις περιπτώσεις', () => {
  for (const s of golden.stock) {
    assert.deepEqual(stockCheck(s.exp, s.prev, s.year, s.now), s.stock, s.label);
  }
});

test('βήμα άξονα', () => {
  for (const [top, step] of golden.steps) assert.equal(niceStep(top), step, String(top));
  assert.deepEqual(axis(0), { ymax: 0.25, ticks: [0, 0.25] });
  assert.deepEqual(axis(2600), { ymax: 3000, ticks: [0, 1000, 2000, 3000] });
});

test('ΦΠΑ ανά μήνα για μηνιαίο ΦΠΑ: ο τελευταίος μήνας τρέχοντος έτους σε εξέλιξη', () => {
  const rows = golden.vat_rows;
  const m = vatPeriods(rows, 'm', true);
  assert.equal(m.length, rows.length);
  rows.forEach((r: any, i: number) => {
    assert.deepEqual([m[i].output, m[i].input, m[i].diff], [r.vat_month.out, r.vat_month.in, r.vat_month.diff]);
  });
  assert.deepEqual(m.map((t) => t.partial).filter(Boolean).length, 1);
  assert.equal(m[m.length - 1].partial, true);
  assert.ok(vatPeriods(rows, 'm', false).every((t) => !t.partial));
  assert.equal(m[0].label, 'Ιαν.');
});

test('ΦΠΑ ανά τρίμηνο, με μισό τρίμηνο σε εξέλιξη', () => {
  const rows = golden.vat_rows;
  const q = vatPeriods(rows, 'q', true);
  assert.equal(q.length, 4);
  rows.forEach((r: any, i: number) => {
    if (i % 3) return;
    const t = q[i / 3];
    assert.deepEqual([t.output, t.input, t.diff, t.partial],
      [r.vat_quarter.out, r.vat_quarter.in, r.vat_quarter.diff, r.vat_quarter.partial]);
  });
});

test('πίνακας ανά τρίμηνο: τα σύνολα μένουν ίδια με τους μήνες', () => {
  const totals = yearlyTotals(golden.exp, true);
  const empty = yearlyTotals([], true);
  const rows = monthRows(totals, empty, '2026', 11);
  const quarters = tableRows(rows, '2026', true);
  assert.deepEqual(quarters.map((q) => q.label), ['Α΄ τρίμ. 2026', 'Β΄ τρίμ. 2026', 'Γ΄ τρίμ. 2026', 'Δ΄ τρίμ. 2026']);
  assert.ok(quarters.every((q) => q.month === null));
  const sum = (list: { income: { net: number } }[]) => list.reduce((t, r) => t + r.income.net, 0);
  assert.ok(Math.abs(sum(quarters) - sum(rows)) < 0.01);
  assert.equal(tableRows(rows, '2026', false)[0].month, '2026-01');
});

const doc = (over: Partial<Doc>): Doc => ({
  company_id: 1, mark: '1', kind: 'income', status: 'classified', vat: '1', name: 'Α', series: null, aa: null, total_gross: 124,
  lines_json: '[]', taxes_json: '[]', classification_mark: '', url: null, issue_date: '2026-03-01', invoice_type: '1.1', cls_json: '[]',
  total_net: 100, total_vat: 24, total_withheld: 0, total_other_taxes: 0, total_stamp_duty: 0, total_fees: 0, total_deductions: 0, ...over,
});

test('ο διακόπτης αχαρακτήριστων αλλάζει τα σύνολα, όχι το κέρδος Ε3', () => {
  const income = [doc({ mark: '1' }), doc({ mark: '2', status: 'unclassified', total_net: 50, total_vat: 12 })];
  const expense = [doc({ mark: '3', kind: 'expense', status: 'unclassified', total_net: 40, total_vat: 9.6 })];
  const run = (withUnclassified: boolean) => dashboard({
    income, expense, previousExpense: [], year: '2026', currentYear: '2026', lastMonth: 3, withUnclassified, vatPeriod: 'q',
  });
  assert.deepEqual(run(true).kpi, { income: 150, expense: 40, result: 110, vat: 26.4 });
  assert.deepEqual(run(false).kpi, { income: 100, expense: 0, result: 100, vat: 24 });
  assert.equal(run(true).pl.profit, run(false).pl.profit);
  assert.deepEqual(run(true).progress, { expenseDone: 0, expenseTotal: 1, incomeDone: 1, incomeTotal: 2 });
  assert.equal(run(true).rows.length, 3);
});

test('η λιανική χωρίς ΑΦΜ δεν είναι πελάτης', () => {
  const data = dashboard({
    income: [doc({ vat: null, name: null })], expense: [], previousExpense: [],
    year: '2026', currentYear: '2026', lastMonth: 12, withUnclassified: true, vatPeriod: 'm',
  });
  assert.equal(data.topCustomers.length, 0);
});
