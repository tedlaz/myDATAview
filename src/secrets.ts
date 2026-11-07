// Κλειδιά ΑΑΔΕ στο Android Keystore / iOS Keychain. Μένουν μόνο στη συσκευή και δεν εμφανίζονται ξανά.
import * as SecureStore from 'expo-secure-store';
import type { Keys } from './book/fetch.ts';

const name = (id: number, field: string) => `company.${id}.${field}`;
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function saveKeys(id: number, keys: Keys): Promise<void> {
  await SecureStore.setItemAsync(name(id, 'user'), keys.userId, options);
  await SecureStore.setItemAsync(name(id, 'key'), keys.subscriptionKey, options);
}

export async function loadKeys(id: number): Promise<Keys | null> {
  const userId = await SecureStore.getItemAsync(name(id, 'user'), options);
  const subscriptionKey = await SecureStore.getItemAsync(name(id, 'key'), options);
  return userId && subscriptionKey ? { userId, subscriptionKey } : null;
}

export async function deleteKeys(id: number): Promise<void> {
  await SecureStore.deleteItemAsync(name(id, 'user'), options);
  await SecureStore.deleteItemAsync(name(id, 'key'), options);
}
