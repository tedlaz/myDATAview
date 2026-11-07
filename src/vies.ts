// Επωνυμία από ΑΦΜ μέσω του δημόσιου VIES. Βοηθητικό: κάθε αποτυχία σημαίνει απλώς «χωρίς επωνυμία».
const BASE_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/EL/vat/';
const TIMEOUT_MS = 15_000;

export type Lookup = (vat: string) => Promise<string | null>;

export const lookupName: Lookup = async (vat) => {
  const number = vat.replace(/[^A-Za-z0-9]/g, '').replace(/^EL/i, '');
  if (!number) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(BASE_URL + number, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (resp.status !== 200) return null;
    const data = await resp.json();
    const valid = 'isValid' in data ? data.isValid : data.valid;
    const name = String(data.name ?? '').trim();
    // Το VIES δίνει «---» όταν το κράτος-μέλος δεν κοινοποιεί το στοιχείο.
    return valid && name && name !== '---' ? name : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
