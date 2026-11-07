// Αντίστροφη μέτρηση ως την επόμενη αυτόματη λήψη της ενεργής εταιρείας, και το αποτέλεσμα της τελευταίας.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { autoStatus, formatCountdown, nextAutoAt } from '../book/auto.ts';
import { getStore } from '../db.ts';
import { MONO, useColors } from './theme.tsx';

const stamp = (ms: number) => new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(ms));

type Info = { next: number | null; last: ReturnType<typeof autoStatus> };

export function AutoCountdown({ companyId, hours, restarted }: { companyId: number; hours: number; restarted: number }) {
  const c = useColors();
  const [now, setNow] = useState(() => Date.now());
  const [info, setInfo] = useState<Info>({ next: null, last: null });

  // Μόνο όσο φαίνεται η οθόνη. Η βάση διαβάζεται μία φορά, και ξανά μόνο όταν περάσει η ώρα της λήψης.
  useFocusEffect(useCallback(() => {
    const read = () => {
      const store = getStore();
      const next = hours ? nextAutoAt(store, companyId, hours) : null;
      setInfo({ next, last: autoStatus(store, companyId) });
      return next;
    };
    let due = read();
    setNow(Date.now());
    if (!hours) return undefined;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (due !== null && time >= due) due = read();
    }, 1000);
    return () => clearInterval(timer);
  }, [companyId, hours, restarted])); // restarted: χειροκίνητη λήψη, η βάση άλλαξε

  const remaining = info.next === null ? 0 : info.next - now;

  return (
    <>
      {hours > 0 && (
        <View style={styles.row}>
          <Text style={{ color: c.text }}>Επόμενη λήψη</Text>
          {info.next === null
            ? <Text style={{ color: c.muted, flexShrink: 1 }}>μετά την αρχική λήψη</Text>
            : remaining > 0
              ? <Text accessibilityLabel={`Επόμενη λήψη σε ${formatCountdown(remaining)}`} style={[styles.time, { color: c.accent }]}>{formatCountdown(remaining)}</Text>
              : <Text style={{ color: c.accent, fontWeight: '700' }}>γίνεται τώρα…</Text>}
        </View>
      )}
      {info.last && <Text style={[styles.note, { color: c.muted }]}>Τελευταία: {stamp(info.last.at)}. {info.last.result}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, minHeight: 28 },
  time: { fontFamily: MONO, fontSize: 20, fontWeight: '700' },
  note: { marginTop: 8, fontSize: 13 },
});
