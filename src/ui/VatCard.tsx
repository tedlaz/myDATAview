// ΦΠΑ ανά μήνα ή τρίμηνο, κατά την περίοδο ΦΠΑ της εταιρείας.
import { StyleSheet, Text, View } from 'react-native';
import type { VatTile } from '../book/dashboard.ts';
import { elAmount } from '../book/yearly.ts';
import type { VatPeriod } from '../store.ts';
import { Legend, Meter, useSeries } from './charts.tsx';
import { Card, useColors, Title } from './theme.tsx';

export function VatCard({ tiles, period }: { tiles: VatTile[]; period: VatPeriod }) {
  const c = useColors();
  const series = useSeries();
  const max = Math.max(1, ...tiles.flatMap((t) => [t.output, t.input]));
  return (
    <Card>
      <Title style={styles.title}>ΦΠΑ ανά {period === 'q' ? 'τρίμηνο' : 'μήνα'}</Title>
      <Legend items={[['Εκροών', series.income], ['Εισροών', series.expense]]} />
      <View style={styles.grid}>
        {tiles.map((t) => (
          <View key={t.label} style={[styles.tile, { flexBasis: period === 'q' ? '48%' : '31%' }]}
            accessibilityLabel={`ΦΠΑ ${t.label}: εκροών ${elAmount(t.output)}, εισροών ${elAmount(t.input)}, διαφορά ${elAmount(t.diff)} ευρώ`}>
            <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>{t.label}{t.partial ? ' *' : ''}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, { color: t.diff < 0 ? c.bad : c.text }]}>{elAmount(t.diff)}</Text>
            <Meter value={t.output} max={max} color={series.income} />
            <Meter value={t.input} max={max} color={series.expense} />
          </View>
        ))}
      </View>
      {tiles.some((t) => t.partial) && <Text style={[styles.note, { color: c.muted }]}>* σε εξέλιξη</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: '700', marginBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1 },
  value: { fontWeight: '700', fontVariant: ['tabular-nums'], marginVertical: 2 },
  note: { fontSize: 12, marginTop: 6 },
});
