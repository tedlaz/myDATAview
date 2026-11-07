// Λήψη παραστατικών στην τοπική βάση. Κάθε βιβλίο ανεξάρτητα: αποτυχία του ενός δεν σταματά το άλλο.
//
// «Νέα από MARK». Αμετάβλητο: το βιβλίο έχει ΟΛΑ τα παραστατικά με έκδοση ≥ «Αρχή» και MARK ≤ W. Η πρώτη λήψη φέρνει
// από την Αρχή έως σήμερα και ορίζει το W. Από εκεί και πέρα ζητείται μόνο ό,τι ανέβηκε με MARK > W, οπότε έρχονται
// και τα εκπρόθεσμα, οι ακυρώσεις και οι χαρακτηρισμοί. Το W αλλάζει μόνο μετά από επιτυχία.
import { MyDataClient, MyDataError, todayGr, type Fetch } from '../aade/client.ts';
import type { Invoice } from '../aade/parse.ts';
import type { Company, Kind, Status, Store } from '../store.ts';
import type { Lookup } from '../vies.ts';

const LOOKUP_WORKERS = 8;
// Τα έξοδα έρχονται και από τις δικές μας διαβιβάσεις (αυτοτιμολογούμενα, χαρακτηρισμοί).
const ENDPOINTS = {
  income: ['RequestTransmittedDocs'],
  expense: ['RequestDocs', 'RequestTransmittedDocs'],
} as const;
type Endpoint = 'RequestDocs' | 'RequestTransmittedDocs';

export type Keys = { userId: string; subscriptionKey: string };
export type Outcome = { kind: Kind; ok: boolean; message: string };

/** Έγκυρη ημερομηνία dd/mm/yyyy. */
export function validGr(value: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return false;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export const grToIso = (gr: string) => gr.split('/').reverse().join('-');
const isoToGr = (iso: string) => iso.split('-').reverse().join('/');

const wmKey = (kind: Kind, endpoint: Endpoint, id: number) => `mark_wm:${kind}:${endpoint}:${id}`;
const startKey = (kind: Kind, id: number) => `mark_start:${kind}:${id}`;

/** Έχει γίνει η πρώτη λήψη του βιβλίου, οπότε η επόμενη πάει με MARK. */
export function markReady(store: Store, id: number, kind: Kind): boolean {
  return !!store.setting(startKey(kind, id))
    && ENDPOINTS[kind].every((ep) => !['', '0', null].includes(store.setting(wmKey(kind, ep, id))));
}

/** Η Αρχή του βιβλίου (yyyy-mm-dd), αν έχει οριστεί. */
export const markStart = (store: Store, id: number, kind: Kind) => store.setting(startKey(kind, id));

/**
 * Μετά την ανάκτηση «Αρχή → σήμερα» κάθε MARK που έχουμε δει είναι ασφαλές W. Τα MARK είναι κοινή αρίθμηση της ΑΑΔΕ,
 * άρα άδειο βιβλίο παίρνει το μέγιστο του άλλου. Χωρίς κανένα ΔΕΝ γράφεται W: με 0 θα ερχόταν όλο το ιστορικό του ΑΦΜ.
 */
function initWatermarks(store: Store, id: number, kind: Kind): boolean {
  const known = (['income', 'expense'] as const)
    .flatMap((k) => ENDPOINTS[k].map((ep) => Number(store.setting(wmKey(k, ep, id)) || 0)));
  const top = Math.max(store.maxMark(id), ...known);
  if (!top) return false;
  for (const ep of ENDPOINTS[kind]) store.setSetting(wmKey(kind, ep, id), String(top));
  return true;
}

/** Μαθαίνει επωνυμίες από τα παραστατικά και ρωτά το VIES μόνο για όσα ΑΦΜ δεν ξέρουμε ήδη. */
async function enrichNames(store: Store, parties: [string | null, string | null][], lookup: Lookup,
  progress: (text: string) => void): Promise<void> {
  const known = store.names();
  const fresh = new Map<string, string>();
  for (const [vat, name] of parties) {
    if (vat && name && known.get(vat) !== name) fresh.set(vat, name);
  }
  const missing = [...new Set(parties.map(([vat]) => vat))]
    .filter((vat): vat is string => !!vat && !known.has(vat) && !fresh.has(vat));
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < missing.length) {
      const vat = missing[next++];
      const name = await lookup(vat).catch(() => null);
      if (name) fresh.set(vat, name);
      progress(`Επωνυμίες: ${++done} από ${missing.length}`);
    }
  };
  await Promise.all(Array.from({ length: LOOKUP_WORKERS }, worker));
  store.saveNames(fresh);
}

