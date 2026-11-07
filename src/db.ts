// Η βάση της συσκευής πάνω στο expo-sqlite.
import * as SQLite from 'expo-sqlite';
import { Store } from './store.ts';

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const raw = SQLite.openDatabaseSync('mydataview.db');
  store = new Store({
    exec: (sql) => raw.execSync(sql),
    run: (sql, params = []) => raw.runSync(sql, params).lastInsertRowId,
    all: <T,>(sql: string, params: (string | number | null)[] = []) => raw.getAllSync<T>(sql, params),
    tx: (task) => raw.withTransactionSync(task),
  });
  return store;
}
