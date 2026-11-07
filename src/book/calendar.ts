// Ημερολόγιο στα ελληνικά: εβδομάδα από Δευτέρα, ημερομηνίες dd/mm/yyyy.
export const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος',
  'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
export const WEEKDAYS = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];

export type Ymd = { y: number; m: number; d: number }; // m: 1–12

export function parseGr(value: string): Ymd | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return m ? { d: Number(m[1]), m: Number(m[2]), y: Number(m[3]) } : null;
}

export const formatGr = ({ y, m, d }: Ymd) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;

/** Οι εβδομάδες του μήνα, από Δευτέρα ως Κυριακή· null οι θέσεις εκτός μήνα. */
export function monthGrid(y: number, m: number): (number | null)[][] {
  const offset = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array<null>(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export function shiftMonth(y: number, m: number, by: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + by;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}
