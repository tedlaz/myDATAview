// Υπολογισμοί πίνακα ελέγχου: καθαρό κέρδος από τα ποσά Ε3, κορυφαίοι συναλλασσόμενοι, ΦΠΑ τριμήνων, άξονας γραφημάτων.
import { CREDIT_INVOICE_TYPES } from '../codes.ts';
import type { Doc, VatPeriod } from '../store.ts';
import { QUARTERS, monthRows, round2, sumTotals, shortMonth, yearlyTotals, type MonthRow, type YearlyDoc } from './yearly.ts';

const ASSET_CATEGORY = 'category2_7';
const DEPRECIATION_TYPE = 'E3_587';
const OPENING_STOCK = 'category2_13';
const CLOSING_STOCK = 'category2_14';
const STOCK_CATEGORIES = [OPENING_STOCK, CLOSING_STOCK];
const PURCHASE_CATEGORIES = ['category2_1', 'category2_2']; // εμπορεύματα, πρώτες ύλες
const TOP_COUNT = 5;

type E3Entry = { type?: string | null; category?: string | null; amount?: number | null };
type Group = { type: string; category: string; amount: number; count: number; depreciation: boolean };

const entries = (d: { cls_json: string | null }) => JSON.parse(d.cls_json || '[]') as E3Entry[];

/** Οι χαρακτηρισμοί Ε3 (όχι ΦΠΑ) ανά (τύπος, κατηγορία). Τα πιστωτικά αφαιρούνται. */
function e3Breakdown(docs: YearlyDoc[]): Group[] {
  const groups = new Map<string, Group>();
  for (const d of docs) {
    const sign = CREDIT_INVOICE_TYPES.has(d.invoice_type ?? '') ? -1 : 1;
    const seen = new Set<string>();
    for (const e of entries(d)) {
      const type = e.type || '';
      const category = e.category || '';
      if (type.startsWith('VAT_') || !(type || category)) continue;
      const key = `${type}|${category}`;
      const g = groups.get(key) ?? { type, category, amount: 0, count: 0, depreciation: type.startsWith(DEPRECIATION_TYPE) };
      groups.set(key, g);
      g.amount += sign * (e.amount || 0);
      if (!seen.has(key)) {
        g.count += 1;
        seen.add(key);
      }
    }
  }
  return [...groups.values()].map((g) => ({ ...g, amount: round2(g.amount) }));
}

const total = (rows: Group[]) => round2(rows.reduce((t, g) => t + g.amount, 0));

/** Αποτελέσματα χρήσης: έσοδα − κόστος πωληθέντων − έξοδα χρήσης. Τα πάγια χωριστά: στο κέρδος μόνο οι αποσβέσεις. */
export function profitLoss(incomeDocs: YearlyDoc[], expenseDocs: YearlyDoc[]) {
  const income = e3Breakdown(incomeDocs);
  const expense = e3Breakdown(expenseDocs);
  const of = (cats: string[]) => expense.filter((g) => cats.includes(g.category));
  const opening = of([OPENING_STOCK]);
  const purchases = of(PURCHASE_CATEGORIES);
  const closing = of([CLOSING_STOCK]);
  const assets = of([ASSET_CATEGORY]);
  const excluded = [...STOCK_CATEGORIES, ...PURCHASE_CATEGORIES, ASSET_CATEGORY];
  const other = expense.filter((g) => !excluded.includes(g.category));
  const inc_total = total(income);
  const opening_total = total(opening);
  const purchases_total = total(purchases);
  const closing_total = total(closing);
  const exp_total = total(other);
  const cogs = round2(opening_total + purchases_total - closing_total);
  const gross = round2(inc_total - cogs);
  return {
    inc_total, opening_total, purchases_total, closing_total, exp_total, cogs, gross,
    assets_total: total(assets),
    depreciation: total(other.filter((g) => g.depreciation)),
    profit: round2(gross - exp_total),
    hasOpening: opening.length > 0, hasClosing: closing.length > 0, hasPurchases: purchases.length > 0,
  };
}

/** Χωρίς αποθέματα έναρξης και λήξης, το αποτέλεσμα χρήσης με κόστος πωληθέντων είναι επισφαλές. */
export function stockCheck(expenseDocs: YearlyDoc[], previousDocs: YearlyDoc[], year: string, currentYear: string) {
  const st = profitLoss([], expenseDocs);
  const prev = profitLoss([], previousDocs);
  const source = st.hasOpening || prev.hasClosing;
  const used = source && st.hasClosing;
  const why = used ? null
    : !source && !st.hasClosing ? 'χωρίς εγγραφές αποθεμάτων'
      : source && year === currentYear ? 'ανοιχτή χρήση: τα αποθέματα λήξης δηλώνονται στο κλείσιμο'
        : source ? 'χωρίς αποθέματα λήξης'
          : `χωρίς αποθέματα έναρξης (ούτε λήξης στο ${Number(year) - 1})`;
  return { used, why, unsure: !used && (source || st.hasClosing || st.hasPurchases) };
}

export type Counterparty = { vat: string | null; name: string; amount: number; n: number };

