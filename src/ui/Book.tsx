// Λίστα βιβλίου: κοινή για έσοδα και έξοδα. Μόνο προβολή.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CREDIT_INVOICE_TYPES } from '../codes.ts';
import { elDate, monthLabel, plainAmount } from '../book/yearly.ts';
import { getStore } from '../db.ts';
import type { Company, Doc, Kind, Status } from '../store.ts';
import type { Colors } from './themes.ts';
import { shortName } from '../names.ts';
import { Button, Chips, MONO, useColors } from './theme.tsx';

const PAGE = 50;

/** Ίδια χρώματα με τις καταστάσεις του myDATA: αχαρακτήριστα κίτρινα, χαρακτηρισμένα έσοδα μπλε, ολοκληρωμένα έξοδα πράσινα. */
function stripeColor(doc: Doc, c: Colors): string {
  if (doc.status === 'unclassified') return c.warn;
  return doc.kind === 'expense' ? c.good : c.accent;
}

function Amount({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  const c = useColors();
  return (
    <View style={styles.amount}>
      <Text numberOfLines={1} style={[styles.amountLabel, { color: c.muted }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.amountValue, { color: c.text, fontWeight: strong ? '700' : '400' }]}>{plainAmount(value)} €</Text>
    </View>
  );
}

/** Η κάρτα παραστατικού του myDATA στο κινητό: ΜΑΡΚ · ημ/νία · τύπος · σειρά / επωνυμία / καθαρή · ΦΠΑ · σύνολο. */
export function DocCard({ doc, showKind }: { doc: Doc; showKind?: boolean }) {
  const c = useColors();
  const credit = CREDIT_INVOICE_TYPES.has(doc.invoice_type ?? '');
  const lines = (JSON.parse(doc.lines_json) as unknown[]).length;
  const badge = credit
    ? { backgroundColor: c.errSoft, borderColor: c.errLine, color: c.bad }
    : { backgroundColor: c.accentSoft, borderColor: c.accentGlow, color: c.accentDeep };
  const name = shortName(doc.name) || (doc.kind === 'income' && !doc.vat ? 'Λιανική πώληση' : '—');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ΜΑΡΚ ${doc.mark}`}
      onPress={() => router.push({ pathname: '/doc/[mark]', params: { mark: doc.mark } })}
      style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
      <View style={[styles.stripe, { backgroundColor: stripeColor(doc, c) }]} />
      {credit && <View style={[styles.creditStripe, { backgroundColor: c.bad }]} />}
      <View style={[styles.cardBody, credit && { backgroundColor: `${c.errSoft}8C` }]}>
        <View style={styles.head}>
          <Text style={[styles.mark, { color: c.accent }]}>{doc.mark.length > 5 ? `…${doc.mark.slice(-5)}` : doc.mark}</Text>
          <Text style={[styles.mono, { color: c.text }]}>{elDate(doc.issue_date) || '—'}</Text>
          <View style={[styles.badge, { backgroundColor: badge.backgroundColor, borderColor: badge.borderColor }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{doc.invoice_type ?? '—'}</Text>
            {lines > 0 && (
              <View style={[styles.badgeCount, { backgroundColor: `${badge.color}29` }]}>
                <Text style={[styles.badgeCountText, { color: badge.color }]}>{lines}</Text>
              </View>
            )}
          </View>
          <Text numberOfLines={1} style={[styles.mono, styles.series, { color: c.text }]}>{doc.series ?? ''}/{doc.aa ?? ''}</Text>
        </View>
        {showKind
          ? <Text style={[styles.name, { color: c.text }]}>{doc.kind === 'income' ? '🛒 Έσοδο' : '🚚 Έξοδο'}</Text>
          : (
            <>
              <Text style={[styles.name, { color: c.text }]}>{name}</Text>
              {!!doc.vat && <Text style={[styles.vat, { color: c.muted }]}>{doc.vat}</Text>}
            </>
          )}
        <View style={styles.amounts}>
          <Amount label="ΚΑΘΑΡΗ ΑΞΙΑ" value={doc.total_net} />
          <Amount label="ΦΠΑ" value={doc.total_vat} />
          <Amount label="ΣΥΝΟΛΟ" value={doc.total_gross} strong />
        </View>
      </View>
    </Pressable>
  );
}

export function Book({ kind }: { kind: Kind }) {
  const c = useColors();
  const params = useLocalSearchParams<{ month?: string; t?: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState(params.month ?? '');
  const [status, setStatus] = useState<Status | ''>('');
  const [search, setSearch] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);

  // Από το συνοπτικό βιβλίο: το t αλλάζει σε κάθε πάτημα, ώστε να ισχύει και για τον ίδιο μήνα ξανά.
  const request = `${params.month}|${params.t}`;
  const [applied, setApplied] = useState(request);
  if (request !== applied) {
    setApplied(request);
    if (params.month) setMonth(params.month);
  }

  const load = useCallback(() => {
    const store = getStore();
    const active = store.activeCompany();
    setCompany(active);
    if (!active) return;
    setMonths(store.months(active.id, kind));
    setDocs(store.documents(active.id, kind, { month, status: status || undefined, search }, PAGE, 0));
  }, [kind, month, status, search]);
  useFocusEffect(load);

  const more = () => {
    if (!company || docs.length % PAGE) return;
    const next = getStore().documents(company.id, kind, { month, status: status || undefined, search }, PAGE, docs.length);
    if (next.length) setDocs([...docs, ...next]);
  };

  if (!company) {
    return (
      <View style={[styles.empty, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.text, marginBottom: 12 }}>Πρόσθεσε πρώτα μια εταιρεία.</Text>
        <Button title="Εταιρείες" onPress={() => router.navigate('/settings')} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <TextInput value={search} onChangeText={setSearch} placeholder="Αναζήτηση επωνυμίας ή ΑΦΜ" placeholderTextColor={c.muted}
        accessibilityLabel="Αναζήτηση" autoCorrect={false}
        style={[styles.search, { color: c.text, backgroundColor: c.card, borderColor: c.line }]} />
      <Chips value={month} onChange={setMonth}
        options={[['', 'Όλοι οι μήνες'], ...months.map((m): [string, string] => [m, monthLabel(m)])]} />
      <Chips value={status} onChange={setStatus}
        options={[['', 'Όλα'], ['unclassified', 'Αχαρακτήριστα'], ['classified', 'Χαρακτηρισμένα']]} />
      <FlatList data={docs} keyExtractor={(d) => d.mark} onEndReached={more} onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled" style={styles.list}
        ListEmptyComponent={<Text style={[styles.none, { color: c.muted }]}>Δεν υπάρχουν παραστατικά. Κάνε λήψη από την καρτέλα «Λήψη».</Text>}
        renderItem={({ item }) => <DocCard doc={item} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  search: { borderWidth: 1, borderRadius: 10, minHeight: 44, paddingHorizontal: 12, marginBottom: 4 },
  list: { flex: 1, marginTop: 6 },
  none: { textAlign: 'center', padding: 24 },
  card: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  stripe: { width: 4 },
  creditStripe: { width: 3 },
  cardBody: { flex: 1, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  mark: { fontFamily: MONO, fontSize: 13, fontWeight: '700' },
  mono: { fontFamily: MONO, fontSize: 13 },
  series: { flex: 1 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingLeft: 8, paddingRight: 4, paddingVertical: 2, minHeight: 24 },
  badgeText: { fontFamily: MONO, fontSize: 13, fontWeight: '700' },
  badgeCount: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  badgeCountText: { fontFamily: MONO, fontSize: 11, fontWeight: '700' },
  name: { fontWeight: '700', fontSize: 15, lineHeight: 20 },
  vat: { fontFamily: MONO, fontSize: 12.5, marginTop: 1 },
  amounts: { flexDirection: 'row', gap: 12, marginTop: 5 },
  amount: { flex: 1 },
  amountLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginBottom: 1 },
  amountValue: { fontFamily: MONO, fontSize: 13.5 },
});
