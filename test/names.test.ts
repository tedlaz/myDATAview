// Σύντομες επωνυμίες και ποσά λίστας, όπως στο desktop (golden-names.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { plainAmount } from '../src/book/yearly.ts';
import { shortName } from '../src/names.ts';

const golden = JSON.parse(readFileSync(new URL('./golden-names.json', import.meta.url), 'utf8'));

test('σύντομες επωνυμίες όπως το desktop', () => {
  for (const [name, expected] of golden.names) assert.equal(shortName(name), expected, name);
  assert.equal(shortName(null), null);
});

test('ποσά λίστας όπως το %.2f', () => {
  for (const [value, expected] of golden.amounts) assert.equal(plainAmount(value), expected, String(value));
});
