// Τοπική βάση. Τα κλειδιά ΑΑΔΕ ΔΕΝ μπαίνουν εδώ: ζουν στο secure store (secrets.ts).
import type { Invoice } from './aade/parse.ts';
import { zeroValueCls } from './aade/client.ts';
import type { YearlyDoc } from './book/yearly.ts';

/** Ό,τι χρειαζόμαστε από το sqlite, ώστε η ίδια λογική να τρέχει στο κινητό και στα tests. */
export type Db = {
  exec(sql: string): void;
  run(sql: string, params?: (string | number | null)[]): number;
  all<T>(sql: string, params?: (string | number | null)[]): T[];
  tx(task: () => void): void;
};

export type Kind = 'income' | 'expense';
export type Status = 'unclassified' | 'classified';
export type VatPeriod = 'm' | 'q'; // μηνιαίος ή τριμηνιαίος ΦΠΑ
export type Company = { id: number; name: string; vat: string; env: 'prod' | 'dev'; via_accountant: number; vat_period: VatPeriod };
export type Doc = YearlyDoc & {
  company_id: number;
  mark: string;
  kind: Kind;
  status: Status;
  vat: string | null;
  name: string | null;
  series: string | null;
  aa: string | null;
  total_gross: number | null;
  lines_json: string;
  taxes_json: string;
  classification_mark: string;
  url: string | null;
};
export type Filter = { month?: string; status?: Status; search?: string };
export type Role = 'income' | 'expense' | 'both';
export type Counterparty = { vat: string; name: string | null; docs: number; role: Role };
export type CounterpartySort = 'name' | 'docs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, vat TEXT NOT NULL,
  env TEXT NOT NULL DEFAULT 'prod', via_accountant INTEGER NOT NULL DEFAULT 0, vat_period TEXT NOT NULL DEFAULT 'm');
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS names (vat TEXT PRIMARY KEY, name TEXT NOT NULL, fold TEXT NOT NULL, manual INTEGER NOT NULL DEFAULT 0, original TEXT);
CREATE TABLE IF NOT EXISTS documents (
  company_id INTEGER NOT NULL, mark TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
  issue_date TEXT, vat TEXT, invoice_type TEXT, series TEXT, aa TEXT,
  total_net REAL, total_vat REAL, total_gross REAL, total_withheld REAL, total_other_taxes REAL,
  total_stamp_duty REAL, total_fees REAL, total_deductions REAL,
  lines_json TEXT NOT NULL, cls_json TEXT NOT NULL, taxes_json TEXT NOT NULL,
  classification_mark TEXT NOT NULL DEFAULT '', url TEXT,
  PRIMARY KEY (company_id, mark));
