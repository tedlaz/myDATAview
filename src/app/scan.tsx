// Σάρωση του QR εταιρείας από το myDATA Classifier (Βασικά στοιχεία της εταιρείας).
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { importCompany, parseCompanyQr } from '../book/companyQr.ts';
import { getStore } from '../db.ts';
import { saveKeys } from '../secrets.ts';
import { Button, useBottomSpace, useColors } from '../ui/theme.tsx';

export default function Scan() {
  const c = useColors();
  const bottom = useBottomSpace();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const scanned = async ({ data }: { data: string }) => {
    const qr = parseCompanyQr(data);
    if (!qr) return setMessage('Αυτό δεν είναι QR εταιρείας του myDATA.');
    setBusy(true);
    try {
      await importCompany(getStore(), qr, saveKeys);
      router.back();
    } catch {
      setMessage('Δεν αποθηκεύτηκαν τα κλειδιά στη συσκευή.');
      setBusy(false);
    }
  };

  if (!permission) return <View style={[styles.center, { backgroundColor: c.bg }]} />;

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={[styles.text, { color: c.text }]}>Για τη σάρωση του QR χρειάζεται η κάμερα. Χρησιμοποιείται μόνο εδώ.</Text>
        <Button title={permission.canAskAgain ? 'Επιτρέπω την κάμερα' : 'Ρυθμίσεις κινητού'}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : scanned} />
      <View style={[styles.help, { backgroundColor: c.card }, bottom]}>
        <Text style={{ color: message ? c.bad : c.text }} accessibilityLiveRegion="polite">
          {message || 'Στο myDATA άνοιξε την εταιρεία, στα «Βασικά στοιχεία» πάτα «QR για το myDATAview», και στόχευσέ το.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  camera: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { textAlign: 'center', marginBottom: 16 },
  help: { paddingHorizontal: 16, paddingTop: 14 },
});
