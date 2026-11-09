// Πίνακας ελέγχου. Μόνο προβολή: όσα στο desktop είναι εκκρεμότητες ενεργειών εδώ δεν υπάρχουν.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { todayGr } from '../aade/client.ts';
import { dashboard, type Counterparty } from '../book/dashboard.ts';
import { elAmount } from '../book/yearly.ts';
import { getStore } from '../db.ts';
import { shortName } from '../names.ts';
import type { Company } from '../store.ts';
import { ColumnChart, Legend, Meter, useSeries, type Slot } from '../ui/charts.tsx';
import { Button, Card, Chips, Row, useColors, Title } from '../ui/theme.tsx';
import { VatCard } from '../ui/VatCard.tsx';

type Data = ReturnType<typeof dashboard>;

function Tile({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : 'text'} disabled={!onPress} onPress={onPress}
      style={[styles.tile, { backgroundColor: c.card, borderColor: c.line }]}>
      <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tileValue, { color: value < 0 ? c.bad : c.text }]}>{elAmount(value)} €</Text>
    </Pressable>
  );
}

function Top({ title, list, color, empty }: { title: string; list: Counterparty[]; color: string; empty: string }) {
  const c = useColors();
  const max = Math.max(1, ...list.map((t) => t.amount));
  return (
    <Card>
      <Title style={styles.title}>{title}</Title>
      {!list.length && <Text style={{ color: c.muted }}>{empty}</Text>}
      {list.map((t) => (
        <View key={t.vat ?? t.name} style={styles.top}>
          <View style={styles.topRow}>
            <Text numberOfLines={1} style={{ color: c.text, flex: 1 }}>{shortName(t.name)}</Text>
            <Text style={{ color: c.text, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{elAmount(t.amount)} €</Text>
          </View>
          <Meter value={t.amount} max={max} color={color} />
          <Text style={{ color: c.muted, fontSize: 12 }}>{t.n} παραστατικ{t.n === 1 ? 'ό' : 'ά'}</Text>
        </View>
      ))}
    </Card>
  );
}

type Props = {
  year: string; setYear: (y: string) => void; withUnclassified: boolean; setWithUnclassified: (v: boolean) => void; onYearly: () => void;
};

export default function Dashboard({ year, setYear, withUnclassified, setWithUnclassified, onYearly }: Props) {
  const c = useColors();
  const series = useSeries();
  const [company, setCompany] = useState<Company | null>(null);
  const [years, setYears] = useState<string[]>([]);
  const [data, setData] = useState<Data | null>(null);

  useFocusEffect(useCallback(() => {
    const store = getStore();
    const active = store.activeCompany();
    setCompany(active);
    if (!active) return;
    const today = todayGr();
    const currentYear = today.slice(6);
    setYears([...new Set([currentYear, ...store.years(active.id)])].sort().reverse());
    setData(dashboard({
      income: store.yearDocuments(active.id, 'income', year, true),
      expense: store.yearDocuments(active.id, 'expense', year, true),
      previousExpense: store.yearDocuments(active.id, 'expense', String(Number(year) - 1), true),
      year, currentYear, lastMonth: year === currentYear ? Number(today.slice(3, 5)) : 12, withUnclassified,
      vatPeriod: active.vat_period,
    }));
  }, [year, withUnclassified]));

  if (!company || !data) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.text, marginBottom: 12 }}>Πρόσθεσε πρώτα μια εταιρεία.</Text>
        <Button title="Εταιρείες" onPress={() => router.navigate('/settings')} />
      </View>
    );
  }

  const { kpi, rows, vat, pl, stock, progress, assets } = data;
  const hasAssets = rows.some((r) => r.expense.assets > 0);
  const hasCogs = !!(pl.opening_total || pl.purchases_total || pl.closing_total);
  const monthSlots: Slot[] = rows.map((r) => {
    const assetsPart = Math.max(r.expense.assets, 0);
    return {
      label: r.label.split(' ')[0],
      a11y: `${r.label}: έσοδα ${elAmount(r.income.net)} ευρώ, έξοδα ${elAmount(r.expense.net)} ευρώ`,
      bars: [
        [{ value: r.income.net, color: series.income }],
        [{ value: Math.max(r.expense.net - assetsPart, 0), color: series.expense }, { value: assetsPart, color: series.assets }],
      ],
      detail: (
        <>
          <Text style={{ color: c.text, fontWeight: '600' }}>{r.label}</Text>
          <Row label="Έσοδα" value={`${elAmount(r.income.net)} €`} />
          <Row label="Έξοδα" value={`${elAmount(r.expense.net)} €`} />
          {assetsPart > 0 && <Row label="εκ των οποίων πάγια" value={`${elAmount(assetsPart)} €`} />}
          <Row label="Διαφορά" value={`${elAmount(r.balance)} €`} strong color={r.balance < 0 ? c.bad : c.text} />
        </>
      ),
    };
  });
  const assetSlots: Slot[] = assets.labels.map((label, i) => ({
    label,
    a11y: `${label}: αγορές ${elAmount(assets.bought[i] ?? 0)} ευρώ, πέρσι ${elAmount(assets.previouslyBought[i])} ευρώ`,
    bars: [[{ value: assets.previouslyBought[i], color: series.income }], [{ value: assets.bought[i] ?? 0, color: series.assets }]],
    detail: (
      <>
        <Text style={{ color: c.text, fontWeight: '600' }}>{label}</Text>
        <Row label={`Αγορές ${year}`} value={`${elAmount(assets.bought[i] ?? 0)} €`} />
        <Row label={`Αγορές ${Number(year) - 1}`} value={`${elAmount(assets.previouslyBought[i])} €`} />
      </>
    ),
  }));
  const expensePct = progress.expenseTotal ? Math.round((progress.expenseDone / progress.expenseTotal) * 100) : 0;
  const incomePct = progress.incomeTotal ? Math.round((progress.incomeDone / progress.incomeTotal) * 100) : 0;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.screen}>
      <Chips value={year} onChange={setYear} options={years.map((y): [string, string] => [y, y])} />
      <View style={styles.toggle}>
        <Text style={{ color: c.text, flexShrink: 1 }}>Με αχαρακτήριστα (όπως το myDATA)</Text>
        <Switch value={withUnclassified} onValueChange={setWithUnclassified} accessibilityLabel="Με αχαρακτήριστα" />
      </View>

      <View style={styles.tiles}>
        <Tile label={`Έσοδα ${year}`} value={kpi.income} onPress={() => router.navigate('/income')} />
        <Tile label={`Έξοδα ${year}`} value={kpi.expense} onPress={() => router.navigate('/expense')} />
        <Tile label="Αποτέλεσμα" value={kpi.result} onPress={onYearly} />
        <Tile label="ΦΠΑ εκροών − εισροών" value={kpi.vat} />
      </View>

      <Card>
        <Title style={styles.title}>Έσοδα / έξοδα ανά μήνα</Title>
        <Legend items={[['Έσοδα', series.income], ['Έξοδα', series.expense], ...(hasAssets ? [['Πάγια', series.assets] as [string, string]] : [])]} />
        <ColumnChart slots={monthSlots} />
      </Card>

      <VatCard tiles={vat} period={company.vat_period} />

      <Card>
        <Title style={styles.title}>Καθαρό κέρδος {year}</Title>
        <Row label="Έσοδα" value={elAmount(pl.inc_total)} />
        {hasCogs && (
          <>
            <Row label="Αποθέματα έναρξης" value={elAmount(pl.opening_total)} />
            <Row label="+ Αγορές αποθεμάτων" value={elAmount(pl.purchases_total)} />
            <Row label="− Αποθέματα λήξης" value={elAmount(pl.closing_total)} />
            <Row label="= Κόστος πωληθέντων" value={elAmount(pl.cogs)} />
          </>
        )}
        <Row label="Έξοδα χρήσης" value={elAmount(pl.exp_total)} />
        <Row label={`Καθαρό κέρδος${stock.unsure ? ' ?' : ''}`} value={elAmount(pl.profit)} strong color={pl.profit < 0 ? c.bad : c.good} />
        {!!pl.assets_total && <Row label="Αγορές παγίων" value={elAmount(pl.assets_total)} />}
        {pl.inc_total > 0 && <Row label="Περιθώριο κέρδους" value={`${Math.round((pl.profit / pl.inc_total) * 100)}%`} />}
        <Text style={[styles.note, { color: c.muted }]}>Από τα ποσά Ε3 των χαρακτηρισμένων παραστατικών.</Text>
        {stock.unsure && <Text style={[styles.note, { color: c.warn }]}>⚠ Επισφαλές: {stock.why}.</Text>}
      </Card>

      <Card>
        <Title style={styles.title}>Πρόοδος χαρακτηρισμών {year}</Title>
        <Row label="Έξοδα" value={`${progress.expenseDone} από ${progress.expenseTotal} (${expensePct}%)`} />
        <Meter value={progress.expenseDone} max={progress.expenseTotal} color={series.expense} />
        <Row label="Έσοδα" value={`${progress.incomeDone} από ${progress.incomeTotal} (${incomePct}%)`} />
        <Meter value={progress.incomeDone} max={progress.incomeTotal} color={series.income} />
      </Card>

      {(assets.total > 0 || assets.previousTotal > 0 || assets.booked > 0) && (
        <Card>
          <Title style={styles.title}>Πάγια {year}</Title>
          <Legend items={[[String(Number(year) - 1), series.income], [year, series.assets]]} />
          <ColumnChart slots={assetSlots} />
          <Row label={`Αγορές ${year} / ${Number(year) - 1}`} value={`${elAmount(assets.total)} / ${elAmount(assets.previousTotal)}`} />
          <Row label={`Αποσβέσεις ${year} / ${Number(year) - 1}`} value={`${elAmount(assets.booked)} / ${elAmount(assets.previousBooked)}`} />
        </Card>
      )}

      <Top title={`Κορυφαίοι πελάτες ${year}`} list={data.topCustomers} color={series.income} empty="Δεν υπάρχουν έσοδα από πελάτες." />
      <Top title={`Κορυφαίοι προμηθευτές ${year}`} list={data.topSuppliers} color={series.expense} empty="Δεν υπάρχουν έξοδα." />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 68 },
  tileValue: { fontSize: 19, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  title: { fontWeight: '700', marginBottom: 6 },
  note: { fontSize: 12, marginTop: 6 },
  top: { marginBottom: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
});