const withStatus = (list: Invoice[], status: Status) => list.map((i): [Invoice, Status] => [i, status]);
const failure = (e: unknown) => (e instanceof MyDataError ? e.message : `Σφάλμα επικοινωνίας: ${(e as Error).message}`);
const LABELS: Record<Kind, string> = { income: 'Έσοδα', expense: 'Έξοδα' };

type Options = {
  store: Store;
  company: Company;
  keys: Keys;
  lookup: Lookup;
  progress?: (text: string) => void;
  fetchFn?: Fetch;
  today?: () => string;
};
type Marks = { RequestDocs: number; RequestTransmittedDocs: number };
type Context = { store: Store; company: Company; client: MyDataClient; lookup: Lookup; progress: (text: string) => void; today: () => string };

function context(o: Options): Context {
  const today = o.today ?? todayGr;
  const client = new MyDataClient({
    ...o.keys, env: o.company.env, ownVat: o.company.vat, entityVat: o.company.via_accountant ? o.company.vat : '',
  }, o.fetchFn, today);
  return { store: o.store, company: o.company, client, lookup: o.lookup, progress: o.progress ?? (() => {}), today };
}

/** Αποθηκεύει ένα βιβλίο από διάστημα ή (marks) από MARK· επιστρέφει πόσα παραστατικά ήρθαν. */
async function run(c: Context, kind: Kind, from: string | null, to: string | null, marks?: Marks): Promise<number> {
  const r = kind === 'income'
    ? await c.client.income(from, to, marks?.RequestTransmittedDocs)
    : marks ? await c.client.expensesSince(marks) : await c.client.expenses(from!, to!);
  const all = [...r.unclassified, ...r.classified];
  const parties = all.map((i): [string | null, string | null] =>
    (kind === 'income' ? [i.counterpart_vat, i.counterpart_name] : [i.issuer_vat, i.issuer_name]));
  await enrichNames(c.store, parties, c.lookup, c.progress);
  c.store.saveBook(c.company.id, kind, [...withStatus(r.unclassified, 'unclassified'), ...withStatus(r.classified, 'classified')],
    r.cancelled, kind === 'expense' ? 'expense' : undefined);
  return all.length;
}

