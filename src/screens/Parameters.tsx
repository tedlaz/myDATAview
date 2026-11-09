// Παράμετροι εφαρμογής. Θέματα: τα ίδια με το myDATA, και «Αυτόματο» που ακολουθεί το κινητό.
import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AUTO, Card, Row, Title, useColors, useTheme } from '../ui/theme.tsx';
import { THEMES } from '../ui/themes.ts';

export default function Parameters() {
  const c = useColors();
  const { choice, choose } = useTheme();

  const option = (key: string, name: string, swatch: React.ReactNode) => {
    const on = key === choice;
    return (
      <Pressable key={key} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => choose(key)}
        style={[styles.option, { backgroundColor: c.card, borderColor: on ? c.accent : c.line }]}>
        {swatch}
        <Text style={[styles.name, { color: c.text }]}>{name}</Text>
        {on && <Text style={{ color: c.accent, fontWeight: '700' }}>✓</Text>}
      </Pressable>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.screen}>
      <Title style={styles.heading}>Θέμα εμφάνισης</Title>
      {option(AUTO, 'Αυτόματο (όπως το κινητό)', (
        <View style={[styles.swatch, { borderColor: c.line, backgroundColor: c.bg }]} />
      ))}
      <Text style={[styles.group, { color: c.muted }]}>Φωτεινά</Text>
      {THEMES.filter((t) => !t.dark).map((t) => option(t.key, t.name, <Swatch key={t.key} bg={t.colors.bg} side={t.side} accent={t.colors.accent} />))}
      <Text style={[styles.group, { color: c.muted }]}>Σκοτεινά</Text>
      {THEMES.filter((t) => t.dark).map((t) => option(t.key, t.name, <Swatch key={t.key} bg={t.colors.bg} side={t.side} accent={t.colors.accent} />))}
      <View style={styles.about}>
        <Card>
          <Title style={styles.heading}>Σχετικά</Title>
          <Row label="Έκδοση" value={Constants.expoConfig?.version ?? '—'} />
          <Text style={{ color: c.muted, marginTop: 6 }}>Μόνο διαβάζει από το myDATA. Δεν στέλνει τίποτα στην ΑΑΔΕ. Τα δεδομένα μένουν στο κινητό.</Text>
        </Card>
      </View>
    </ScrollView>
  );
}

function Swatch({ bg, side, accent }: { bg: string; side: string; accent: string }) {
  const c = useColors();
  return (
    <View style={[styles.swatch, { borderColor: c.line, backgroundColor: bg }]}>
      <View style={[styles.side, { backgroundColor: side }]} />
      <View style={[styles.dot, { backgroundColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12, gap: 8 },
  heading: { fontWeight: '700', marginBottom: 4 },
  about: { marginTop: 10 },
  group: { marginTop: 10, fontSize: 13, fontWeight: '600' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, minHeight: 56, paddingHorizontal: 12 },
  name: { flex: 1 },
  swatch: { width: 40, height: 28, borderWidth: 1, borderRadius: 6, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  side: { width: 12, height: '100%' },
  dot: { width: 10, height: 10, borderRadius: 5, marginLeft: 8 },
});
