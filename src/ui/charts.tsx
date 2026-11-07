// Γραφήματα σε SVG. Οι τιμές εμφανίζονται και ως κείμενο με πάτημα σε μήνα, ώστε η ταυτότητα να μη βασίζεται μόνο στο χρώμα.
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { axis } from '../book/dashboard.ts';
import { elAmount } from '../book/yearly.ts';
import { useColors, useTheme } from './theme.tsx';

const HEIGHT = 190;
const LEFT = 42;
const RIGHT = 4;
const TOP = 8;
const BOTTOM = 22;
const MAX_BAR = 14;
const RADIUS = 3;
const GAP = 2; // κενό ανάμεσα σε γειτονικά και στοιβαγμένα τμήματα

// Έσοδα πράσινα και έξοδα πορτοκαλί, όπως στο myDATA. Ελεγμένα πάνω στην κάρτα κάθε θέματος.
// Τα text είναι για νούμερα: τα χρώματα των μπαρών δεν διαβάζονται ως κείμενο, οπότε έχουν αντίθεση ≥ 4,5:1 σε κάθε θέμα.
export function useSeries() {
  const { theme } = useTheme();
  const marks = theme.dark
    ? { income: '#199e70', expense: '#d95926', assets: '#3987e5' }
    : { income: '#1baf7a', expense: '#eb6834', assets: '#2a78d6' };
  const lightOrange = theme.key === 'nord' ? '#fdba74' : '#fb923c';
  return {
    ...marks,
    text: {
      income: theme.key === 'light' ? '#0b7d56' : theme.colors.good,
      expense: theme.dark ? lightOrange : '#c2410c',
    },
  };
}

const compact = (v: number) =>
  (v >= 10000 ? `${String(v / 1000).replace('.', ',')}K` : elAmount(v).slice(0, -3));

function barPath(x: number, w: number, top: number, bottom: number, rounded: boolean): string {
  const r = Math.min(RADIUS, w / 2);
  if (!rounded || bottom - top < r) return `M${x},${top}h${w}V${bottom}H${x}Z`;
  return `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`;
}

export type Part = { value: number; color: string };
export type Slot = { label: string; a11y: string; bars: Part[][]; detail: ReactNode };

/** Ομαδοποιημένες στήλες: κάθε slot έχει μπάρες, κάθε μπάρα τμήματα από κάτω προς τα πάνω. */
export function ColumnChart({ slots }: { slots: Slot[] }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const totals = slots.flatMap((s) => s.bars.map((b) => b.reduce((t, p) => t + Math.max(p.value, 0), 0)));
  const { ymax, ticks } = axis(Math.max(0, ...totals));
  const base = HEIGHT - BOTTOM;
  const plot = base - TOP;
  const y = (v: number) => base - (v / ymax) * plot;
  const slotW = (width - LEFT - RIGHT) / Math.max(slots.length, 1);

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
        {width > 0 && (
          <>
            <Svg width={width} height={HEIGHT}>
              {selected !== null && <Rect x={LEFT + slotW * selected} y={TOP} width={slotW} height={plot} fill={c.line} opacity={0.5} rx={4} />}
              {ticks.map((t) => (
                <Line key={t} x1={LEFT} x2={width - RIGHT} y1={y(t)} y2={y(t)} stroke={c.line} strokeWidth={1} />
              ))}
              {ticks.map((t) => (
                <SvgText key={t} x={LEFT - 6} y={y(t) + 3} fill={c.muted} fontSize={10} textAnchor="end">{compact(t)}</SvgText>
              ))}
              {slots.map((s, i) => {
                const barW = Math.min(MAX_BAR, (slotW * 0.76 - GAP * (s.bars.length - 1)) / s.bars.length);
                const span = barW * s.bars.length + GAP * (s.bars.length - 1);
                const start = LEFT + slotW * (i + 0.5) - span / 2;
                return s.bars.flatMap((bar, b) => {
                  const x = start + b * (barW + GAP);
                  let level = 0;
                  const parts = bar.filter((p) => y(0) - y(Math.max(p.value, 0)) >= 0.5);
                  return parts.map((p, n) => {
                    const bottom = y(level) - (level ? GAP : 0);
                    level += Math.max(p.value, 0);
                    const top = Math.min(y(level), bottom - 0.5);
                    return <Path key={`${i}-${b}-${n}`} d={barPath(x, barW, top, bottom, n === parts.length - 1)} fill={p.color} />;
                  });
                });
              })}
              {slots.map((s, i) => (
                <SvgText key={s.label} x={LEFT + slotW * (i + 0.5)} y={base + 15} fill={selected === i ? c.text : c.muted} fontSize={9} textAnchor="middle">
                  {s.label.replace('.', '')}
                </SvgText>
              ))}
            </Svg>
            {slots.map((s, i) => (
              <Pressable key={s.label} accessibilityRole="button" accessibilityLabel={s.a11y} onPress={() => setSelected(selected === i ? null : i)}
                style={[styles.hit, { left: LEFT + slotW * i, width: slotW }]} />
            ))}
          </>
        )}
      </View>
      {selected !== null && slots[selected]
        ? <View style={[styles.detail, { borderTopColor: c.line }]}>{slots[selected].detail}</View>
        : <Text style={[styles.hint, { color: c.muted }]}>Πάτησε έναν μήνα για τα ποσά.</Text>}
    </View>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  const c = useColors();
  return (
    <View style={styles.legend}>
      {items.map(([label, color]) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: color }]} />
          <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Οριζόντια μπάρα: μέρος επί του όλου, ή ταξινόμηση με κοινή κλίμακα. */
export function Meter({ value, max, color }: { value: number; max: number; color: string }) {
  const c = useColors();
  const pct = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  return (
    <View style={[styles.meter, { backgroundColor: c.line }]}>
      <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { position: 'absolute', top: TOP, height: HEIGHT - TOP },
  detail: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 6 },
  hint: { fontSize: 12, marginTop: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  meter: { height: 8, borderRadius: 4, overflow: 'hidden', marginVertical: 4 },
  meterFill: { height: '100%', borderRadius: 4 },
});
