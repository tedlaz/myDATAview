// Προβολή παραστατικού, μόνο για ανάγνωση.
import { useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Cls, Line, Tax } from '../../aade/parse.ts';
import { elAmount, elDate } from '../../book/yearly.ts';
import { EXPENSE_CATEGORIES, EXPENSE_TYPES, INCOME_CATEGORIES, INCOME_TYPES, INVOICE_TYPE_NAMES, TAX_TYPES,
  VAT_CATEGORY_LABELS, VAT_TYPES } from '../../codes.ts';
import { getStore } from '../../db.ts';
import { Button, Card, Row, useBottomSpace, useColors, Title } from '../../ui/theme.tsx';

const TYPE_LABELS = { ...EXPENSE_TYPES, ...INCOME_TYPES, ...VAT_TYPES };
const CATEGORY_LABELS = { ...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES };
const MODES: Record<string, string> = { '1': 'Απόρριψη', '2': 'Απόκλιση' };

function ClsRow({ cls }: { cls: Cls }) {
  const c = useColors();
  if (cls.transaction_mode) return <Text style={{ color: c.bad }}>{MODES[cls.transaction_mode] ?? cls.transaction_mode}</Text>;
  const title = (cls.type && TYPE_LABELS[cls.type]) || cls.type || '—';
  const category = cls.category ? CATEGORY_LABELS[cls.category] ?? cls.category : '';
  return (
    <View style={styles.cls}>
      <Text style={{ color: c.text }}>{title}</Text>
      {!!category && <Text style={{ color: c.muted }}>{category}</Text>}
      <Row label={[cls.type, cls.line ? `γραμμή ${cls.line}` : ''].filter(Boolean).join(' · ')} value={`${elAmount(cls.amount)} €`} />
    </View>
  );
}

export default function DocumentScreen() {
  const c = useColors();
  const bottom = useBottomSpace();
  const { mark } = useLocalSearchParams<{ mark: string }>();
  const store = getStore();
  const company = store.activeCompany();
  const doc = company ? store.document(company.id, mark) : null;
  if (!doc) return <Text style={[styles.screen, { color: c.muted }]}>Το παραστατικό δεν βρέθηκε.</Text>;

  const lines = JSON.parse(doc.lines_json) as Line[];
  const taxes = JSON.parse(doc.taxes_json) as Tax[];
  const cls = JSON.parse(doc.cls_json ?? '[]') as Cls[];
  const extras: [string, number | null][] = [['Παρακρατούμενοι', doc.total_withheld], ['Λοιποί φόροι', doc.total_other_taxes],
    ['Ψηφιακό τέλος συν.', doc.total_stamp_duty], ['Τέλη', doc.total_fees], ['Κρατήσεις', doc.total_deductions]];
  const url = doc.url;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.screen, bottom]}>
      <Card>
        <Title style={styles.title}>{doc.name || doc.vat || 'Λιανική'}</Title>
        {!!doc.vat && <Text style={{ color: c.muted }}>ΑΦΜ {doc.vat}</Text>}
        <Text style={{ color: c.muted, marginTop: 6 }}>{INVOICE_TYPE_NAMES[doc.invoice_type ?? ''] ?? doc.invoice_type}</Text>
        <Row label="Ημερομηνία" value={elDate(doc.issue_date)} />
        <Row label="Σειρά / Α.Α." value={[doc.series, doc.aa].filter(Boolean).join(' / ')} />
        <Row label="ΜΑΡΚ" value={doc.mark} />
        <Row label="Κατάσταση" value={doc.status === 'classified' ? 'Χαρακτηρισμένο' : 'Αχαρακτήριστο'}
          color={doc.status === 'classified' ? c.good : c.warn} />
      </Card>
      {url && <View style={styles.open}><Button kind="ghost" title="Άνοιγμα παραστατικού" onPress={() => Linking.openURL(url)} /></View>}
      <Card>
        <Title style={styles.title}>Σύνολα</Title>
        <Row label="Καθαρή αξία" value={`${elAmount(doc.total_net)} €`} />
        <Row label="ΦΠΑ" value={`${elAmount(doc.total_vat)} €`} />
        {extras.filter(([, v]) => v).map(([label, v]) => <Row key={label} label={label} value={`${elAmount(v)} €`} />)}
        <Row label="Συνολική αξία" value={`${elAmount(doc.total_gross)} €`} strong />
      </Card>
      {lines.length > 0 && (
        <Card>
          <Title style={styles.title}>Γραμμές</Title>
          {lines.map((ln, i) => (
            <View key={`${ln.line_number}-${i}`} style={styles.line}>
              <Text style={{ color: c.text, fontWeight: '600' }}>Γραμμή {ln.line_number}</Text>
              <Row label="Καθαρή αξία" value={`${elAmount(ln.net_value)} €`} />
              <Row label={`ΦΠΑ ${VAT_CATEGORY_LABELS[ln.vat_category ?? ''] ?? ''}`} value={`${elAmount(ln.vat_amount)} €`} />
              {ln.taxes.map((t, n) => <Row key={n} label={TAX_TYPES[t.type] ?? t.type} value={`${elAmount(t.amount)} €`} />)}
            </View>
          ))}
        </Card>
      )}
      {taxes.length > 0 && (
        <Card>
          <Title style={styles.title}>Φόροι παραστατικού</Title>
          {taxes.map((t, n) => <Row key={n} label={TAX_TYPES[t.type] ?? t.type} value={`${elAmount(t.amount)} €`} />)}
        </Card>
      )}
      {cls.length > 0 && (
        <Card>
          <Title style={styles.title}>Χαρακτηρισμοί</Title>
          {cls.map((e, n) => <ClsRow key={n} cls={e} />)}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12 },
  title: { fontWeight: '700', marginBottom: 4 },
  line: { marginTop: 8 },
  cls: { marginTop: 8 },
  open: { marginBottom: 10 },
});
