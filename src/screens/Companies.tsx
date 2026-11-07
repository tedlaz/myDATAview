import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getStore } from '../db.ts';
import type { Company } from '../store.ts';
import { Button, Card, useColors } from '../ui/theme.tsx';

export default function Companies() {
  const c = useColors();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [active, setActive] = useState<number | null>(null);

  const load = useCallback(() => {
    const store = getStore();
    setCompanies(store.companies());
    setActive(store.activeCompany()?.id ?? null);
  }, []);
  useFocusEffect(load);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.screen}>
      {companies.map((co) => (
        <Card key={co.id}>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: co.id === active }} onPress={() => {
            getStore().setActive(co.id);
            load();
          }}>
            <Text style={[styles.name, { color: c.text }]}>{co.id === active ? '✓ ' : ''}{co.name}</Text>
            <Text style={{ color: c.muted }}>ΑΦΜ {co.vat} · {co.env}{co.via_accountant ? ' · κλειδιά λογιστή' : ''}</Text>
          </Pressable>
          <View style={styles.edit}>
            <Button kind="ghost" title="Επεξεργασία" onPress={() => router.push({ pathname: '/company', params: { id: co.id } })} />
          </View>
        </Card>
      ))}
      {!companies.length && <Text style={[styles.none, { color: c.muted }]}>Καμία εταιρεία ακόμα.</Text>}
      <Button title="Νέα εταιρεία" onPress={() => router.push('/company')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12 },
  name: { fontWeight: '600' },
  edit: { marginTop: 10, alignSelf: 'flex-start' },
  none: { textAlign: 'center', padding: 24 },
});
