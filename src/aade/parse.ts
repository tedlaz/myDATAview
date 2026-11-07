// Ανάλυση απαντήσεων RequestDocs / RequestTransmittedDocs σε παραστατικά και χαρακτηρισμούς.
import { child, children, iter, num, text, type El } from './xml.ts';

export type Cls = {
  type?: string | null;
  category?: string | null;
  amount?: number | null;
  line?: number | null;
  transaction_mode?: string;
};
export type Tax = { type: string; category: string; amount: number | null; base?: number | null };
export type Line = {
  line_number: number;
  net_value: number;
  vat_amount: number;
  vat_category: string | null;
  has_expenses_classification: boolean;
  classifications: Cls[];
  taxes: Tax[];
};
export type Extras = {
  total_withheld: number;
  total_other_taxes: number;
  total_stamp_duty: number;
  total_fees: number;
  total_deductions: number;
};
export type Invoice = {
  mark: string;
  issuer_vat: string | null;
  issuer_name: string | null;
  counterpart_vat: string | null;
  counterpart_name: string | null;
  invoice_type: string | null;
  series: string | null;
  aa: string | null;
  issue_date: string | null;
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
  extra_totals: Extras;
  taxes: Tax[];
  lines: Line[];
  cls_info: Cls[];
  classification_mark: string;
  has_summary_classification: boolean;
  has_income_classification: boolean;
  income_classifications: Cls[];
  cancelled_by_mark: string | null;
  url: string | null;
};
export type ClsMap = Map<string, { entries: Cls[]; cls_mark: string }>;

const EXTRA_TAGS: [keyof Extras, string][] = [
  ['total_withheld', 'totalWithheldAmount'],
  ['total_other_taxes', 'totalOtherTaxesAmount'],
  ['total_stamp_duty', 'totalStampDutyAmount'],
  ['total_fees', 'totalFeesAmount'],
  ['total_deductions', 'totalDeductionsAmount'],
];
const LINE_TAX_FIELDS: [string, string, string | null][] = [
  ['1', 'withheldAmount', 'withheldPercentCategory'],
  ['2', 'feesAmount', 'feesPercentCategory'],
  ['3', 'otherTaxesAmount', 'otherTaxesPercentCategory'],
  ['4', 'stampDutyAmount', 'stampDutyPercentCategory'],
  ['5', 'deductionsAmount', null],
];
// transactionMode χαρακτηρισμού εξόδων: 1 = απόρριψη, 2 = απόκλιση.
const REJECTION_MODES = ['1', '2'];

function parseTaxes(inv: El): Tax[] {
  const out: Tax[] = [];
  for (const totals of children(inv, 'taxesTotals')) {
    for (const tax of totals.kids) {
      const amount = num(text(tax, 'taxAmount'));
      if (amount) {
        out.push({
          type: text(tax, 'taxType') || '',
          category: text(tax, 'taxCategory') || '',
          base: num(text(tax, 'underlyingValue')),
          amount,
        });
      }
    }
  }
  return out;
}

function lineTaxes(det: El): Tax[] {
  const out: Tax[] = [];
  for (const [type, amountTag, categoryTag] of LINE_TAX_FIELDS) {
    const amount = num(text(det, amountTag));
    if (amount) out.push({ type, category: (categoryTag && text(det, categoryTag)) || '', amount });
  }
  return out;
}

function clsFields(node: El, entry: Cls): void {
  for (const ch of node.kids) {
    if (ch.tag === 'classificationType') entry.type = ch.text;
    else if (ch.tag === 'classificationCategory') entry.category = ch.text;
    else if (ch.tag === 'amount') entry.amount = num(ch.text);
  }
}

function embeddedCls(parent: El, tag: string): Cls[] {
  const out: Cls[] = [];
  for (const ch of children(parent, tag)) {
    const entry: Cls = {};
    clsFields(ch, entry);
    if (Object.keys(entry).length) out.push(entry);
  }
  return out;
}

