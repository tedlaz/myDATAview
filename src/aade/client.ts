// Πελάτης myDATA ΜΟΝΟ για ανάγνωση. Τα κλειδιά ΑΑΔΕ μπορούν και να στέλνουν, οπότε το get() είναι το
// ΜΟΝΑΔΙΚΟ σημείο δικτύου προς την ΑΑΔΕ και δεν δέχεται μέθοδο: εδώ δεν υπάρχει τρόπος αποστολής.
import { iter, parseXml, num, type El } from './xml.ts';
import {
  continuation, parseCancelled, parseExpenseCls, parseIncomeCls, parseInvoices,
  type Cls, type ClsMap, type Invoice,
} from './parse.ts';
import { OFF_BOOK_TYPES, SELF_EXPENSE_TYPES } from '../codes.ts';
import { round2 } from '../book/yearly.ts';

const URLS = { prod: 'https://mydatapi.aade.gr/myDATA/', dev: 'https://mydataapidev.aade.gr/' };
const TIMEOUT_MS = 60_000;

export class MyDataError extends Error {}

export type ClientConfig = {
  userId: string;
  subscriptionKey: string;
  env: 'prod' | 'dev';
  entityVat?: string; // κλειδιά λογιστή: το ΑΦΜ του εντολέα σε κάθε κλήση
  ownVat: string;
};
type Params = Record<string, string>;
export type Fetch = (url: string, init: { method: 'GET'; headers: Record<string, string>; signal: AbortSignal }) =>
  Promise<{ status: number; text(): Promise<string> }>;

const isOffBooks = (i: Invoice) => OFF_BOOK_TYPES.has(i.invoice_type ?? '');
const isSelfExpense = (i: Invoice) => SELF_EXPENSE_TYPES.has(i.invoice_type ?? '');
const hasEmbedded = (i: Invoice) => i.has_summary_classification || i.lines.some((l) => l.has_expenses_classification);
/**
 * Παραστατικό με μηδενική αξία και ΦΠΑ (όχι 1.5): μετρά χαρακτηρισμένο. Τα έξοδα παίρνουν 2.5 / E3_585_016 ανά
 * γραμμή, όπως το _classify_zero_docs του myDATA Classifier· τα έσοδα (μόνο εδώ, όχι στο Classifier) κανέναν.
 */
export function zeroValueCls(i: Pick<Invoice, 'invoice_type' | 'total_net' | 'total_vat' | 'lines'>, kind: 'income' | 'expense'): Cls[] | null {
  if (i.invoice_type === '1.5' || Math.abs(i.total_net ?? 0) >= 0.005 || Math.abs(i.total_vat ?? 0) >= 0.005) return null;
  if (kind === 'income') return [];
  const lines = i.lines.length ? i.lines : [{ line_number: 1, net_value: 0 }];
  return lines.map((l) => ({ line: l.line_number, type: 'E3_585_016', category: 'category2_5', amount: round2(l.net_value) }));
}

function unique(invoices: Invoice[]): Invoice[] {
  const seen = new Set<string>();
  return invoices.filter((i) => !seen.has(i.mark) && seen.add(i.mark));
}

const toIso = (gr: string) => gr.split('/').reverse().join('-');

