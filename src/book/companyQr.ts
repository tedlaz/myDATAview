// Νέα εταιρεία από το QR που δείχνει το myDATA Classifier. Το περιεχόμενο έρχεται από την κάμερα, άρα ελέγχεται αυστηρά.
import type { Company, Store, VatPeriod } from '../store.ts';
import type { Keys } from './fetch.ts';

const FORMAT = 'mydataview-company';
const MAX_NAME = 200;
const MAX_KEY = 200;

export type CompanyQr = { name: string; vat: string; env: Company['env']; vat_period: VatPeriod; keys: Keys };

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null);

/** Τα στοιχεία του QR, ή null αν δεν είναι QR εταιρείας του myDATA. */
export function parseCompanyQr(data: string): CompanyQr | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || raw.format !== FORMAT || raw.v !== 1) return null;
  const name = text(raw.name, MAX_NAME);
  const vat = text(raw.vat, 9);
  const userId = text(raw.user, MAX_KEY);
  const subscriptionKey = text(raw.key, MAX_KEY);
  if (!name || !vat || !/^\d{9}$/.test(vat) || !userId || !subscriptionKey) return null;
  if (raw.env !== 'prod' && raw.env !== 'dev') return null;
  if (raw.vat_period !== 'm' && raw.vat_period !== 'q') return null;
  return { name, vat, env: raw.env, vat_period: raw.vat_period, keys: { userId, subscriptionKey } };
}

/** Προσθέτει την εταιρεία, ή ενημερώνει όποια έχει ίδιο ΑΦΜ και περιβάλλον, και την κάνει ενεργή. */
export async function importCompany(store: Store, qr: CompanyQr, saveKeys: (id: number, keys: Keys) => Promise<void>) {
  const existing = store.companies().find((c) => c.vat === qr.vat && c.env === qr.env);
  const data = { name: qr.name, vat: qr.vat, env: qr.env, vat_period: qr.vat_period, via_accountant: 0 };
  const id = existing?.id ?? store.addCompany(data);
  try {
    await saveKeys(id, qr.keys);
  } catch (e) {
    if (!existing) store.deleteCompany(id);
    throw e;
  }
  if (existing) store.updateCompany({ ...data, id });
  store.setActive(id);
  return { id, created: !existing };
}