/** Καθαρή αξία ανά συναλλασσόμενο (πιστωτικά αρνητικά). stock: αφαιρεί τα αποθέματα, που δεν είναι αγορά από αυτόν. */
export function counterpartyTotals(docs: Pick<Doc, 'vat' | 'name' | 'invoice_type' | 'total_net' | 'cls_json'>[], stock: boolean): Counterparty[] {
  const out = new Map<string | null, Counterparty>();
  for (const d of docs) {
    const sign = CREDIT_INVOICE_TYPES.has(d.invoice_type ?? '') ? -1 : 1;
    const held = stock
      ? entries(d).filter((e) => STOCK_CATEGORIES.includes(e.category ?? '')).reduce((t, e) => t + (e.amount || 0), 0)
      : 0;
    const net = (d.total_net || 0) - held;
    if (!net) continue;
    const t = out.get(d.vat) ?? { vat: d.vat, name: d.name || d.vat || '—', amount: 0, n: 0 };
    out.set(d.vat, t);
    t.amount += sign * net;
    t.n += 1;
  }
  return [...out.values()].sort((a, b) => b.amount - a.amount).slice(0, TOP_COUNT);
}

export type VatTile = { label: string; output: number; input: number; diff: number; partial: boolean };

function vatTile(label: string, part: MonthRow[], partial: boolean): VatTile {
  const output = round2(part.reduce((t, r) => t + r.income.vat, 0));
  const input = round2(part.reduce((t, r) => t + r.expense.vat, 0));
  return { label, output, input, diff: round2(output - input), partial };
}

/**
 * ΦΠΑ εκροών/εισροών κατά την περίοδο ΦΠΑ της εταιρείας. Τρίμηνο που δεν έκλεισε αθροίζει όσους μήνες υπάρχουν·
 * running: το έτος τρέχει, άρα ο τελευταίος μήνας δεν έχει κλείσει.
 */
export function vatPeriods(rows: MonthRow[], period: VatPeriod, running: boolean): VatTile[] {
  if (period === 'm') {
    return rows.map((r, i) => vatTile(shortMonth(i + 1), [r], running && i === rows.length - 1));
  }
  const out = [];
  for (let q = 0; q < rows.length; q += 3) {
    const part = rows.slice(q, q + 3);
    out.push(vatTile(`${QUARTERS[q / 3]} τρίμ.`, part, part.length < 3));
  }
  return out;
}

/** Στρογγυλό βήμα άξονα (1/2/2.5/5 × 10ⁿ) ώστε περίπου ticks γραμμές να καλύπτουν το top. */
export function niceStep(top: number, ticks = 4): number {
  const raw = Math.max(top, 1) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw)!;
}

export function axis(top: number): { ymax: number; ticks: number[] } {
  const step = niceStep(top);
  const n = Math.max(1, Math.ceil(top / step));
  return { ymax: step * n, ticks: Array.from({ length: n + 1 }, (_, k) => step * k) };
}

/** Όλα όσα δείχνει ο πίνακας ελέγχου για ένα έτος. */
export function dashboard(o: {
  income: Doc[]; expense: Doc[]; previousExpense: Doc[]; year: string; currentYear: string; lastMonth: number; withUnclassified: boolean; vatPeriod: VatPeriod;
}) {
  const classified = (docs: Doc[]) => docs.filter((d) => d.status === 'classified');
  const incomeDone = classified(o.income);
  const expenseDone = classified(o.expense);
  const previousDone = classified(o.previousExpense);
  const pick = (docs: Doc[], done: Doc[]) => (o.withUnclassified ? docs : done);

  const incomeMonths = yearlyTotals(pick(o.income, incomeDone), false);
  const expenseMonths = yearlyTotals(pick(o.expense, expenseDone), false);
  const rows = monthRows(incomeMonths, expenseMonths, o.year, o.lastMonth);
  const inc = sumTotals(rows.map((r) => r.income));
  const exp = sumTotals(rows.map((r) => r.expense));

  const assetsNow = yearlyTotals(expenseDone);
  const assetsBefore = yearlyTotals(previousDone);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const bought = months.slice(0, o.lastMonth).map((m) => assetsNow[m].assets);
  const previouslyBought = months.map((m) => assetsBefore[m].assets);
  const add = (values: number[]) => round2(values.reduce((t, v) => t + v, 0));

  return {
    kpi: { income: inc.net, expense: exp.net, result: round2(inc.net - exp.net), vat: round2(inc.vat - exp.vat) },
    rows,
    vat: vatPeriods(rows, o.vatPeriod, o.year === o.currentYear),
    pl: profitLoss(incomeDone, expenseDone),
    stock: stockCheck(expenseDone, previousDone, o.year, o.currentYear),
    progress: {
      expenseDone: expenseDone.length, expenseTotal: o.expense.length,
      incomeDone: incomeDone.length, incomeTotal: o.income.length,
    },
    assets: {
      labels: months.map(shortMonth),
      bought, previouslyBought,
      total: add(bought), previousTotal: add(previouslyBought),
      booked: add(months.slice(0, o.lastMonth).map((m) => assetsNow[m].depreciation)),
      previousBooked: add(months.map((m) => assetsBefore[m].depreciation)),
    },
    topCustomers: counterpartyTotals(o.income.filter((d) => d.vat), false), // λιανική χωρίς ΑΦΜ δεν είναι πελάτης
    topSuppliers: counterpartyTotals(o.expense, true),
  };
}
