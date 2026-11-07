// Μικρό δέντρο XML με local names: το myDATA αλλάζει namespaces ανά έκδοση, οπότε το parsing τα αγνοεί.
import { XMLParser } from 'fast-xml-parser';

export type El = { tag: string; text: string | null; kids: El[] };

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  htmlEntities: true,
});

function build(nodes: any[]): { kids: El[]; text: string } {
  const kids: El[] = [];
  let text = '';
  for (const node of nodes) {
    const tag = Object.keys(node).find((k) => k !== ':@');
    if (tag === undefined || tag.startsWith('?')) continue;
    if (tag === '#text') text += node[tag];
    else {
      const inner = build(node[tag]);
      kids.push({ tag, text: inner.text || null, kids: inner.kids });
    }
  }
  return { kids, text };
}

/** Το ριζικό στοιχείο του εγγράφου. */
export function parseXml(xml: string): El {
  const root = build(parser.parse(xml)).kids[0];
  if (!root) throw new Error('Κενή απάντηση XML.');
  return root;
}

export function* iter(el: El): Generator<El> {
  yield el;
  for (const kid of el.kids) yield* iter(kid);
}

export const child = (el: El, tag: string) => el.kids.find((k) => k.tag === tag);
export const children = (el: El, tag: string) => el.kids.filter((k) => k.tag === tag);

/** Το findtext της Python: null αν λείπει το στοιχείο, '' αν είναι κενό. */
export function text(el: El | undefined, tag: string): string | null {
  const found = el && child(el, tag);
  return found ? (found.text ?? '') : null;
}

/** Το float() της Python με ανοχή: κενό ή άκυρο → null. */
export function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
