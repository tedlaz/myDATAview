// Πεδίο ημερομηνίας με ελληνικό ημερολόγιο. Ακολουθεί το θέμα της εφαρμογής.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { todayGr } from '../aade/client.ts';
import { MONTHS, WEEKDAYS, formatGr, monthGrid, parseGr, shiftMonth } from '../book/calendar.ts';
import { MONO, useColors } from './theme.tsx';

const YEARS_BACK = 11;
const YEARS_AHEAD = 1;

function CalendarIcon({ color }: { color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Rect x={3} y={4} width={18} height={18} rx={2} {...stroke} />
      <Path d="M16 2v4M8 2v4M3 10h18" {...stroke} />
    </Svg>
  );
}

export function DateField({ label, value, onChange, disabled }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const c = useColors();
  const today = parseGr(todayGr())!;
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState(false);
  const [shown, setShown] = useState(today);
  const selected = parseGr(value);

  const show = () => {
    setShown(selected ?? today);
    setYears(false);
    setOpen(true);
  };
  const pick = (d: number, y = shown.y, m = shown.m) => {
    onChange(formatGr({ y, m, d }));
    setOpen(false);
  };
  const go = (by: number) => setShown({ ...shown, ...shiftMonth(shown.y, shown.m, by) });
  const same = (d: number, x: { y: number; m: number; d: number } | null) => !!x && x.d === d && x.m === shown.m && x.y === shown.y;

  return (
    <>
      <Text style={[styles.label, { color: c.text }]}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}. Επιλογή ημερομηνίας`} disabled={disabled} onPress={show}
        style={[styles.field, { backgroundColor: c.card, borderColor: c.line, opacity: disabled ? 0.5 : 1 }]}>
        <Text style={[styles.value, { color: c.text }]}>{value}</Text>
        <CalendarIcon color={c.accent} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Κλείσιμο" style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.card, borderColor: c.line }]}>
            <View style={styles.head}>
              <Pressable accessibilityRole="button" accessibilityLabel="Προηγούμενος μήνας" onPress={() => go(-1)} style={styles.nav}>
                <Text style={[styles.arrow, { color: c.accent }]}>‹</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Επιλογή έτους" onPress={() => setYears(!years)} style={styles.title}>
                <Text style={[styles.titleText, { color: c.text }]}>{MONTHS[shown.m - 1]} {shown.y} {years ? '▴' : '▾'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Επόμενος μήνας" onPress={() => go(1)} style={styles.nav}>
                <Text style={[styles.arrow, { color: c.accent }]}>›</Text>
              </Pressable>
            </View>

            {years ? (
              <View style={styles.years}>
                {Array.from({ length: YEARS_BACK + YEARS_AHEAD + 1 }, (_, i) => today.y + YEARS_AHEAD - i).map((y) => {
                  const on = y === shown.y;
                  return (
                    <Pressable key={y} accessibilityRole="button" accessibilityState={{ selected: on }}
                      onPress={() => { setShown({ ...shown, y }); setYears(false); }}
                      style={[styles.year, on && { backgroundColor: c.accent }]}>
                      <Text style={{ color: on ? c.onAccent : c.text, fontFamily: MONO }}>{y}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <>
                <View style={styles.week}>
                  {WEEKDAYS.map((w) => <View key={w} style={styles.day}><Text style={[styles.weekday, { color: c.muted }]}>{w}</Text></View>)}
                </View>
                {monthGrid(shown.y, shown.m).map((week, w) => (
                  <View key={w} style={styles.week}>
                    {week.map((d, i) => {
                      if (d === null) return <View key={i} style={styles.day} />;
                      const on = same(d, selected);
                      const now = same(d, today);
                      return (
                        <Pressable key={i} accessibilityRole="button" accessibilityState={{ selected: on }}
                          accessibilityLabel={`${d} ${MONTHS[shown.m - 1]} ${shown.y}`} onPress={() => pick(d)} style={styles.day}>
                          <View style={[styles.dayInner, on && { backgroundColor: c.accent }, now && !on && { borderColor: c.accent, borderWidth: 1 }]}>
                            <Text style={{ color: on ? c.onAccent : c.text, fontWeight: on || now ? '700' : '400' }}>{d}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </>
            )}

            <View style={styles.foot}>
              <Pressable accessibilityRole="button" onPress={() => pick(today.d, today.y, today.m)} style={styles.link}>
                <Text style={{ color: c.accent, fontWeight: '600' }}>Σήμερα</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.link}>
                <Text style={{ color: c.muted, fontWeight: '600' }}>Άκυρο</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 8, marginBottom: 4 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 12 },
  value: { fontFamily: MONO, fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 360, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 28, lineHeight: 30, fontWeight: '600' },
  title: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  titleText: { fontWeight: '700', fontSize: 16 },
  week: { flexDirection: 'row' },
  day: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  dayInner: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 12, fontWeight: '700' },
  years: { flexDirection: 'row', flexWrap: 'wrap' },
  year: { width: '25%', height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  link: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center' },
});
