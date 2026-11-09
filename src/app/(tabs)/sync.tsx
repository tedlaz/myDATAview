// Λήψη: από MARK (προεπιλογή) με την αυτόματη λήψη, και χωριστά η αρχική λήψη και οι προηγούμενες περίοδοι.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { todayGr } from '../../aade/client.ts';
import { scheduleBackground } from '../../background.ts';
import { autoHours, formatHours, parseHours, restartAuto, setAutoHours } from '../../book/auto.ts';
import { fetchBooks, fetchNewBooks, grToIso, markReady, markStart, validGr, type Keys, type Outcome } from '../../book/fetch.ts';
import { elDate } from '../../book/yearly.ts';
import { getStore } from '../../db.ts';
import { loadKeys } from '../../secrets.ts';
import type { Company } from '../../store.ts';
import { AutoCountdown } from '../../ui/AutoCountdown.tsx';
import { DateField } from '../../ui/DateField.tsx';
import { Button, Card, MONO, Segments, useColors, useTheme } from '../../ui/theme.tsx';
import { lookupName } from '../../vies.ts';

type View_ = 'mark' | 'setup';

export default function Sync() {
  const c = useColors();
  const { mono } = useTheme().theme;
  const year = todayGr().slice(6);
  const [view, setView] = useState<View_>('mark');
  const [company, setCompany] = useState<Company | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [start, setStart] = useState<string | null>(null);
  const [hours, setHours] = useState(0);
  const [hoursText, setHoursText] = useState('1');
  const [restarted, setRestarted] = useState(0);
  const [first, setFirst] = useState(`01/01/${year}`);
  const [from, setFrom] = useState(`01/01/${Number(year) - 1}`);
  const [to, setTo] = useState(`31/12/${Number(year) - 1}`);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  const load = useCallback(() => {
    const store = getStore();
    const active = store.activeCompany();
    setCompany(active);
    const saved = autoHours(store);
    setHours(saved);
    if (saved) setHoursText(formatHours(saved));
    if (!active) return;
    setLast(store.setting(`last_sync:${active.id}`));
    setReady(markReady(store, active.id, 'income') && markReady(store, active.id, 'expense'));
    setStart(markStart(store, active.id, 'expense') ?? markStart(store, active.id, 'income'));
  }, []);
  useFocusEffect(load);

  const execute = async (task: (keys: Keys, co: Company) => Promise<Outcome[]>) => {
    setError('');
    setOutcomes([]);
    if (!company) return;
    const keys = await loadKeys(company.id);
    if (!keys) return setError('Λείπουν τα κλειδιά ΑΑΔΕ. Συμπλήρωσέ τα στην εταιρεία.');
    setRunning(true);
    try {
      setOutcomes(await task(keys, company));
      load();
    } finally {
      setRunning(false);
      setProgress('');
    }
  };

  const fetchNew = () => {
    if (!ready && !validGr(first)) return setError('Η ημερομηνία θέλει μορφή ηη/μμ/εεεε.');
    return execute(async (keys, co) => {
      const store = getStore();
      const result = await fetchNewBooks({ store, company: co, keys, start: grToIso(first), lookup: lookupName, progress: setProgress });
      restartAuto(store, co.id, result);
      setRestarted((n) => n + 1);
      return result;
    });
  };

  const fetchPeriod = () => {
    if (!validGr(from) || !validGr(to)) return setError('Οι ημερομηνίες θέλουν μορφή ηη/μμ/εεεε.');
    if (grToIso(from) > grToIso(to)) return setError('Η ημερομηνία «Από» πρέπει να προηγείται της «Έως».');
    return execute((keys, co) => fetchBooks({
      store: getStore(), company: co, keys, from, to, lookup: lookupName, progress: setProgress,
    }));
  };

  const changeStart = () => {
    Alert.alert('Αλλαγή αρχής', 'Η επόμενη λήψη θα ξαναγίνει αρχική, από την ημερομηνία που θα ορίσεις. Τα παραστατικά του κινητού μένουν.', [
      { text: 'Άκυρο', style: 'cancel' },
      {
        text: 'Αλλαγή',
        onPress: () => {
          if (company) getStore().resetMarks(company.id);
          load();
        },
      },
    ]);
  };

  const saveHours = (h: number) => {
    setError('');
    setAutoHours(getStore(), h);
    setHours(h);
    scheduleBackground(h).catch(() => setError('Η αυτόματη λήψη στο παρασκήνιο δεν ενεργοποιήθηκε.'));
  };

  const toggleAuto = (on: boolean) => {
    if (!on) return saveHours(0);
    const h = parseHours(hoursText) ?? 1;
    setHoursText(formatHours(h));
    return saveHours(h);
  };

  const commitHours = () => {
    const h = parseHours(hoursText);
    if (h) saveHours(h);
    else {
      setHoursText(formatHours(hours));
      setError('Οι ώρες θέλουν αριθμό από 0,25 και πάνω.');
    }
  };

  if (!company) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.text, marginBottom: 12 }}>Πρόσθεσε πρώτα μια εταιρεία.</Text>
        <Button title="Εταιρείες" onPress={() => router.navigate('/settings')} />
      </View>
    );
  }

  const input = [styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.line }];
  const title = [styles.title, { color: c.text }, mono && { fontFamily: MONO }];
  const date = (label: string, value: string, set: (v: string) => void) => (
    <DateField label={label} value={value} onChange={set} disabled={running} />
  );
  const status: ReactNode = (
    <>
      {running && (
        <View style={styles.progress}>
          <ActivityIndicator color={c.accent} />
          <Text style={{ color: c.muted }}>{progress}</Text>
        </View>
      )}
      {!!error && <Text accessibilityLiveRegion="polite" style={{ color: c.bad, marginTop: 12 }}>{error}</Text>}
      {outcomes.map((o) => (
        <Text key={o.kind} accessibilityLiveRegion="polite" style={{ color: o.ok ? c.good : c.bad, marginTop: 12 }}>{o.message}</Text>
      ))}
    </>
  );

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Segments value={view} onChange={setView} options={[['mark', 'Νέα από MARK'], ['setup', 'Αρχική & περίοδοι']]} />
      <Card>
        <Text style={title}>{company.name}</Text>
        <Text style={{ color: c.muted }}>ΑΦΜ {company.vat} · {company.env}</Text>
        {start && <Text style={{ color: c.muted }}>Βιβλίο από: {elDate(start)}</Text>}
        {last && <Text style={{ color: c.muted }}>Τελευταία λήψη: {last}</Text>}
      </Card>

      {view === 'mark' ? (
        <>
          {ready ? (
            <>
              <Text style={{ color: c.muted, marginBottom: 12 }}>
                Φέρνει ό,τι ανέβηκε στο myDATA από την τελευταία λήψη: νέα και εκπρόθεσμα παραστατικά, ακυρώσεις και χαρακτηρισμούς.
              </Text>
              <Button title={running ? 'Λήψη…' : 'Νέα παραστατικά'} onPress={fetchNew} disabled={running} />
            </>
          ) : (
            <>
              <Text style={{ color: c.muted, marginBottom: 12 }}>Για να ξεκινήσει η λήψη από MARK χρειάζεται πρώτα η αρχική λήψη.</Text>
              <Button title="Στην αρχική λήψη" onPress={() => setView('setup')} />
            </>
          )}
          {status}
          <View style={styles.section}>
            <Card>
              <View style={styles.autoHead}>
                <Text style={[title, styles.autoTitle]}>Αυτόματη λήψη</Text>
                <Switch value={hours > 0} onValueChange={toggleAuto} accessibilityLabel="Αυτόματη λήψη" />
              </View>
              {hours > 0 && (
                <View style={styles.every}>
                  <Text style={{ color: c.text }}>Κάθε</Text>
                  <TextInput value={hoursText} onChangeText={setHoursText} onEndEditing={commitHours} selectTextOnFocus
                    style={[input, styles.hours]} accessibilityLabel="Διάστημα σε ώρες" keyboardType="decimal-pad" maxLength={6} />
                  <Text style={{ color: c.text }}>ώρες</Text>
                </View>
              )}
              <Text style={[styles.note, { color: c.muted }]}>
                Για όλες τις εταιρείες με αρχική λήψη. Γράψε όσες ώρες θέλεις, π.χ. 3 ή 1,5. Με ανοιχτή την εφαρμογή γίνεται στην ώρα της. Κλειστή, την ώρα την ορίζει το Android, με δίκτυο και αρκετή μπαταρία.
              </Text>
              <AutoCountdown companyId={company.id} hours={hours} restarted={restarted} />
            </Card>
          </View>
        </>
      ) : (
        <>
          <Card>
            <Text style={title}>Αρχική λήψη</Text>
            {ready ? (
              <Text style={{ color: c.muted }}>Έγινε{start ? `, με αρχή ${elDate(start)}` : ''}. Οι επόμενες λήψεις πάνε με MARK.</Text>
            ) : (
              <>
                <Text style={{ color: c.muted }}>Φέρνει τα παραστατικά από την ημερομηνία που θα ορίσεις έως σήμερα. Οι επόμενες θα φέρνουν μόνο τα νέα.</Text>
                {date('Από', first, setFirst)}
                <View style={styles.actions}>
                  <Button title={running ? 'Λήψη…' : 'Αρχική λήψη'} onPress={fetchNew} disabled={running} />
                </View>
              </>
            )}
          </Card>
          <Card>
            <Text style={title}>Προηγούμενη περίοδος</Text>
            <Text style={{ color: c.muted }}>Για παραστατικά πριν από την αρχή του βιβλίου.</Text>
            {date('Από', from, setFrom)}
            {date('Έως', to, setTo)}
            <View style={styles.actions}>
              <Button kind="ghost" title="Λήψη περιόδου" onPress={fetchPeriod} disabled={running} />
            </View>
          </Card>
          {ready && (
            <Card>
              <Text style={title}>Αλλαγή αρχής</Text>
              <Text style={{ color: c.muted }}>Ξεχνά το MARK, ώστε η επόμενη λήψη να ξαναγίνει αρχική.</Text>
              <View style={styles.actions}>
                <Button kind="ghost" title="Αλλαγή αρχής" onPress={changeStart} disabled={running} />
              </View>
            </Card>
          )}
          {status}
        </>
      )}
      <Text style={[styles.note, { color: c.muted }]}>Η εφαρμογή μόνο διαβάζει από το myDATA. Δεν στέλνει τίποτα στην ΑΑΔΕ.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 12 },
  actions: { marginTop: 14 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  section: { marginTop: 16 },
  autoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  autoTitle: { marginBottom: 0 },
  every: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  hours: { width: 84, textAlign: 'center' },
  note: { marginTop: 8, fontSize: 13 },
});
