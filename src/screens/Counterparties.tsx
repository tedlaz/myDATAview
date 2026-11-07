// Συναλλασσόμενοι της ενεργής εταιρείας: πελάτες και προμηθευτές, όπως προκύπτουν από τα παραστατικά της.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getStore } from '../db.ts';
import { shortName } from '../names.ts';
import type { Counterparty, CounterpartySort } from '../store.ts';
import { Avatar, RolePill } from '../ui/Counterparty.tsx';
import { Button, Chips, MONO, useColors } from '../ui/theme.tsx';

export default function Counterparties() {
  const c = useColors();
  const [hasCompany, setHasCompany] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'income' | 'expense' | ''>('');
  const [sort, setSort] = useState<CounterpartySort>('name');
  const [list, setList] = useState<Counterparty[]>([]);

  useFocusEffect(useCallback(() => {
    const store = getStore();
    const active = store.activeCompany();
    setHasCompany(!!active);
    if (active) setList(store.counterparties(active.id, { search, role: role || undefined }, sort));
  }, [search, role, sort]));

  if (!hasCompany) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.text, marginBottom: 12 }}>Πρόσθεσε πρώτα μια εταιρεία.</Text>
        <Button title="Εταιρείες" onPress={() => router.navigate('/settings')} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <TextInput value={search} onChangeText={setSearch} placeholder="Αναζήτηση επωνυμίας ή ΑΦΜ" placeholderTextColor={c.muted}
        accessibilityLabel="Αναζήτηση" autoCorrect={false}
        style={[styles.search, { color: c.text, backgroundColor: c.card, borderColor: c.line }]} />
      <Chips value={role} onChange={setRole}
        options={[['', 'Όλοι'], ['income', 'Πελάτες'], ['expense', 'Προμηθευτές']]} />
      <Chips value={sort} onChange={setSort} options={[['name', 'Αλφαβητικά'], ['docs', 'Με τα περισσότερα παραστατικά']]} />
      <FlatList data={list} keyExtractor={(t) => t.vat} keyboardShouldPersistTaps="handled" style={styles.list}
        ListHeaderComponent={<Text style={[styles.count, { color: c.muted }]}>{list.length} συναλλασσόμενοι</Text>}
        ListEmptyComponent={<Text style={[styles.none, { color: c.muted }]}>Δεν βρέθηκαν συναλλασσόμενοι.</Text>}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/counterparty/[vat]', params: { vat: item.vat } })}
            style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
            <Avatar name={item.name} role={item.role} />
            <View style={styles.text}>
              <Text numberOfLines={2} style={[styles.name, { color: c.text }]}>{shortName(item.name) || 'Χωρίς επωνυμία'}</Text>
              <Text style={[styles.vat, { color: c.muted }]}>{item.vat}</Text>
            </View>
            <RolePill role={item.role} />
            <Text accessibilityLabel={`${item.docs} παραστατικά`} style={[styles.docs, { color: c.text }]}>{item.docs}</Text>
          </Pressable>
        )} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  search: { borderWidth: 1, borderRadius: 10, minHeight: 44, paddingHorizontal: 12, marginBottom: 4 },
  list: { flex: 1, marginTop: 6 },
  count: { fontSize: 13, marginBottom: 6 },
  none: { textAlign: 'center', padding: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 8, minHeight: 60 },
  text: { flex: 1 },
  name: { fontWeight: '600' },
  vat: { fontFamily: MONO, fontSize: 12.5 },
  docs: { fontFamily: MONO, fontSize: 13, fontWeight: '700', minWidth: 30, textAlign: 'right' },
});