CREATE INDEX IF NOT EXISTS documents_book ON documents (company_id, kind, issue_date);
`;

/** Για αναζήτηση: το LIKE του sqlite δεν αγνοεί πεζά/τόνους στα ελληνικά. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export class Store {
  private db: Db;
  private listeners = new Set<() => void>();

  /** Ειδοποίηση όταν αλλάζει η ενεργή εταιρεία ή τα στοιχεία της (τίτλος οθονών). */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  changed() {
    for (const listener of this.listeners) listener();
  }

  constructor(db: Db) {
    this.db = db;
    db.exec(SCHEMA);
    // Βάσεις παλιότερης έκδοσης.
    const add = (table: string, column: string, type: string) => {
      if (!db.all<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      }
    };
    add('companies', 'vat_period', "TEXT NOT NULL DEFAULT 'm'");
    add('names', 'manual', 'INTEGER NOT NULL DEFAULT 0');
    add('names', 'original', 'TEXT');
    add('documents', 'uid', 'TEXT');
    // Παλιές λήψεις: παραστατικά μηδενικής αξίας μετρούν ως χαρακτηρισμένα (ίδιος κανόνας με τη λήψη).
    type Row = { company_id: number; mark: string; kind: Kind; invoice_type: string | null; total_net: number | null; total_vat: number | null; lines_json: string };
    for (const r of db.all<Row>("SELECT company_id, mark, kind, invoice_type, total_net, total_vat, lines_json FROM documents WHERE status = 'unclassified'")) {
      const cls = zeroValueCls({ ...r, lines: JSON.parse(r.lines_json) }, r.kind);
      if (cls) {
        db.run("UPDATE documents SET status = 'classified', cls_json = ? WHERE company_id = ? AND mark = ?",
          [JSON.stringify(cls), r.company_id, r.mark]);
      }
    }
  }

  // ---------- εταιρείες ----------
  companies(): Company[] {
    return this.db.all<Company>('SELECT * FROM companies ORDER BY name COLLATE NOCASE');
  }

  addCompany(c: Omit<Company, 'id' | 'vat_period'> & { vat_period?: VatPeriod }): number {
    const first = !this.companies().length;
    const id = this.db.run('INSERT INTO companies (name, vat, env, via_accountant, vat_period) VALUES (?, ?, ?, ?, ?)',
      [c.name, c.vat, c.env, c.via_accountant, c.vat_period ?? 'm']);
    if (first) this.setActive(id);
    this.changed();
    return id;
  }

  updateCompany(c: Company): void {
    const old = this.companies().find((x) => x.id === c.id);
    // Τα MARK ανήκουν σε ΑΦΜ και περιβάλλον: αλλαγή τους = ξανά αρχική λήψη.
    if (old && (old.vat !== c.vat || old.env !== c.env)) this.resetMarks(c.id);
    this.db.run('UPDATE companies SET name = ?, vat = ?, env = ?, via_accountant = ?, vat_period = ? WHERE id = ?',
      [c.name, c.vat, c.env, c.via_accountant, c.vat_period, c.id]);
    this.changed();
  }

  deleteCompany(id: number): void {
    this.db.tx(() => {
      this.db.run('DELETE FROM documents WHERE company_id = ?', [id]);
      this.db.run('DELETE FROM companies WHERE id = ?', [id]);
      this.db.run("DELETE FROM settings WHERE key = 'active_company' AND value = ?", [String(id)]);
      this.db.run('DELETE FROM settings WHERE key = ?', [`last_sync:${id}`]);
      this.resetMarks(id);
      this.db.run('DELETE FROM settings WHERE key LIKE ?', [`auto%:${id}`]);
    });
    this.changed();
  }

  /** Ξεχνά Αρχή και MARK της εταιρείας (βλ. book/fetch.ts). */
  resetMarks(id: number): void {
    this.db.run('DELETE FROM settings WHERE key LIKE ?', [`mark%:${id}`]);
  }

  /** Το μεγαλύτερο MARK του βιβλίου της εταιρείας (0 αν είναι άδειο). */
  maxMark(id: number): number {
    return this.db.all<{ m: number | null }>(
      'SELECT MAX(CAST(mark AS INTEGER)) AS m FROM documents WHERE company_id = ?', [id],
    )[0]?.m ?? 0;
  }

  setActive(id: number): void {
    this.setSetting('active_company', String(id));
    this.changed();
  }

  /** Η ενεργή εταιρεία· αν λείπει, η πρώτη διαθέσιμη. */
  activeCompany(): Company | null {
    const id = Number(this.setting('active_company'));
    const all = this.companies();
    return all.find((c) => c.id === id) ?? all[0] ?? null;
  }

  setting(key: string): string | null {
    return this.db.all<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])[0]?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }

  // ---------- επωνυμίες ----------
  names(): Map<string, string> {
    return new Map(this.db.all<{ vat: string; name: string }>('SELECT vat, name FROM names').map((r) => [r.vat, r.name]));
  }

  /** Επωνυμίες από τη λήψη. Όσες διόρθωσε ο χρήστης δεν αλλάζουν: η νέα κρατιέται για την επαναφορά. */
  saveNames(names: Map<string, string>): void {
    this.db.tx(() => {
      for (const [vat, name] of names) {
        this.db.run(
          `INSERT INTO names (vat, name, fold) VALUES (?, ?, ?)
           ON CONFLICT(vat) DO UPDATE SET
             name = CASE WHEN manual = 1 THEN name ELSE excluded.name END,
             fold = CASE WHEN manual = 1 THEN fold ELSE excluded.fold END,
             original = CASE WHEN manual = 1 THEN excluded.name ELSE original END`,
          [vat, name, fold(name)],
        );
      }
    });
  }

  /** Διόρθωση από τον χρήστη: κοινή για όλες τις εταιρείες, και μένει όποια επωνυμία κι αν φέρει η λήψη. */
  renameCounterparty(vat: string, name: string): boolean {
    const clean = name.split(/\s+/).filter(Boolean).join(' ').slice(0, 200);
    if (!clean) return false;
    this.db.run(
      `INSERT INTO names (vat, name, fold, manual) VALUES (?, ?, ?, 1)
       ON CONFLICT(vat) DO UPDATE SET
         original = CASE WHEN manual = 1 THEN original ELSE name END,
         name = excluded.name, fold = excluded.fold, manual = 1`,
      [vat, clean, fold(clean)],
    );
    return true;
  }

  isRenamed(vat: string): boolean {
    return this.db.all('SELECT 1 FROM names WHERE vat = ? AND manual = 1', [vat]).length > 0;
  }

  /** Ακυρώνει τη διόρθωση. false: η αρχική επωνυμία δεν είναι γνωστή, οπότε έμεινε χωρίς επωνυμία ως την επόμενη εύρεση. */
  resetCounterparty(vat: string): boolean {
    const row = this.db.all<{ original: string | null }>('SELECT original FROM names WHERE vat = ? AND manual = 1', [vat])[0];
    if (!row) return true;
    if (row.original === null) {
      this.db.run('DELETE FROM names WHERE vat = ?', [vat]);
      return false;
    }
    this.db.run('UPDATE names SET name = ?, fold = ?, manual = 0, original = NULL WHERE vat = ?', [row.original, fold(row.original), vat]);
    return true;
  }

  // ---------- παραστατικά ----------
  /**
   * Αποθήκευση λήψης: πρώτα αφαίρεση ακυρωμένων, μετά εγγραφή. Κάθε εγγραφή αντικαθίσταται, αφού εδώ δεν υπάρχει
   * τοπική πρόοδος χαρακτηρισμού. removeFrom: ποιο βιβλίο καθαρίζεται (τα έξοδα αγγίζουν μόνο τα δικά τους).
   */
  saveBook(companyId: number, kind: Kind, docs: [Invoice, Status][], remove: Set<string>, removeFrom?: Kind): void {
    this.db.tx(() => {
      for (const mark of remove) {
        this.db.run(`DELETE FROM documents WHERE company_id = ? AND mark = ?${removeFrom ? ' AND kind = ?' : ''}`,
          removeFrom ? [companyId, mark, removeFrom] : [companyId, mark]);
      }
      for (const [inv, status] of docs) {
        // Ίδιο UID με άλλο MARK (ξαναδιαβίβαση): μετρά μόνο το νεότερο MARK.
        if (inv.uid) {
          const others = this.db.all<{ mark: string }>('SELECT mark FROM documents WHERE company_id = ? AND uid = ? AND mark <> ?',
            [companyId, inv.uid, inv.mark]);
          if (others.some((o) => Number(o.mark) > Number(inv.mark))) continue;
          for (const o of others) this.db.run('DELETE FROM documents WHERE company_id = ? AND mark = ?', [companyId, o.mark]);
        }
        const e = inv.extra_totals;
        this.db.run(
          `INSERT OR REPLACE INTO documents (company_id, mark, kind, status, issue_date, vat, invoice_type, series, aa,
             total_net, total_vat, total_gross, total_withheld, total_other_taxes, total_stamp_duty, total_fees,
             total_deductions, lines_json, cls_json, taxes_json, classification_mark, url, uid)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [companyId, inv.mark, kind, status, inv.issue_date, kind === 'income' ? inv.counterpart_vat : inv.issuer_vat,
            inv.invoice_type, inv.series, inv.aa, inv.total_net, inv.total_vat, inv.total_gross, e.total_withheld,
            e.total_other_taxes, e.total_stamp_duty, e.total_fees, e.total_deductions, JSON.stringify(inv.lines),
            JSON.stringify(inv.cls_info), JSON.stringify(inv.taxes), inv.classification_mark, inv.url, inv.uid ?? null],
        );
      }
    });
  }

  private static SELECT = `SELECT d.*, n.name AS name FROM documents d LEFT JOIN names n ON n.vat = d.vat`;

  documents(companyId: number, kind: Kind, filter: Filter, limit: number, offset: number): Doc[] {
    const where = ['d.company_id = ?', 'd.kind = ?'];
    const params: (string | number)[] = [companyId, kind];
    if (filter.month) {
      where.push('substr(d.issue_date, 1, 7) = ?');
      params.push(filter.month);
    }
    if (filter.status) {
      where.push('d.status = ?');
      params.push(filter.status);
    }
    const search = filter.search?.trim();
    if (search) {
      where.push("(d.vat LIKE ? ESCAPE '\\' OR n.fold LIKE ? ESCAPE '\\')");
      const like = `%${fold(search).replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like);
    }
    return this.db.all<Doc>(
      `${Store.SELECT} WHERE ${where.join(' AND ')} ORDER BY d.issue_date DESC, d.mark DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
  }

  document(companyId: number, mark: string): Doc | null {
    return this.db.all<Doc>(`${Store.SELECT} WHERE d.company_id = ? AND d.mark = ?`, [companyId, mark])[0] ?? null;
  }

  /** Πελάτες και προμηθευτές της εταιρείας, από τα παραστατικά της. Όποιος είναι και τα δύο ανήκει και στα δύο φίλτρα. Χωρίς επωνυμία πάντα στο τέλος. */
  counterparties(companyId: number, filter: { search?: string; role?: 'income' | 'expense' }, sort: CounterpartySort): Counterparty[] {
    const where = ['d.company_id = ?', 'd.vat IS NOT NULL'];
    const params: (string | number)[] = [companyId];
    const search = filter.search?.trim();
    if (search) {
      where.push("(d.vat LIKE ? ESCAPE '\\' OR n.fold LIKE ? ESCAPE '\\')");
      const like = `%${fold(search).replace(/[\\%_]/g, '\\$&')}%`;
      params.push(like, like);
    }
    const order = sort === 'docs' ? 'docs DESC, d.vat' : 'n.fold IS NULL, n.fold, d.vat';
    const rows = this.db.all<{ vat: string; name: string | null; docs: number; income: number; expense: number }>(
      `SELECT d.vat, n.name, COUNT(*) AS docs, SUM(d.kind = 'income') AS income, SUM(d.kind = 'expense') AS expense
       FROM documents d LEFT JOIN names n ON n.vat = d.vat
       WHERE ${where.join(' AND ')} GROUP BY d.vat ORDER BY ${order}`, params,
    );
    return rows
      .map((r): Counterparty => ({
        vat: r.vat, name: r.name, docs: r.docs,
        role: r.income && r.expense ? 'both' : r.income ? 'income' : 'expense',
      }))
      .filter((r) => !filter.role || r.role === filter.role || r.role === 'both');
  }

  counterpartyDocuments(companyId: number, vat: string, limit: number, offset: number): Doc[] {
    return this.db.all<Doc>(
      `${Store.SELECT} WHERE d.company_id = ? AND d.vat = ?
       ORDER BY d.issue_date DESC, CAST(d.mark AS INTEGER) DESC LIMIT ? OFFSET ?`, [companyId, vat, limit, offset],
    );
  }

  months(companyId: number, kind: Kind): string[] {
    return this.db.all<{ m: string }>(
      `SELECT DISTINCT substr(issue_date, 1, 7) AS m FROM documents
       WHERE company_id = ? AND kind = ? AND issue_date IS NOT NULL ORDER BY m DESC`, [companyId, kind],
    ).map((r) => r.m);
  }

  years(companyId: number): string[] {
    return this.db.all<{ y: string }>(
      `SELECT DISTINCT substr(issue_date, 1, 4) AS y FROM documents
       WHERE company_id = ? AND issue_date IS NOT NULL ORDER BY y DESC`, [companyId],
    ).map((r) => r.y);
  }

  yearDocuments(companyId: number, kind: Kind, year: string, withUnclassified: boolean): Doc[] {
    return this.db.all<Doc>(
      `${Store.SELECT} WHERE d.company_id = ? AND d.kind = ? AND substr(d.issue_date, 1, 4) = ?
       ${withUnclassified ? '' : "AND d.status = 'classified'"}`, [companyId, kind, year],
    );
  }
}