async function fetchNew(c: Context, kind: Kind, start: string): Promise<string> {
  const { store, company: { id } } = c;
  if (!markReady(store, id, kind)) {
    const first = markStart(store, id, kind) ?? start;
    const n = await run(c, kind, isoToGr(first), c.today());
    store.setSetting(startKey(kind, id), first);
    return `${LABELS[kind]}: αρχική λήψη από ${isoToGr(first)} έως σήμερα, ${n} παραστατικά.`;
  }
  const marks = Object.fromEntries(ENDPOINTS[kind].map((ep) => [ep, Number(store.setting(wmKey(kind, ep, id)))])) as Marks;
  const tops: [Endpoint, number][] = [];
  const candidates = new Set<string>();
  const refs = new Set<string>();
  for (const ep of ENDPOINTS[kind]) {
    const since = await c.client.newSince(ep, marks[ep]);
    tops.push([ep, since.top]);
    for (const m of since.docs) candidates.add(m);
    for (const m of since.refs) refs.add(m);
  }
  const fresh = [...candidates].filter((m) => !store.document(id, m));
  if (candidates.size || refs.size) await run(c, kind, null, null, marks);
  // Χαρακτηρισμοί παλιών τοπικών παραστατικών (δεν ήρθαν στη δέλτα): ανάκτηση του διαστήματός τους.
  const dates = [...refs].filter((m) => !candidates.has(m))
    .map((m) => store.document(id, m))
    .filter((d) => d?.kind === kind && d.issue_date)
    .map((d) => d!.issue_date!.slice(0, 10))
    .sort();
  // ponytail: ένα διάστημα min–max· αν απλώνονται σε πολλά έτη, ανά μήνα
  if (dates.length) await run(c, kind, isoToGr(dates[0]), isoToGr(dates[dates.length - 1]));
  for (const [ep, top] of tops) store.setSetting(wmKey(kind, ep, id), String(top));
  const added = fresh.filter((m) => store.document(id, m)?.kind === kind).length;
  return `${LABELS[kind]}: ${added} νέα παραστατικά.`;
}

function stamp(store: Store, id: number, outcomes: Outcome[], what: string, today: () => string): Outcome[] {
  if (outcomes.some((o) => o.ok)) store.setSetting(`last_sync:${id}`, `${today()} · ${what}`);
  return outcomes;
}

/** Η συνηθισμένη λήψη: η πρώτη φορά από την Αρχή (start, yyyy-mm-dd) έως σήμερα, μετά μόνο τα νέα από MARK. */
export async function fetchNewBooks(o: Options & { start: string }): Promise<Outcome[]> {
  const c = context(o);
  const { id } = o.company;
  const outcomes: Outcome[] = [];
  const done: Kind[] = [];
  for (const kind of ['income', 'expense'] as const) {
    try {
      c.progress(`${LABELS[kind]}…`);
      outcomes.push({ kind, ok: true, message: await fetchNew(c, kind, o.start) });
      done.push(kind);
    } catch (e) {
      outcomes.push({ kind, ok: false, message: `${LABELS[kind]}: ${failure(e)}` });
    }
  }
  // W μετά από ΟΛΑ τα βιβλία: άδεια έσοδα παίρνουν το MARK των εξόδων.
  for (const kind of done) {
    if (!markReady(o.store, id, kind) && markStart(o.store, id, kind) && !initWatermarks(o.store, id, kind)) {
      const o2 = outcomes.find((x) => x.kind === kind)!;
      o2.message = `${LABELS[kind]}: κανένα παραστατικό ακόμα. Η επόμενη λήψη ξαναελέγχει από ${isoToGr(markStart(o.store, id, kind)!)}.`;
    }
  }
  stamp(o.store, id, outcomes, 'Νέα από MARK', c.today);
  o.store.changed(); // μπορεί να ολοκληρώθηκε η αρχική λήψη: ξεκινά η αυτόματη
  return outcomes;
}

/** Λήψη συγκεκριμένου διαστήματος (dd/mm/yyyy), π.χ. προηγούμενης χρήσης. Δεν αγγίζει τα MARK. */
export async function fetchBooks(o: Options & { from: string; to: string }): Promise<Outcome[]> {
  const c = context(o);
  const outcomes: Outcome[] = [];
  for (const kind of ['income', 'expense'] as const) {
    try {
      c.progress(`${LABELS[kind]}…`);
      const n = await run(c, kind, o.from, o.to);
      outcomes.push({ kind, ok: true, message: `${LABELS[kind]}: ${n} παραστατικά.` });
    } catch (e) {
      outcomes.push({ kind, ok: false, message: `${LABELS[kind]}: ${failure(e)}` });
    }
  }
  return stamp(o.store, o.company.id, outcomes, `${o.from} – ${o.to}`, c.today);
}
