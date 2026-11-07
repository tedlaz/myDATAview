// Τα παραστατικά ενός συναλλασσόμενου στην ενεργή εταιρεία: έσοδα και έξοδα μαζί, νεότερα πρώτα.
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { getStore } from '../../db.ts';
import { shortName } from '../../names.ts';
import { DocCard } from '../../ui/Book.tsx';
import { Avatar, RolePill, roleLabel } from '../../ui/Counterparty.tsx';
import { Button, Card, MONO, useBottomSpace, useColors } from '../../ui/theme.tsx';
import { lookupName } from '../../vies.ts';

const PAGE = 50;

export default function CounterpartyScreen() {
  const c = useColors();
  const bottom = useBottomSpace();
  const { vat } = useLocalSearchParams<{ vat: string }>();
  const store = getStore();
  const id = store.activeCompany()?.id ?? 0;
  const [, setRevision] = useState(0);
  const [draft, setDraft] = useState<string | null>(null); // null: δεν γίνεται διόρθωση
  const [resetting, setResetting] = useState(false);
  const info = store.counterparties(id, { search: vat }, 'name').find((t) => t.vat === vat);
  const [docs, setDocs] = useState(() => store.counterpartyDocuments(id, vat, PAGE, 0));

  const save = () => {
    if (draft === null) return;
    if (store.renameCounterparty(vat, draft)) {
      setDraft(null);
      setRevision((r) => r + 1);
    }
  };

  const reset = async () => {
    setDraft(null);
    if (!store.resetCounterparty(vat)) {
      // Διορθώθηκε πριν κρατάμε την αρχική επωνυμία: τη ζητάμε ξανά.
      setResetting(true);
      const name = await lookupName(vat);
      if (name) store.saveNames(new Map([[vat, name]]));
      setResetting(false);
    }
    setRevision((r) => r + 1);
  };

  const more = () => {
    if (docs.length % PAGE) return;
    const next = store.counterpartyDocuments(id, vat, PAGE, docs.length);
    if (next.length) setDocs([...docs, ...next]);
  };

  return (
    <FlatList data={docs} keyExtractor={(d) => d.mark} onEndReached={more} onEndReachedThreshold={0.5} keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.screen, bottom]}
      ListHeaderComponent={info ? (
        <Card>
          <View style={styles.who}>
            <Avatar name={info.name} role={info.role} />
            <View style={styles.text}>
              <Text style={[styles.name, { color: c.text }]}>{shortName(info.name) || 'Χωρίς επωνυμία'}</Text>
              <Text style={{ color: c.muted, fontFamily: MONO, fontSize: 12.5 }}>{info.vat}</Text>
            </View>
            <RolePill role={info.role} />
          </View>
          <Text style={[styles.meta, { color: c.muted }]}>{roleLabel(info.role)} · {info.docs} παραστατικά</Text>
          {draft === null ? (
            <View style={styles.edit}>
              <Button kind="ghost" title="Διόρθωση επωνυμίας" onPress={() => setDraft(info.name ?? '')} />
              {store.isRenamed(vat) && (
                <View style={styles.reset}>
                  <Button kind="ghost" title="Επαναφορά αρχικής επωνυμίας" onPress={reset} disabled={resetting} />
                </View>
              )}
            </View>
          ) : (
            <View style={styles.edit}>
              <TextInput value={draft} onChangeText={setDraft} multiline accessibilityLabel="Επωνυμία" maxLength={200} autoFocus
                style={[styles.input, { color: c.text, backgroundColor: c.bg, borderColor: c.line }]} />
              <View style={styles.actions}>
                <View style={styles.action}><Button title="Αποθήκευση" onPress={save} disabled={!draft.trim()} /></View>
                <View style={styles.action}><Button kind="ghost" title="Άκυρο" onPress={() => setDraft(null)} /></View>
              </View>
            </View>
          )}
        </Card>
      ) : undefined}
      ListEmptyComponent={<Text style={[styles.none, { color: c.muted }]}>Δεν υπάρχουν παραστατικά.</Text>}
      renderItem={({ item }) => <DocCard doc={item} showKind />} />
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1 },
  name: { fontWeight: '700', fontSize: 15 },
  meta: { marginTop: 8, fontSize: 13 },
  none: { textAlign: 'center', padding: 24 },
  edit: { marginTop: 10 },
  reset: { marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flex: 1 },
});
