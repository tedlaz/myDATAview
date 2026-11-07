// Σύντομη επωνυμία για εμφάνιση (η βάση κρατά την πλήρη). Ίδιοι κανόνες με το myDATA Classifier.
const LETTER = '0-9A-Za-z_\\u00C0-\\u024F\\u0370-\\u03FF\\u1F00-\\u1FFF';
const word = (pattern: string) => `(?<![${LETTER}])(?:${pattern})(?![${LETTER}])`;
const [A, E, O, I, K, B] = ['[ΑA]', '[ΕE]', '[ΟO]', '[ΙI]', '[ΚK]', '[ΒB]'];

// Νομικές μορφές με τελείες, με λατινικά γράμματα (VIVABANK AE) ή με κενά στο τέλος (NOVA Μ Α Ε).
const DOTTED: [RegExp, string][] = [
  [new RegExp(word(`${A}\\.?\\s*${E}\\.\\s*${B}\\.?\\s*${E}\\.?|AEBE`), 'gi'), 'ΑΕΒΕ'],
  [new RegExp(word(`${E}\\.\\s*Π\\.\\s*${E}\\.?|EPE`), 'gi'), 'ΕΠΕ'],
  [new RegExp(word(`${I}\\.\\s*${K}\\.\\s*${E}\\.?|IKE`), 'gi'), 'ΙΚΕ'],
  [new RegExp(word(`${A}\\.\\s*${E}\\.?|AE`), 'gi'), 'ΑΕ'],
  [new RegExp(word(`${O}\\.\\s*${E}\\.?|OE`), 'gi'), 'ΟΕ'],
  [new RegExp(word(`${E}\\.\\s*${E}\\.?|EE`), 'gi'), 'ΕΕ'],
  [new RegExp(`(?<![${LETTER}])(?:Μ\\s+)?([ΑΟΕ])\\s+Ε\\s*$`, 'gi'), '$1Ε'],
];
const MONO_M = new RegExp(`(?<![${LETTER}])Μ(?:ΟΝ)?\\.?\\s*(?=(?:ΑΕ|ΙΚΕ|ΕΠΕ)(?![${LETTER}]))`, 'gi');
const LEGAL = '(ΑΕΒΕ|ΑΕ|ΟΕ|ΕΕ|ΕΠΕ|ΙΚΕ)';
const LEGAL_FORM = new RegExp(`(?<![${LETTER}])${LEGAL}(?![${LETTER}])`, 'gi');
const LEGAL_WHOLE = new RegExp(`^${LEGAL}$`, 'i');

const ET = ['ΕΤΑΙΡΕΙΑ', 'ΕΤΑΙΡΙΑ'];
// (λέξεις, αντικατάσταση): κάθε λέξη είναι λίστα αποδεκτών γραφών· '' = αφαίρεση. Οι πολυλεκτικές πρώτα.
const PHRASES: [string[][], string][] = [
  [[ET, ['ΠΕΡΙΟΡΙΣΜΕΝΗΣ'], ['ΕΥΘΥΝΗΣ']], 'ΕΠΕ'],
  [[['ΙΔΙΩΤΙΚΗ'], ['ΚΕΦΑΛΑΙΟΥΧΙΚΗ'], ET], 'ΙΚΕ'],
  [[['ΕΙΔΙΚΟΣ'], ['ΛΟΓΑΡΙΑΣΜΟΣ'], ['ΚΟΝΔΥΛΙΩΝ'], ['ΕΡΕΥΝΑΣ']], 'ΕΛΚΕ'],
  [[['ΔΗΜΟΣΙΑ'], ['ΕΠΙΧΕΙΡΗΣΗ'], ['ΗΛΕΚΤΡΙΣΜΟΥ']], 'ΔΕΗ'],
  [[['ΗΛΕΚΤΡΟΝΙΚΟΣ'], ['ΕΘΝΙΚΟΣ'], ['ΦΟΡΕΑΣ'], ['ΚΟΙΝΩΝΙΚΗΣ'], ['ΑΣΦΑΛΙΣΗΣ']], 'ΕΦΚΑ'],
  [[['ΕΘΝΙΚΟΣ'], ['ΦΟΡΕΑΣ'], ['ΚΟΙΝΩΝΙΚΗΣ'], ['ΑΣΦΑΛΙΣΗΣ']], 'ΕΦΚΑ'],
  [[['ΑΝΩΝΥΜΗ', 'ΑΝΩΝΥΜΟΣ']], 'ΑΕ'],
  [[['ΟΜΟΡΡΥΘΜΗ', 'ΟΜΟΡΥΘΜΗ']], 'ΟΕ'],
  [[['ΕΤΕΡΟΡΡΥΘΜΗ', 'ΕΤΕΡΟΡΥΘΜΗ']], 'ΕΕ'],
  [[['ΜΟΝΟΠΡΟΣΩΠΗ', 'ΜΟΝΟΠΡΟΣΩΠΟΣ']], ''],
  [[ET], ''],
  [[['ΕΜΠΟΡΙΑ']], ''],
  [[['ΕΙΣΑΓΩΓΑΙ', 'ΕΙΣΑΓΩΓΕΣ']], ''],
  [[['ΕΞΑΓΩΓΑΙ', 'ΕΞΑΓΩΓΕΣ']], ''],
  [[['TELECOMMUNICATIONS'], ['AND', 'ΑND', ''], ['MEDIA']], ''], // «ΑND» με ελληνικό Α, «&»
];
const CONNECTORS = ['ΚΑΙ', '']; // «ΚΑΙ», «-», «&» δίπλα σε λέξη που αφαιρέθηκε φεύγουν κι αυτά
const SHORT_NAME_MIN = 20; // μικρότερες εμφανίζονται αυτούσιες
const SHORT_NAME_MAX = 50; // πάνω από αυτό: 2 πρώτες λέξεις + νομική μορφή

