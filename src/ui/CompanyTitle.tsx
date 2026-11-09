// Ο τίτλος των κύριων οθονών: η ενεργή εταιρεία, ώστε να φαίνεται πάντα σε ποια δουλεύεις.
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { getStore } from '../db.ts';
import { MONO, useTheme } from './theme.tsx';

function companyName(): string {
  const company = getStore().activeCompany();
  if (!company) return 'myDATAview';
  return company.env === 'dev' ? `${company.name} (dev)` : company.name;
}

export function CompanyTitle() {
  const { colors: c, mono } = useTheme().theme;
  const name = useSyncExternalStore(getStore().subscribe, companyName);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Εταιρεία ${name}. Αλλαγή εταιρείας`}
      onPress={() => router.navigate('/settings')} style={styles.title}>
      <Text numberOfLines={1} style={[styles.text, { color: c.text }, mono && { fontFamily: MONO }]}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { minHeight: 44, justifyContent: 'center', maxWidth: 320 },
  text: { fontSize: 18, fontWeight: '700' },
});
