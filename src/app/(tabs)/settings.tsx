// Ρυθμίσεις: Εταιρείες και Παράμετροι της εφαρμογής.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Companies from '../../screens/Companies.tsx';
import Parameters from '../../screens/Parameters.tsx';
import { Segments, useColors } from '../../ui/theme.tsx';

export default function Settings() {
  const c = useColors();
  const [view, setView] = useState<'companies' | 'parameters'>('companies');
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <Segments value={view} onChange={setView} options={[['companies', 'Εταιρείες'], ['parameters', 'Παράμετροι']]} />
      </View>
      {view === 'companies' ? <Companies /> : <Parameters />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: 12, paddingTop: 12 },
});
