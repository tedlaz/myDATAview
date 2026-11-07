// Αυτόματη λήψη «Νέα από MARK» για όσες εταιρείες έχουν κάνει αρχική λήψη. Ίδια λογική και με ανοιχτή εφαρμογή και στο παρασκήνιο.
import type { Store } from '../store.ts';
import type { Lookup } from '../vies.ts';
import { fetchNewBooks, markReady, type Keys, type Outcome } from './fetch.ts';
import type { Fetch } from '../aade/client.ts';

const MIN_HOURS = 0.25; // το Android δεν τρέχει εργασίες παρασκηνίου συχνότερα από 15 λεπτά
const MAX_HOURS = 8760;
const HOUR_MS = 3_600_000;
const HOURS_KEY = 'auto_hours';
const lastKey = (id: number) => `auto_last:${id}`;
const resultKey = (id: number) => `auto_result:${id}`;

/** Ώρες από το πεδίο του χρήστη, με κόμμα ή τελεία· null αν δεν είναι έγκυρες. */
export function parseHours(text: string): number | null {
  const hours = Number(text.trim().replace(',', '.'));
  return text.trim() && hours >= MIN_HOURS && hours <= MAX_HOURS ? hours : null;
}

export const formatHours = (hours: number) => String(hours).replace('.', ',');

export const autoHours = (store: Store) => Number(store.setting(HOURS_KEY) ?? 0);
export function setAutoHours(store: Store, hours: number): void {
  store.setSetting(HOURS_KEY, String(hours));
  store.changed();
}

/** Η τελευταία αυτόματη λήψη της εταιρείας: πότε και τι βγήκε. */
export function autoStatus(store: Store, id: number): { at: number; result: string } | null {
  const at = Number(store.setting(lastKey(id)) ?? 0);
  return at ? { at, result: store.setting(resultKey(id)) ?? '' } : null;
}

const ready = (store: Store, id: number) => markReady(store, id, 'income') && markReady(store, id, 'expense');

/** Πότε είναι η επόμενη αυτόματη λήψη της εταιρείας· null όσο δεν έχει γίνει η αρχική λήψη. */
export function nextAutoAt(store: Store, id: number, hours: number): number | null {
  return ready(store, id) ? Number(store.setting(lastKey(id)) ?? 0) + hours * HOUR_MS : null;
}

/** Η πιο κοντινή αυτόματη λήψη όλων των εταιρειών· null αν δεν υπάρχει καμία. */
export function nextDueAt(store: Store): number | null {
  const hours = autoHours(store);
  if (!hours) return null;
  const times = store.companies().map((c) => nextAutoAt(store, c.id, hours)).filter((t): t is number => t !== null);
  return times.length ? Math.min(...times) : null;
}

/** Υπόλοιπος χρόνος: ωω:λλ:δδ, με τις μέρες μπροστά όταν περνά τις 24 ώρες. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  const days = Math.floor(total / 86400);
  const clock = `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
  return days ? `${days} ημ. ${clock}` : clock;
}

/** Όσες εταιρείες είναι έτοιμες για MARK και πέρασε το διάστημα από την τελευταία αυτόματη λήψη τους. */
export function dueCompanies(store: Store, now: number) {
  const hours = autoHours(store);
  if (!hours) return [];
  return store.companies().filter((c) => (nextAutoAt(store, c.id, hours) ?? Infinity) <= now);
}

/** Χειροκίνητη λήψη με ενεργή την αυτόματη: ο χρόνος ξαναρχίζει. Αν απέτυχε, μένει ως έχει για να ξαναδοκιμάσει στην ώρα της. */
export function restartAuto(store: Store, id: number, outcomes: Outcome[], now = Date.now()): void {
  if (!autoHours(store) || !outcomes.some((o) => o.ok)) return;
  store.setSetting(lastKey(id), String(now));
  store.setSetting(resultKey(id), outcomes.map((r) => r.message).join(' '));
  store.changed();
}

let running = false;

/** Δεν πετά ποτέ σφάλμα: τρέχει χωρίς χρήστη, και το αποτέλεσμα γράφεται για να φανεί στην καρτέλα Λήψη. */
export async function runAuto(o: {
  store: Store;
  loadKeys: (id: number) => Promise<Keys | null>;
  lookup: Lookup;
  now?: number;
  fetchFn?: Fetch;
  today?: () => string;
}): Promise<number> {
  if (running) return 0;
  running = true;
  const { store } = o;
  const now = o.now ?? Date.now();
  let done = 0;
  try {
    for (const company of dueCompanies(store, now)) {
      store.setSetting(lastKey(company.id), String(now)); // και σε αποτυχία: ξαναδοκιμάζει στο επόμενο διάστημα
      try {
        const keys = await o.loadKeys(company.id);
        if (!keys) {
          store.setSetting(resultKey(company.id), 'Λείπουν τα κλειδιά ΑΑΔΕ.');
          continue;
        }
        const outcomes = await fetchNewBooks({
          store, company, keys, start: '', lookup: o.lookup, fetchFn: o.fetchFn, today: o.today,
        });
        store.setSetting(resultKey(company.id), outcomes.map((r) => r.message).join(' '));
        done += 1;
      } catch (e) {
        store.setSetting(resultKey(company.id), `Σφάλμα: ${(e as Error).message}`);
      }
    }
  } finally {
    running = false;
  }
  return done;
}
