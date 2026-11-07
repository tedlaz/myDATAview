// Κοινά για τα tests: sqlite στη μνήμη και οι σελίδες XML ως ψεύτικο δίκτυο.
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { Db } from '../src/store.ts';

export function memoryDb(): Db {
  const raw = new DatabaseSync(':memory:');
  return {
    exec: (sql) => raw.exec(sql),
    run: (sql, params = []) => Number(raw.prepare(sql).run(...params).lastInsertRowid),
    all: <T>(sql: string, params: (string | number | null)[] = []) =>
      raw.prepare(sql).all(...params).map((r: object) => ({ ...r })) as T[],
    tx: (task) => {
      raw.exec('BEGIN');
      try {
        task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export function loadPages(folder: string): Record<string, string> {
  const dir = new URL(folder, import.meta.url);
  return Object.fromEntries(
    readdirSync(dir).filter((f: string) => f.endsWith('.xml'))
      .map((f: string) => [f.replace('.xml', ''), readFileSync(new URL(f, dir), 'utf8')]),
  );
}
