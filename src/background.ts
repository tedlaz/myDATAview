// Αυτόματη λήψη στο κινητό: χρονοδιακόπτης όσο η εφαρμογή είναι ανοιχτή, και εργασία παρασκηνίου στο APK.
// Στο παρασκήνιο την ακριβή ώρα την ορίζει το σύστημα (ελάχιστο 15 λεπτά, με δίκτυο και αρκετή μπαταρία).
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { autoHours, nextDueAt, runAuto } from './book/auto.ts';
import { getStore } from './db.ts';
import { loadKeys } from './secrets.ts';
import { lookupName } from './vies.ts';

const TASK = 'mydataview-auto-fetch';
const MIN_WAIT_MS = 1000;
const MAX_WAIT_MS = 60_000; // πιο μακριά αναμονή σπάει σε βήματα: το Android δεν θέλει μεγάλους JS χρονοδιακόπτες

// Στο Expo Go το TaskManager δεν υπάρχει στο Android: οι βιβλιοθήκες φορτώνονται μόνο στο κανονικό APK.
const native = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
const run = () => runAuto({ store: getStore(), loadKeys, lookup: lookupName });

if (native) {
  const TaskManager = require('expo-task-manager');
  const BackgroundTask = require('expo-background-task');
  // Πρέπει να οριστεί στο global scope: στο παρασκήνιο δεν υπάρχουν components.
  TaskManager.defineTask(TASK, async () => {
    try {
      await run();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/**
 * Καταχωρεί ή αφαιρεί την εργασία παρασκηνίου κατά τη ρύθμιση. Με keep μένει ως έχει αν υπάρχει ήδη: νέα καταχώρηση
 * ξαναρχίζει το διάστημα από την αρχή, οπότε γίνεται μόνο όταν αλλάζει η ρύθμιση, όχι σε κάθε άνοιγμα.
 */
export async function scheduleBackground(hours: number, keep = false): Promise<void> {
  if (!native) return;
  const BackgroundTask = require('expo-background-task');
  const TaskManager = require('expo-task-manager');
  const registered = await TaskManager.isTaskRegisteredAsync(TASK);
  if (registered && hours && keep) return;
  if (registered) await BackgroundTask.unregisterTaskAsync(TASK);
  if (hours) await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: Math.max(15, Math.round(hours * 60)) });
}

/** Με ανοιχτή εφαρμογή: ένας χρονοδιακόπτης για την επόμενη λήψη, χωρίς έλεγχο όταν δεν υπάρχει καμία ή η εφαρμογή δεν φαίνεται. */
export function useAutoFetch(): void {
  useEffect(() => {
    const store = getStore();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Τα βήματα αναμονής δεν ξαναδιαβάζουν τη βάση: κάθε αλλαγή ρύθμισης φτάνει εδώ μέσω subscribe.
    const wait = (next: number) => {
      timer = setTimeout(() => {
        if (Date.now() >= next) run().finally(arm);
        else wait(next);
      }, Math.min(Math.max(next - Date.now(), MIN_WAIT_MS), MAX_WAIT_MS));
    };
    const arm = () => {
      clearTimeout(timer);
      const next = AppState.currentState === 'background' ? null : nextDueAt(store);
      if (next !== null) wait(next);
    };
    scheduleBackground(autoHours(store), true).catch(() => {});
    arm();
    const unsubscribe = store.subscribe(arm);
    const listener = AppState.addEventListener('change', arm);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      listener.remove();
    };
  }, []);
}