function downloadUrl(inv: El): string | null {
  for (const el of iter(inv)) {
    const value = el.text ?? '';
    // Το URL έρχεται από τρίτον: ανοίγουμε μόνο http(s).
    if (el.tag === 'downloadingInvoiceUrl' && /^https?:\/\//i.test(value)) return value;
  }
  return null;
}

export function parseInvoices(root: El): Invoice[] {
  const result: Invoice[] = [];
  for (const inv of iter(root)) {
    if (inv.tag !== 'invoice') continue;
    const issuer = child(inv, 'issuer');
    const counterpart = child(inv, 'counterpart');
    const header = child(inv, 'invoiceHeader');
    const summary = child(inv, 'invoiceSummary');

    const extra = Object.fromEntries(
      EXTRA_TAGS.map(([col, tag]) => [col, num(text(summary, tag)) || 0]),
    ) as Extras;

    const lines: Line[] = [];
    const incomeEntries: Cls[] = [];
    let hasIncome = !!summary && !!child(summary, 'incomeClassification');
    for (const det of children(inv, 'invoiceDetails')) {
      const classifications = embeddedCls(det, 'expensesClassification');
      const lineIncome = embeddedCls(det, 'incomeClassification');
      if (lineIncome.length) hasIncome = true;
      const line_number = parseInt(text(det, 'lineNumber') ?? '1', 10);
      incomeEntries.push(...lineIncome.map((e) => ({ ...e, line: line_number })));
      lines.push({
        line_number,
        net_value: num(text(det, 'netValue')) || 0,
        vat_amount: num(text(det, 'vatAmount')) || 0,
        vat_category: text(det, 'vatCategory'),
        has_expenses_classification: classifications.length > 0,
        classifications,
        taxes: lineTaxes(det),
      });
    }
    const summaryIncome = summary ? embeddedCls(summary, 'incomeClassification') : [];

    result.push({
      mark: text(inv, 'mark') || '',
      issuer_vat: text(issuer, 'vatNumber'),
      issuer_name: text(issuer, 'name'),
      counterpart_vat: text(counterpart, 'vatNumber'),
      counterpart_name: text(counterpart, 'name'),
      invoice_type: text(header, 'invoiceType'),
      series: text(header, 'series'),
      aa: text(header, 'aa'),
      issue_date: text(header, 'issueDate'),
      total_net: num(text(summary, 'totalNetValue')),
      total_vat: num(text(summary, 'totalVatAmount')),
      total_gross: num(text(summary, 'totalGrossValue')),
      extra_totals: extra,
      taxes: parseTaxes(inv),
      lines,
      cls_info: [],
      classification_mark: '',
      has_summary_classification: !!summary && !!child(summary, 'expensesClassification'),
      has_income_classification: hasIncome,
      // Η σύνοψη είναι άθροισμα των γραμμών: μόνο όταν δεν υπάρχουν γραμμές.
      income_classifications: incomeEntries.length
        ? incomeEntries
        : summaryIncome.map((e) => ({ ...e, line: null })),
      cancelled_by_mark: inv.kids.find((k) => k.tag === 'cancelledByMark' && k.text)?.text ?? null,
      url: downloadUrl(inv),
    });
  }
  return result;
}

function parseClassifications(root: El, doc: string, item: string, details: string, data: string): ClsMap {
  const result: ClsMap = new Map();
  for (const el of iter(root)) {
    if (el.tag !== doc) continue;
    for (const cls of children(el, item)) {
      let mark: string | null = null;
      let cls_mark = '';
      let tmode: string | null = null;
      const entries: Cls[] = [];
      for (const ch of cls.kids) {
        if (ch.tag === 'invoiceMark' && ch.text) mark = ch.text;
        else if (ch.tag === 'classificationMark' && ch.text) cls_mark = ch.text;
        else if (ch.tag === 'transactionMode' && ch.text) tmode = ch.text;
        else if (ch.tag === details) {
          let line: number | null = null;
          for (const node of ch.kids) {
            if (node.tag === 'lineNumber' && node.text) {
              const n = Number(node.text);
              line = Number.isInteger(n) ? n : null;
            } else if (node.tag === data) {
              const entry: Cls = { line };
              clsFields(node, entry);
              if (entry.type || entry.category) entries.push(entry);
            }
          }
        }
      }
      // Μόνο σκέτη απόρριψη/απόκλιση: με αναλυτικά στοιχεία το transactionMode είναι θόρυβος.
      if (doc === 'expensesClassificationsDoc' && tmode && REJECTION_MODES.includes(tmode) && !entries.length) {
        entries.push({ transaction_mode: tmode });
      }
      if (mark) result.set(mark, { entries, cls_mark }); // η νεότερη υποβολή αντικαθιστά την παλιά
    }
  }
  return result;
}

export const parseExpenseCls = (root: El) =>
  parseClassifications(root, 'expensesClassificationsDoc', 'expensesInvoiceClassification',
    'invoicesExpensesClassificationDetails', 'expensesClassificationDetailData');

export const parseIncomeCls = (root: El) =>
  parseClassifications(root, 'incomeClassificationsDoc', 'incomeInvoiceClassification',
    'invoicesIncomeClassificationDetails', 'incomeClassificationDetailData');

export function parseCancelled(root: El): Set<string> {
  const marks = new Set<string>();
  for (const el of iter(root)) {
    if (el.tag !== 'cancelledInvoicesDoc') continue;
    for (const cd of iter(el)) if (cd.tag === 'invoiceMark' && cd.text) marks.add(cd.text);
  }
  return marks;
}

/** (nextPartitionKey, nextRowKey) της σελίδας, σε όποιο namespace κι αν έρθουν. */
export function continuation(root: El): [string, string] | null {
  let partition = '';
  let row = '';
  for (const el of iter(root)) {
    if (el.tag === 'nextPartitionKey') partition = el.text ?? '';
    else if (el.tag === 'nextRowKey') row = el.text ?? '';
  }
  return partition && row ? [partition, row] : null;
}
