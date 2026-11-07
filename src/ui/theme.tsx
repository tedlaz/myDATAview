import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStore } from '../db.ts';
import { THEMES, type Colors, type Theme } from './themes.ts';

export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' }); // αριθμοί, όπως το IBM Plex Mono του desktop
export const AUTO = 'auto'; // ακολουθεί το φωτεινό/σκοτεινό του κινητού
const SETTING = 'theme';
const byKey = (key: string) => THEMES.find((t) => t.key === key);

type ThemeState = { theme: Theme; choice: string; choose: (key: string) => void };
const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [choice, setChoice] = useState(() => getStore().setting(SETTING) ?? AUTO);
  const value = useMemo(() => ({
    theme: byKey(choice) ?? byKey(scheme === 'dark' ? 'dark' : 'light')!,
    choice,
    choose: (key: string) => {
      getStore().setSetting(SETTING, key);
      setChoice(key);
    },
  }), [choice, scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (!state) throw new Error('Λείπει το ThemeProvider.');
  return state;
}

export const useColors = (): Colors => useTheme().theme.colors;

/** Κενό στο τέλος οθόνης χωρίς κάτω καρτέλες: το περιεχόμενο να μην κρύβεται κάτω από τα κουμπιά του κινητού. */
export function useBottomSpace() {
  return { paddingBottom: useSafeAreaInsets().bottom + 12 };
}

export function Card({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>{children}</View>;
}

export function Button({ title, onPress, disabled, kind = 'primary' }: {
  title: string; onPress: () => void; disabled?: boolean; kind?: 'primary' | 'danger' | 'ghost';
}) {
  const c = useColors();
  const solid = kind === 'primary';
  const color = kind === 'danger' ? c.bad : c.accent;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={[styles.button, { backgroundColor: solid ? color : 'transparent', borderColor: color, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={{ color: solid ? c.onAccent : color, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function Chips<T extends string>({ value, options, onChange }: {
  value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipBar}>
      {options.map(([key, label]) => {
        const on = key === value;
        return (
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(key)}
            style={[styles.chip, { backgroundColor: on ? c.accent : c.card, borderColor: on ? c.accent : c.line }]}>
            <Text style={{ color: on ? c.onAccent : c.text }}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Εσωτερικά tabs μιας οθόνης. */
export function Segments<T extends string>({ value, options, onChange }: {
  value: T; options: [T, string][]; onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View accessibilityRole="tablist" style={[styles.segments, { backgroundColor: c.accentSoft }]}>
      {options.map(([key, label]) => {
        const on = key === value;
        return (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(key)}
            style={[styles.segment, on && { backgroundColor: c.card, borderColor: c.accentGlow }]}>
            <Text numberOfLines={1} style={{ color: on ? c.accentDeep : c.muted, fontWeight: on ? '700' : '500', fontSize: 14 }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ label, value, strong, color }: { label: string; value: string; strong?: boolean; color?: string }) {
  const c = useColors();
  return (
    <View style={styles.row}>
      <Text style={{ color: c.muted, flexShrink: 1 }}>{label}</Text>
      <Text style={{ color: color ?? c.text, fontWeight: strong ? '700' : '400', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  button: { borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  chipBar: { flexGrow: 0 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: { borderWidth: 1, borderRadius: 18, minHeight: 36, paddingHorizontal: 14, justifyContent: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
  segments: { flexDirection: 'row', borderRadius: 14, padding: 3, marginBottom: 10 },
  segment: { flexGrow: 1, minHeight: 40, borderRadius: 11, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