/** Έκδοση μέσα στο [from, to] (dd/mm/yyyy). Χωρίς αναγνώσιμη ημερομηνία: κρατιέται. */
function inRange(inv: Invoice, from: string, to: string): boolean {
  const d = (inv.issue_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return true;
  return toIso(from) <= d && d <= toIso(to);
}

/** Σήμερα (dd/mm/yyyy) σε ώρα Ελλάδας. */
export function todayGr(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(now);
}

export class MyDataClient {
  private base: string;
  private headers: Record<string, string>;
  private entityVat: string;
  private ownVat: string;
  private fetchFn: Fetch;
  private today: () => string;
  private cache = new Map<string, Promise<El[]>>();
  private info = new Map<string, Promise<Record<string, string>[]>>();

  constructor(cfg: ClientConfig, fetchFn: Fetch = (url, init) => fetch(url, init), today: () => string = todayGr) {
    this.base = URLS[cfg.env];
    this.headers = { 'aade-user-id': cfg.userId, 'Ocp-Apim-Subscription-Key': cfg.subscriptionKey };
    this.entityVat = (cfg.entityVat ?? '').trim();
    this.ownVat = (cfg.ownVat || this.entityVat).trim();
    this.fetchFn = fetchFn;
    this.today = today;
  }

  private async get(endpoint: string, params: Params): Promise<{ status: number; body: string }> {
    const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await this.fetchFn(`${this.base}${endpoint}?${query}`, {
        method: 'GET', headers: this.headers, signal: controller.signal,
      });
      return { status: resp.status, body: await resp.text() };
    } finally {
      clearTimeout(timer);
    }
  }

  private params(extra: Params): Params {
    return { ...(this.entityVat ? { entityVatNumber: this.entityVat } : {}), ...extra };
  }

  /** Όλες οι σελίδες. Ίδια κλήση στον ίδιο client = ένα αίτημα (το RequestTransmittedDocs το θέλουν και τα δύο βιβλία). */
  private pages(endpoint: string, params: Params): Promise<El[]> {
    const key = `${endpoint}?${JSON.stringify(params)}`;
    let result = this.cache.get(key);
    if (!result) {
      result = this.fetchPages(endpoint, params);
      this.cache.set(key, result);
    }
    return result;
  }

  private async fetchPages(endpoint: string, first: Params): Promise<El[]> {
    const params = { ...first };
    const roots: El[] = [];
    for (;;) {
      const { status, body } = await this.get(endpoint, params);
      if (status === 401) throw new MyDataError('Μη έγκυρα credentials (401). Έλεγξε aade-user-id / subscription key.');
      if (status !== 200) throw new MyDataError(`HTTP ${status}: ${body.slice(0, 500)}`);
      const root = parseXml(body);
      roots.push(root);
      const next = continuation(root);
      if (!next) return roots;
      [params.nextPartitionKey, params.nextRowKey] = next;
    }
  }

  /** Διάστημα ημερομηνιών, ή (mark) ό,τι ανέβηκε μετά το MARK, όποια κι αν είναι η ημερομηνία έκδοσης. */
  private query(from: string | null, to: string | null, mark?: number): Params {
    if (mark !== undefined) return this.params({ mark: String(mark) });
    return this.params({ mark: '0', dateFrom: from!, dateTo: to! });
  }

  private recipientTransmitted(i: Invoice): boolean {
    return !!(this.ownVat && i.issuer_vat && i.issuer_vat.trim() !== this.ownVat);
  }

  private async requestDocs(from: string | null, to: string | null, mark?: number) {
    const invoices: Invoice[] = [];
    const clsMap: ClsMap = new Map();
    const cancelled = new Set<string>();
    for (const root of await this.pages('RequestDocs', this.query(from, to, mark))) {
      for (const inv of parseInvoices(root)) {
        // Λήπτης άλλος (π.χ. 13.1 που διαβίβασε πελάτης για δική μας λιανική): έξοδο δικό του.
        if (this.ownVat && inv.counterpart_vat && inv.counterpart_vat.trim() !== this.ownVat) cancelled.add(inv.mark);
        else invoices.push(inv);
      }
      for (const [k, v] of parseExpenseCls(root)) clsMap.set(k, v);
      for (const m of parseCancelled(root)) cancelled.add(m);
    }
    return { invoices: unique(invoices), clsMap, cancelled };
  }

  private async requestTransmitted(from: string | null, to: string | null, mark?: number) {
    const invoices: Invoice[] = [];
    const clsMap: ClsMap = new Map();
    const cancelled = new Set<string>();
    for (const root of await this.pages('RequestTransmittedDocs', this.query(from, to, mark))) {
      for (const inv of parseInvoices(root)) {
        if (isSelfExpense(inv) || (this.recipientTransmitted(inv) && !isOffBooks(inv))) invoices.push(inv);
      }
      for (const [k, v] of parseExpenseCls(root)) clsMap.set(k, v);
      for (const m of parseCancelled(root)) cancelled.add(m);
    }
    return { invoices: unique(invoices), clsMap, cancelled };
  }

  private requestInfo(endpoint: string, from: string, to: string) {
    const key = `${endpoint}|${from}|${to}`;
    let result = this.info.get(key);
    if (!result) {
      result = this.fetchInfo(endpoint, from, to);
      this.info.set(key, result);
    }
    return result;
  }

  private async fetchInfo(endpoint: string, from: string, to: string) {
    const records: Record<string, string>[] = [];
    const params = this.params({ dateFrom: from, dateTo: to, GroupedPerDay: 'false' });
    for (;;) {
      const { status, body } = await this.get(endpoint, params);
      if (status !== 200) throw new MyDataError(`${endpoint}: HTTP ${status}: ${body.slice(0, 300)}`);
      const root = parseXml(body);
      for (const rec of root.kids) {
        if (!rec.tag.toLowerCase().includes('continuation')) {
          records.push(Object.fromEntries(rec.kids.map((c) => [c.tag, c.text ?? ''])));
        }
      }
      const next = continuation(root);
      if (!next) return records;
      [params.nextPartitionKey, params.nextRowKey] = next;
    }
  }

  /** Χαρακτηρισμοί της πύλης (π.χ. Ειδική Φόρμα): δεν έρχονται από τα RequestDocs, μόνο από E3Info / VatInfo. */
  private async portalClassifications(from: string, to: string): Promise<ClsMap> {
    const entries = new Map<string, Cls[]>();
    const same = (a: Cls, b: Cls) => a.type === b.type && a.category === b.category && a.amount === b.amount;
    for (const r of await this.requestInfo('RequestE3Info', from, to)) {
      // Στα αχαρακτήριστα η ΑΑΔΕ δίνει placeholder κατηγορία κείμενο: δεν είναι χαρακτηρισμός.
      if (!(r.V_Class_Category || 'category2_').startsWith('category')) continue;
      if (r.V_Mark && (r.V_Class_Type || r.V_Class_Category)) {
        const e: Cls = {
          line: null, type: r.V_Class_Type || null, category: r.V_Class_Category || null, amount: num(r.V_Class_Value),
        };
        // Η ΑΑΔΕ επιστρέφει κάποτε την ίδια εγγραφή πολλές φορές: διπλή, όχι δεύτερη γραμμή.
        const list = entries.get(r.V_Mark) ?? [];
        if (!list.some((x) => same(x, e))) list.push(e);
        entries.set(r.V_Mark, list);
      }
    }
    for (const r of await this.requestInfo('RequestVatInfo', from, to)) {
      const list = entries.get(r.Mark);
      if (!list) continue; // ΦΠΑ μόνο δίπλα σε Ε3 του ίδιου παραστατικού
      for (const [k, v] of Object.entries(r)) {
        if (k.startsWith('Vat36') && v) {
          const e: Cls = { line: null, type: `VAT_${k.slice(3)}`, amount: num(v) };
          if (!list.some((x) => x.type === e.type && x.amount === e.amount && x.category === e.category)) list.push(e);
        }
      }
    }
    return new Map([...entries].map(([m, e]) => [m, { entries: e, cls_mark: '' }]));
  }

  /** Χαρακτηρισμοί πύλης που ισχύουν: στα ενσωματωμένα μόνο αν διαφέρουν από τον ίδιο τον ενσωματωμένο. */
  private static portalOverrides(invoices: Invoice[], portal: ClsMap, clsMap: ClsMap): ClsMap {
    const key = (entries: Cls[]) => {
      const agg = new Map<string, number>();
      for (const e of entries) {
        if (e.transaction_mode) continue;
        const k = JSON.stringify([e.type || '', e.category || '']);
        agg.set(k, (agg.get(k) ?? 0) + Math.abs(e.amount || 0));
      }
      return JSON.stringify([...agg].map(([k, v]) => [k, round2(v)]).sort());
    };
    const out: ClsMap = new Map();
    for (const i of invoices) {
      const found = portal.get(i.mark);
      if (clsMap.has(i.mark) || !found) continue;
      if (hasEmbedded(i) && key(found.entries) === key(i.lines.flatMap((l) => l.classifications))) continue;
      out.set(i.mark, found);
    }
    return out;
  }

  /** Έξοδα διαστήματος (dd/mm/yyyy): αχαρακτήριστα, χαρακτηρισμένα και ΜΑΡΚ προς αφαίρεση. */
  async expenses(from: string, to: string) {
    const docs = await this.requestDocs(from, to);
    const invoices = docs.invoices;
    // Οι δικές μας διαβιβάσεις έως ΣΗΜΕΡΑ: ο χαρακτηρισμός γίνεται μετά την έκδοση.
    const own = await this.requestTransmitted(from, this.today());
    const clsMap: ClsMap = new Map([...docs.clsMap, ...own.clsMap]);
    const cancelled = new Set([...docs.cancelled, ...own.cancelled]);

    const pending = [...invoices, ...own.invoices].filter((i) => !clsMap.has(i.mark));
    if (pending.length) {
      let portal: ClsMap = new Map();
      try {
        portal = await this.portalClassifications(from, to);
      } catch (e) {
        if (!(e instanceof MyDataError)) throw e; // χωρίς E3Info μένουν ως έχουν ως την επόμενη λήψη
      }
      for (const [k, v] of MyDataClient.portalOverrides(pending, portal, clsMap)) clsMap.set(k, v);
    }

    const seen = new Set(invoices.map((i) => i.mark));
    for (const inv of own.invoices) {
      if (seen.has(inv.mark) || !inRange(inv, from, to)) continue;
      invoices.push(inv);
      seen.add(inv.mark);
    }
    return MyDataClient.splitExpenses(invoices, clsMap, cancelled);
  }

  /**
   * Ό,τι ανέβηκε με MARK > mark: πιάνει και τα εκπρόθεσμα. Τα MARK του myDATA είναι χρονολογικά.
   * top: μέγιστο MARK όλων των εγγραφών, docs: ΜΑΡΚ παραστατικών, refs: παραστατικά με νέο χαρακτηρισμό/ακύρωση.
   */
  async newSince(endpoint: 'RequestDocs' | 'RequestTransmittedDocs', mark: number) {
    let top = mark;
    const docs: string[] = [];
    const refs = new Set<string>();
    for (const root of await this.pages(endpoint, this.query(null, null, mark))) {
      docs.push(...parseInvoices(root).map((i) => i.mark));
      for (const el of iter(root)) {
        if (['mark', 'classificationMark', 'cancellationMark'].includes(el.tag) && /^\d+$/.test(el.text ?? '')) {
          top = Math.max(top, Number(el.text));
        } else if (el.tag === 'invoiceMark' && el.text) refs.add(el.text);
      }
    }
    return { top, docs, refs };
  }

  /** Έξοδα που ανέβηκαν μετά τα MARK κάθε endpoint. */
  async expensesSince(marks: { RequestDocs: number; RequestTransmittedDocs: number }) {
    const docs = await this.requestDocs(null, null, marks.RequestDocs);
    const own = await this.requestTransmitted(null, null, marks.RequestTransmittedDocs);
    const seen = new Set(docs.invoices.map((i) => i.mark));
    const invoices = [...docs.invoices, ...own.invoices.filter((i) => !seen.has(i.mark))];
    const clsMap: ClsMap = new Map([...docs.clsMap, ...own.clsMap]);
    const cancelled = new Set([...docs.cancelled, ...own.cancelled]);
    const pending = invoices.filter((i) => !clsMap.has(i.mark));
    const dates = pending.filter((i) => i.issue_date).map((i) => i.issue_date!.slice(0, 10)).sort();
    if (dates.length) {
      const gr = (iso: string) => iso.split('-').reverse().join('/');
      let portal: ClsMap = new Map();
      try {
        portal = await this.portalClassifications(gr(dates[0]), gr(dates[dates.length - 1]));
      } catch (e) {
        if (!(e instanceof MyDataError)) throw e;
      }
      for (const [k, v] of MyDataClient.portalOverrides(pending, portal, clsMap)) clsMap.set(k, v);
    }
    return MyDataClient.splitExpenses(invoices, clsMap, cancelled);
  }

  private static splitExpenses(invoices: Invoice[], clsMap: ClsMap, cancelled: Set<string>) {
    for (const i of invoices) if (i.cancelled_by_mark) cancelled.add(i.mark);
    const unclassified: Invoice[] = [];
    const classified: Invoice[] = [];
    for (const i of invoices) {
      if (isOffBooks(i) || cancelled.has(i.mark)) continue;
      const found = clsMap.get(i.mark);
      if (found) {
        i.cls_info = found.entries;
        i.classification_mark = found.cls_mark;
        classified.push(i);
      } else if (hasEmbedded(i)) {
        i.cls_info = i.lines.flatMap((l) => l.classifications);
        i.classification_mark = i.mark;
        classified.push(i);
      } else {
        const zero = zeroValueCls(i, 'expense');
        if (zero) i.cls_info = zero;
        (zero ? classified : unclassified).push(i);
      }
    }
    return { unclassified, classified, cancelled };
  }

  /**
   * Έσοδα διαστήματος (dd/mm/yyyy), ή (mark) ό,τι ανέβηκε μετά το MARK.
   * Το διάστημα ζητείται έως ΣΗΜΕΡΑ: χαρακτηρισμός ή ακύρωση έρχεται με μεταγενέστερο MARK.
   */
  async income(from: string | null, to: string | null, mark?: number) {
    const invoices: Invoice[] = [];
    const clsMap: ClsMap = new Map();
    const cancelled = new Set<string>();
    const query = mark === undefined ? this.query(from, this.today()) : this.query(null, null, mark);
    for (const root of await this.pages('RequestTransmittedDocs', query)) {
      for (const inv of parseInvoices(root)) {
        if (isSelfExpense(inv) || isOffBooks(inv) || this.recipientTransmitted(inv)) continue;
        if (mark === undefined && !inRange(inv, from!, to!)) continue;
        if (inv.cancelled_by_mark) cancelled.add(inv.mark);
        else invoices.push(inv);
      }
      for (const [k, v] of parseIncomeCls(root)) clsMap.set(k, v);
      for (const m of parseCancelled(root)) cancelled.add(m);
    }
    const unclassified: Invoice[] = [];
    const classified: Invoice[] = [];
    for (const i of unique(invoices)) {
      if (cancelled.has(i.mark)) continue;
      const found = clsMap.get(i.mark);
      if (found) {
        i.cls_info = found.entries;
        i.classification_mark = found.cls_mark;
        classified.push(i);
      } else if (i.has_income_classification) {
        i.cls_info = i.income_classifications;
        i.classification_mark = i.mark;
        classified.push(i);
      } else (zeroValueCls(i, 'income') ? classified : unclassified).push(i);
    }
    return { unclassified, classified, cancelled };
  }
}
