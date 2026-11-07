// Συνοπτικό βιβλίο: σύνολα ανά μήνα, με τον ίδιο υπολογισμό που έχει και το myDATA Classifier.
import { CREDIT_INVOICE_TYPES } from '../codes.ts';

export const COLUMNS = ['net', 'vat', 'withheld', 'other_taxes', 'stamp_duty', 'fees', 'deductions',
  'third_party', 'assets', 'depreciation', 'stock'] as const;
export type Column = (typeof COLUMNS)[number];
export type Totals = Record<Column, number>;

// Στήλες του πίνακα, μετά την καθαρή αξία.
export const TABLE_COLUMNS: [Column, string][] = [
  ['vat', 'ΦΠΑ'], ['withheld', 'Φόροι παρακρ.'], ['other_taxes', 'Λοιποί φόροι'],
  ['stamp_duty', 'Ψηφιακό τέλος συν.'], ['fees', 'Τέλη'], ['deductions', 'Κρατήσεις'],
  ['third_party', 'Έσοδα/Έξοδα τρίτων'],
];

const ASSET_CATEGORY = 'category2_7'; // αγορές παγίων
const DEPRECIATION_TYPE = 'E3_587'; // αποσβέσεις
const STOCK_CATEGORIES = ['category2_13', 'category2_14']; // αποθέματα έναρξης / λήξης

export type YearlyDoc = {
  issue_date: string | null;
  invoice_type: string | null;
  cls_json: string | null;
  total_net: number | null;
  total_vat: number | null;
  total_withheld: number | null;
  total_other_taxes: number | null;
  total_stamp_duty: number | null;
  total_fees: number | null;
  total_deductions: number | null;
};

/**
 * Το round(x, 2) της Python. Ακριβής ισοπαλία υπάρχει μόνο όταν το x είναι πολλαπλάσιο του 1/8 (π.χ. 0,125):
 * η Python πάει στο ζυγό, ενώ το toFixed προς τα πάνω. Όλα τα υπόλοιπα τα στρογγυλοποιούν το ίδιο.
 */
export function round2(x: number): number {
  const eighths = x * 8;
  if (Number.isInteger(eighths) && eighths % 2 !== 0) {
    const low = Math.floor(x * 100);
    return (low % 2 === 0 ? low : low + 1) / 100;
  }
  return Number(x.toFixed(2));
}

export type MonthRow = { key: string; label: string; income: Totals; expense: Totals; balance: number };
export type TableRow = MonthRow & { month: string | null }; // month: το yyyy-mm, αν η γραμμή είναι ένας μήνας

const GREEK_MONTHS = ['Ιαν.', 'Φεβ.', 'Μαρ.', 'Απρ.', 'Μαΐ.', 'Ιουν.', 'Ιουλ.', 'Αυγ.', 'Σεπ.', 'Οκτ.', 'Νοέ.', 'Δεκ.'];
export const QUARTERS = ['Α΄', 'Β΄', 'Γ΄', 'Δ΄'];
export const shortMonth = (month: number) => GREEK_MONTHS[month - 1];
export const monthLabel = (yyyyMm: string) => `${GREEK_MONTHS[Number(yyyyMm.slice(5, 7)) - 1]} ${yyyyMm.slice(0, 4)}`;

export function sumTotals(rows: Totals[]): Totals {
  return Object.fromEntries(COLUMNS.map((c) => [c, round2(rows.reduce((t, r) => t + r[c], 0))])) as Totals;
}

/** Μήνες 1 έως last, με υπόλοιπο εσόδων − εξόδων. */
export function monthRows(income: Record<number, Totals>, expense: Record<number, Totals>, year: string, last: number): MonthRow[] {
  return Array.from({ length: last }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { key, label: monthLabel(key), income: income[i + 1], expense: expense[i + 1],
      balance: round2(income[i + 1].net - expense[i + 1].net) };
  });
}

/** Οι γραμμές του πίνακα: ανά μήνα ή ανά τρίμηνο. */
export function tableRows(rows: MonthRow[], year: string, perQuarter: boolean): TableRow[] {
  if (!perQuarter) return rows.map((r) => ({ ...r, month: r.key }));
  const out: TableRow[] = [];
  for (let q = 0; q < rows.length; q += 3) {
    const part = rows.slice(q, q + 3);
    out.push({
      key: `${year}-q${q / 3 + 1}`, label: `${QUARTERS[q / 3]} τρίμ. ${year}`, month: null,
      income: sumTotals(part.map((r) => r.income)), expense: sumTotals(part.map((r) => r.expense)),
      balance: round2(part.reduce((t, r) => t + r.balance, 0)),
    });
  }
  return out;
}

const zero = (): Totals => Object.fromEntries(COLUMNS.map((c) => [c, 0])) as Totals;

/** {μήνας 1–12: σύνολα}. Τα πιστωτικά αφαιρούνται. includeStock: τα αποθέματα μένουν στην καθαρή αξία, όπως στο myDATA. */
export function yearlyTotals(docs: YearlyDoc[], includeStock = true): Record<number, Totals> {
  const months: Record<number, Totals> = {};
  for (let m = 1; m <= 12; m++) months[m] = zero();
  for (const d of docs) {
    const row = months[Number((d.issue_date ?? '').slice(5, 7))];
    if (!row) continue;
    const sign = CREDIT_INVOICE_TYPES.has(d.invoice_type ?? '') ? -1 : 1;
    const e3 = (JSON.parse(d.cls_json || '[]') as { type?: string; category?: string; amount?: number }[])
      .filter((e) => !(e.type ?? '').startsWith('VAT_'));
    const sum = (test: (e: { type?: string; category?: string }) => boolean) =>
      e3.filter(test).reduce((total, e) => total + (e.amount || 0), 0);
    const third = sum((e) => (e.category ?? '').endsWith('_9'));
    const assets = sum((e) => e.category === ASSET_CATEGORY);
    const depreciation = sum((e) => (e.type ?? '').startsWith(DEPRECIATION_TYPE));
    const stock = sum((e) => STOCK_CATEGORIES.includes(e.category ?? ''));
    const values: [Column, number | null][] = [
      ['net', (d.total_net || 0) - (includeStock ? 0 : stock)], ['vat', d.total_vat],
      ['withheld', d.total_withheld], ['other_taxes', d.total_other_taxes], ['stamp_duty', d.total_stamp_duty],
      ['fees', d.total_fees], ['deductions', d.total_deductions], ['third_party', third],
      ['assets', assets], ['depreciation', depreciation], ['stock', stock],
    ];
    for (const [col, value] of values) row[col] += sign * (value || 0);
  }
  for (const m of Object.keys(months).map(Number)) {
    for (const c of COLUMNS) months[m][c] = round2(months[m][c]);
  }
  return months;
}

/** Ποσό με ελληνικά διαχωριστικά: 1.234,56 */
export function elAmount(value: number | null | undefined): string {
  const amount = Math.abs(value || 0) < 0.005 ? 0 : value || 0;
  const fixed = round2(Math.abs(amount)).toFixed(2);
  const [whole, cents] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${amount < 0 ? '-' : ''}${grouped},${cents}`;
}

/** Ποσό όπως στις λίστες των βιβλίων του myDATA: 2016.13 */
export const plainAmount = (value: number | null | undefined) => round2(value || 0).toFixed(2);

/** yyyy-mm-dd → dd/mm/yyyy· ό,τι άλλο μένει ως έχει. */
export function elDate(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (value ?? '');
}