/** Λέξη για σύγκριση: κεφαλαία, χωρίς τόνους και σημεία στίξης. */
const key = (w: string) => w.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(new RegExp(`[^${LETTER}]|_`, 'g'), '');

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Ταιριάζει με κάποια γραφή, επιτρέποντας 1 λάθος (6+ γράμματα) ή 2 (10+). */
function close(k: string, variants: string[]): boolean {
  return variants.some((v) => {
    const tol = v.length >= 10 ? 2 : v.length >= 6 ? 1 : 0;
    return k === v || (Math.abs(k.length - v.length) <= tol && distance(k, v) <= tol);
  });
}

const split = (s: string) => s.split(/\s+/).filter(Boolean);

function abbreviate(input: string): string {
  let part = input;
  for (const [pattern, repl] of DOTTED) part = part.replace(pattern, repl);
  const toks = split(part);
  const keys = toks.map(key);
  const out: [string, boolean][] = []; // (λέξη, αφαιρέθηκε)
  let i = 0;
  while (i < toks.length) {
    const hit = PHRASES.find(([words]) =>
      i + words.length <= toks.length && words.every((w, j) => close(keys[i + j], w)));
    if (hit) {
      out.push([hit[1], !hit[1]]);
      i += hit[0].length;
    } else {
      out.push([toks[i], false]);
      i += 1;
    }
  }
  const kept = out.filter(([t, removed], k) => !removed && !(
    CONNECTORS.includes(key(t)) && ((k > 0 && out[k - 1][1]) || (k + 1 < out.length && out[k + 1][1]))
  )).map(([t]) => t);
  const words = split(kept.join(' ').replace(MONO_M, ''));
  // «ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ Α.Ε.» → μία φορά ΑΕ
  return words.filter((w, k) => !(k && w === words[k - 1] && LEGAL_WHOLE.test(w))).join(' ').replace(/^[ ,\-&]+|[ ,\-&]+$/g, '');
}

const forms = (s: string) => [...s.matchAll(LEGAL_FORM)].map((m) => m[1]);
const cache = new Map<string, string>();

function shorten(name: string): string {
  const at = name.indexOf('||');
  const left = abbreviate(at < 0 ? name : name.slice(0, at));
  const right = at < 0 ? '' : abbreviate(name.slice(at + 2));
  const found = forms(left);
  let form = found.length ? found[found.length - 1].toUpperCase() : '';
  let result = right && right.length < left.length && !forms(right).length
    ? `${right} ${form}`.trim()
    : left || right;
  if (result.length > SHORT_NAME_MAX) {
    const inResult = forms(result);
    if (inResult.length) form = inResult[inResult.length - 1].toUpperCase();
    const head: string[] = [];
    for (const w of split(result)) {
      if (LEGAL_WHOLE.test(w) || head.length === 2) break;
      head.push(w);
    }
    result = [...head, form].join(' ').trim();
  }
  return result;
}

/** Από το «επωνυμία||διακριτικός τίτλος» του VIES κρατά το πιο σύντομο, και συντομεύει «ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ» → ΑΕ κλπ. */
export function shortName(name: string): string;
export function shortName(name: string | null | undefined): string | null | undefined;
export function shortName(name: string | null | undefined) {
  if (!name || name.trim().length < SHORT_NAME_MIN) return name;
  let result = cache.get(name);
  if (result === undefined) {
    result = shorten(name);
    cache.set(name, result);
  }
  return result;
}
