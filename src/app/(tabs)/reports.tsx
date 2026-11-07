// Αναλύσεις: Πίνακας ελέγχου και Συνοπτικό βιβλίο με κοινό έτος και διακόπτη αχαρακτήριστων, και Συναλλασσόμενοι.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { todayGr } from '../../aade/client.ts';
import Counterparties from '../../screens/Counterparties.tsx';
import Dashboard from '../../screens/Dashboard.tsx';
import Yearly from '../../screens/Yearly.tsx';
import { Segments, useColors } from '../../ui/theme.tsx';

export default function Reports() {
  const c = useColors();
  const [view, setView] = useState<'dashboard' | 'yearly' | 'counterparties'>('dashboard');
  const [year, setYear] = useState(todayGr().slice(6));
  const [withUnclassified, setWithUnclassified] = useState(true);
  const shared = { year, setYear, withUnclassified, setWithUnclassified };
  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <Segments value={view} onChange={setView} options={[['dashboard', 'Πίνακας'], ['yearly', 'Συνοπτικό'], ['counterparties', 'Συναλλασσόμενοι']]} />
      </View>
      {view === 'dashboard' && <Dashboard {...shared} onYearly={() => setView('yearly')} />}
      {view === 'yearly' && <Yearly {...shared} />}
      {view === 'counterparties' && <Counterparties />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: 12, paddingTop: 12 },
});
