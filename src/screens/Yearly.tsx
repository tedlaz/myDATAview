// Συνοπτικό βιβλίο. Μετρά εξ ορισμού και τα αχαρακτήριστα, όπως το βιβλίο του myDATA: εδώ δεν γίνεται χαρακτηρισμός.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { todayGr } from '../aade/client.ts';
import { elAmount, monthRows, round2, sumTotals, tableRows, yearlyTotals, type MonthRow } from '../book/yearly.ts';
import { getStore } from '../db.ts';
import type { Company } from '../store.ts';
import { Button, Card, Chips, Row, useColors, Title } from '../ui/theme.tsx';
import { YearTableBody, YearTableHead } from '../ui/YearTable.tsx';

type Props = {
  year: string; setYear: (y: string) => void; withUnclassified: boolean; setWithUnclassified: (v: boolean) => void;
};

export default function Yearly({ year, setYear, withUnclassified, setWithUnclassified }: Props) {
  const c = useColors();
  const [company, setCompany] = useState<Company | null>(null);
  const [years, setYears] = useState<string[]>([]);
  const [period, setPeriod] = useState<'month' | 'quarter'>('month');
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [scrollX] = useState(() => new Animated.Value(0));

  useFocusEffect(useCallback(() => {
    const store = getStore();
    const active = store.activeCompany();
    setCompany(active);
    if (!active) return;
    const today = todayGr();
    setYears([...new Set([today.slice(6), ...store.years(active.id)])].sort().reverse());
    const income = yearlyTotals(store.yearDocuments(active.id, 'income', year, withUnclassified));
    const expense = yearlyTotals(store.yearDocuments(active.id, 'expense', year, withUnclassified));
    const last = year === today.slice(6) ? Number(today.slice(3, 5)) : 12; // τρέχον έτος: έως τον τρέχοντα μήνα
    setRows(monthRows(income, expense, year, last));
  }, [year, withUnclassified]));

  if (!company) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.text, marginBottom: 12 }}>Πρόσθεσε πρώτα μια εταιρεία.</Text>
        <Button title="Εταιρείες" onPress={() => router.navigate('/settings')} />
      </View>
    );
  }

  const income = sumTotals(rows.map((m) => m.income));
  const expense = sumTotals(rows.map((m) => m.expense));
  const balance = round2(income.net - expense.net);
  const vat = round2(income.vat - expense.vat);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.screen} stickyHeaderIndices={[1]}>
      <View>
        <Chips value={year} onChange={setYear} options={years.map((y): [string, string] => [y, y])} />
        <Chips value={period} onChange={setPeriod} options={[['month', 'Ανά μήνα'], ['quarter', 'Ανά τρίμηνο']]} />
        <View style={styles.toggle}>
          <Text style={{ color: c.text, flexShrink: 1 }}>Με αχαρακτήριστα (όπως το myDATA)</Text>
          <Switch value={withUnclassified} onValueChange={setWithUnclassified} accessibilityLabel="Με αχαρακτήριστα" />
        </View>
        <Card>
          <Title style={styles.title}>Σύνολο {year}</Title>
          <Row label="Έσοδα" value={`${elAmount(income.net)} €`} />
          <Row label="Έξοδα" value={`${elAmount(expense.net)} €`} />
          <Row label="Υπόλοιπο εσ. − εξ." value={`${elAmount(balance)} €`} strong color={balance < 0 ? c.bad : c.good} />
          <Row label="ΦΠΑ εκροών − εισροών" value={`${elAmount(vat)} €`} />
        </Card>
      </View>
      <YearTableHead scrollX={scrollX} />
      <YearTableBody scrollX={scrollX} rows={tableRows(rows, year, period === 'quarter')} income={income} expense={expense}
        onOpen={(kind, month) => router.navigate({ pathname: `/${kind}`, params: { month, t: String(Date.now()) } })} />
      <Text style={[styles.note, { color: c.muted }]}>
        Σύρε τον πίνακα οριζόντια για όλες τις στήλες. Ποσά σε €. Τα πιστωτικά αφαιρούνται. «Τρίτων» = χαρακτηρισμοί κατηγορίας 1.9/2.9.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 },
  title: { fontWeight: '700', marginBottom: 4 },
  note: { fontSize: 13 },
});
