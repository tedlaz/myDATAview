// Ο πίνακας του συνοπτικού βιβλίου με ΟΛΕΣ τις στήλες, όπως στο myDATA. Σε μία σταθερή στήλη αριστερά, μία γραμμή για τον
// μήνα και από κάτω Έσοδα και Έξοδα, ώστε στην οριζόντια κύλιση να φαίνεται πάντα σε τι ανήκει κάθε ποσό.
//
// Κεφαλίδα και σώμα είναι χωριστά: η κεφαλίδα πρέπει να είναι άμεσο παιδί του ScrollView της οθόνης για να μένει σταθερή
// στην κάθετη κύλιση, και ακολουθεί την οριζόντια κύλιση του σώματος μέσω του scrollX.
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { TABLE_COLUMNS, elAmount, round2, type Column, type TableRow, type Totals } from '../book/yearly.ts';
import { useSeries } from './charts.tsx';
import { useColors } from './theme.tsx';

const ROW = 30;
const TITLE = 28;
const HEAD = 44;
const LABEL_W = 106;
const AMOUNT_W = 96;

const COLUMNS: Column[] = ['net', ...TABLE_COLUMNS.map(([col]) => col)];
const HEADERS = ['Καθαρή αξία', 'Υπόλοιπο Εσ. − Εξ.', ...TABLE_COLUMNS.map(([, label]) => label)];
const WIDTH = AMOUNT_W * HEADERS.length;

function Amount({ value, color, strong }: { value?: number; color?: string; strong?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.cell, { width: AMOUNT_W, height: ROW }]}>
      {value !== undefined && (
        <Text style={[styles.num, { color: !value ? c.muted : color ?? (value < 0 ? c.bad : c.text), fontWeight: strong ? '700' : '400' }]}>
          {value ? elAmount(value) : '–'}
        </Text>
      )}
    </View>
  );
}

/** Τα ποσά μιας γραμμής: καθαρή αξία, το κενό του υπολοίπου και οι υπόλοιπες στήλες. */
function Amounts({ values, color, strong, line }: { values: Record<Column, number>; color?: string; strong?: boolean; line?: object }) {
  return (
    <View style={[styles.row, line]}>
      {COLUMNS.map((k, i) => (
        <View key={k} style={styles.row}>
          <Amount value={values[k]} color={color} strong={strong} />
          {i === 0 && <Amount />}
        </View>
      ))}
    </View>
  );
}

