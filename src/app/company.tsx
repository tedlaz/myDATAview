// Στοιχεία εταιρείας. Τα αποθηκευμένα κλειδιά δεν εμφανίζονται ποτέ: κενό πεδίο στην επεξεργασία = μένουν ως έχουν.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { getStore } from '../db.ts';
import { deleteKeys, saveKeys } from '../secrets.ts';
import type { Company } from '../store.ts';
import { Button, Chips, useBottomSpace, useColors } from '../ui/theme.tsx';

export default function CompanyForm() {
  const c = useColors();
  const bottom = useBottomSpace();
  const params = useLocalSearchParams<{ id?: string }>();
  const existing = getStore().companies().find((x) => x.id === Number(params.id));
  const [name, setName] = useState(existing?.name ?? '');
  const [vat, setVat] = useState(existing?.vat ?? '');
  const [env, setEnv] = useState<Company['env']>(existing?.env ?? 'prod');
  const [vatPeriod, setVatPeriod] = useState<Company['vat_period']>(existing?.vat_period ?? 'm');
  const [accountant, setAccountant] = useState(!!existing?.via_accountant);
  const [userId, setUserId] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const data = { name: name.trim(), vat: vat.trim(), env, via_accountant: accountant ? 1 : 0, vat_period: vatPeriod };
    const newKeys = { userId: userId.trim(), subscriptionKey: key.trim() };
    if (!data.name) return setError('Η επωνυμία είναι υποχρεωτική.');
    if (!/^\d{9}$/.test(data.vat)) return setError('Το ΑΦΜ θέλει 9 ψηφία.');
    if (!!newKeys.userId !== !!newKeys.subscriptionKey || (!existing && !newKeys.userId)) {
      return setError('Συμπλήρωσε και τα δύο κλειδιά ΑΑΔΕ.');
    }
    setSaving(true);
    const store = getStore();
    const id = existing?.id ?? store.addCompany(data);
    try {
      if (newKeys.userId) await saveKeys(id, newKeys);
    } catch {
      if (!existing) store.deleteCompany(id); // αλλιώς κάθε νέο πάτημα θα έφτιαχνε δεύτερη εταιρεία
      setError('Δεν αποθηκεύτηκαν τα κλειδιά στη συσκευή.');
      setSaving(false);
      return;
    }
    if (existing) store.updateCompany({ ...data, id });
    router.back();
  };

  const remove = () => {
    if (!existing) return;
    Alert.alert('Διαγραφή εταιρείας', `Θα διαγραφούν από το κινητό τα παραστατικά και τα κλειδιά της «${existing.name}». Το myDATA δεν επηρεάζεται.`, [
      { text: 'Άκυρο', style: 'cancel' },
      {
        text: 'Διαγραφή',
        style: 'destructive',
        onPress: async () => {
          await deleteKeys(existing.id);
          getStore().deleteCompany(existing.id);
          router.back();
        },
      },
    ]);
  };

  const input = [styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.line }];
  const label = [styles.label, { color: c.text }];
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={[styles.screen, bottom]} keyboardShouldPersistTaps="handled">
      <Text style={label}>Επωνυμία</Text>
      <TextInput value={name} onChangeText={setName} style={input} accessibilityLabel="Επωνυμία" />
      <Text style={label}>ΑΦΜ</Text>
      <TextInput value={vat} onChangeText={setVat} style={input} accessibilityLabel="ΑΦΜ" keyboardType="number-pad" maxLength={9} />
      <Text style={label}>Περιβάλλον</Text>
      <Chips value={env} onChange={setEnv} options={[['prod', 'Παραγωγή'], ['dev', 'Δοκιμαστικό']]} />
      <Text style={label}>Περίοδος ΦΠΑ</Text>
      <Chips value={vatPeriod} onChange={setVatPeriod} options={[['m', 'Μηνιαίος'], ['q', 'Τριμηνιαίος']]} />
      <View style={styles.toggle}>
        <Text style={{ color: c.text, flexShrink: 1 }}>Κλειδιά λογιστή (κλήση για λογαριασμό της εταιρείας)</Text>
        <Switch value={accountant} onValueChange={setAccountant} accessibilityLabel="Κλειδιά λογιστή" />
      </View>
      <Text style={label}>aade-user-id</Text>
      <TextInput value={userId} onChangeText={setUserId} style={input} accessibilityLabel="aade-user-id" autoCapitalize="none"
        autoCorrect={false} placeholder={existing ? 'Αποθηκευμένο · κενό = χωρίς αλλαγή' : ''} placeholderTextColor={c.muted} />
      <Text style={label}>Ocp-Apim-Subscription-Key</Text>
      <TextInput value={key} onChangeText={setKey} style={input} accessibilityLabel="Subscription key" autoCapitalize="none"
        autoCorrect={false} secureTextEntry placeholder={existing ? 'Αποθηκευμένο · κενό = χωρίς αλλαγή' : ''} placeholderTextColor={c.muted} />
      <Text style={[styles.note, { color: c.muted }]}>Τα κλειδιά μένουν κρυπτογραφημένα μόνο σε αυτή τη συσκευή.</Text>
      {!!error && <Text accessibilityLiveRegion="polite" style={{ color: c.bad, marginBottom: 12 }}>{error}</Text>}
      <Button title="Αποθήκευση" onPress={save} disabled={saving} />
      {existing && <View style={styles.remove}><Button kind="danger" title="Διαγραφή εταιρείας" onPress={remove} /></View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 12 },
  label: { marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, minHeight: 46, paddingHorizontal: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, marginTop: 8 },
  note: { marginVertical: 12, fontSize: 13 },
  remove: { marginTop: 24 },
});