/** Η σταθερή κεφαλίδα: «Περίοδος» και, μετακινούμενοι μαζί με το σώμα, οι τίτλοι των στηλών. */
export function YearTableHead({ scrollX }: { scrollX: Animated.Value }) {
  const c = useColors();
  return (
    <View style={[styles.headRow, { borderColor: c.line, backgroundColor: c.card }]}>
      <View style={[styles.headLabel, { borderRightColor: c.line }]}>
        <Text style={[styles.headText, { color: c.muted }]}>Περίοδος</Text>
      </View>
      <View style={styles.clip}>
        <Animated.View style={[styles.row, { width: WIDTH, transform: [{ translateX: Animated.multiply(scrollX, -1) }] }]}>
          {HEADERS.map((label) => (
            <View key={label} style={[styles.cell, { width: AMOUNT_W, height: HEAD }]}>
              <Text style={[styles.headText, { color: c.muted, textAlign: 'right' }]}>{label}</Text>
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}

export function YearTableBody({ rows, income, expense, onOpen, scrollX }: {
  rows: TableRow[]; income: Totals; expense: Totals; onOpen: (kind: 'income' | 'expense', month: string) => void; scrollX: Animated.Value;
}) {
  const c = useColors();
  const { text } = useSeries();
  const balance = round2(income.net - expense.net);
  const line = { borderBottomColor: c.line, borderBottomWidth: StyleSheet.hairlineWidth };
  const moved = (r: TableRow) => Object.values(r.income).some(Boolean) || Object.values(r.expense).some(Boolean);
  const difference = Object.fromEntries(COLUMNS.map((k) => [k, round2(income[k] - expense[k])])) as Record<Column, number>;

  /** Η γραμμή τίτλου: ο μήνας αριστερά, το υπόλοιπο στη στήλη του. */
  const titleLeft = (label: string) => (
    <View style={[styles.title, { backgroundColor: c.bg }]}>
      <Text numberOfLines={1} style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </View>
  );
  const titleRight = (value: number | undefined, note?: string) => (
    <View style={[styles.title, styles.row, styles.titleRight, { width: WIDTH, backgroundColor: c.bg }]}>
      {note
        ? <Text style={{ color: c.muted, fontSize: 13, paddingHorizontal: 6 }}>{note}</Text>
        : (
          <>
            <View style={{ width: AMOUNT_W }} />
            <View style={[styles.cell, { width: AMOUNT_W, height: TITLE }]}>
              <Text style={[styles.num, { color: value! < 0 ? c.bad : c.text, fontWeight: '700' }]}>{value ? elAmount(value) : '–'}</Text>
            </View>
          </>
        )}
    </View>
  );
  const kind = (r: TableRow, key: 'income' | 'expense', label: string, withLine: boolean) => (
    <Pressable key={key} disabled={!r.month} accessibilityRole={r.month ? 'button' : 'text'} accessibilityLabel={`${label} ${r.label}`}
      onPress={() => r.month && onOpen(key, r.month)} style={[styles.kind, withLine && line]}>
      <Text style={{ color: text[key], fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
  const fixed = (label: string, color: string) => (
    <View key={label} style={styles.kind}><Text style={{ color, fontSize: 13, fontWeight: '700' }}>{label}</Text></View>
  );

  return (
    <View style={[styles.body, { borderColor: c.line, backgroundColor: c.card }]}>
      <View style={{ width: LABEL_W, borderRightColor: c.line, borderRightWidth: StyleSheet.hairlineWidth }}>
        {rows.map((r) => (
          <View key={r.key}>
            {titleLeft(r.label)}
            {moved(r) && <>{kind(r, 'income', 'Έσοδα', false)}{kind(r, 'expense', 'Έξοδα', true)}</>}
          </View>
        ))}
        {titleLeft('Σύνολα')}
        {fixed('Έσοδα', text.income)}
        {fixed('Έξοδα', text.expense)}
        {fixed('Διαφορά', c.text)}
      </View>
      <Animated.ScrollView horizontal showsHorizontalScrollIndicator bounces={false} overScrollMode="never" scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        accessibilityLabel="Πίνακας συνοπτικού βιβλίου">
        <View>
          {rows.map((r) => (moved(r) ? (
            <View key={r.key}>
              {titleRight(r.balance)}
              <Amounts values={r.income} color={text.income} />
              <Amounts values={r.expense} color={text.expense} line={line} />
            </View>
          ) : <View key={r.key}>{titleRight(undefined, 'χωρίς κίνηση')}</View>))}
          {titleRight(balance)}
          <Amounts values={income} color={text.income} strong />
          <Amounts values={expense} color={text.expense} strong />
          <Amounts values={difference} strong />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row', height: HEAD, borderWidth: 1, borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden',
  },
  headLabel: { width: LABEL_W, justifyContent: 'center', paddingHorizontal: 8, borderRightWidth: StyleSheet.hairlineWidth },
  headText: { fontSize: 12, fontWeight: '600' },
  clip: { flex: 1, overflow: 'hidden' },
  body: {
    flexDirection: 'row', borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    overflow: 'hidden', marginBottom: 10,
  },
  title: { height: TITLE, justifyContent: 'center', paddingHorizontal: 8 },
  titleRight: { alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: 0 },
  kind: { height: ROW, justifyContent: 'center', paddingHorizontal: 8 },
  row: { flexDirection: 'row' },
  cell: { justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 6 },
  num: { fontSize: 13, fontVariant: ['tabular-nums'] },
});
