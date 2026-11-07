import { Tabs } from 'expo-router';
import { CompanyTitle } from '../../ui/CompanyTitle.tsx';
import { TabBar } from '../../ui/TabBar.tsx';
import { useColors } from '../../ui/theme.tsx';

export default function TabLayout() {
  const c = useColors();
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerTitle: () => <CompanyTitle />, headerTitleAlign: 'left', headerStyle: { backgroundColor: c.card }, headerTintColor: c.text, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="reports" options={{ title: 'Αναλύσεις' }} />
      <Tabs.Screen name="income" options={{ title: 'Έσοδα' }} />
      <Tabs.Screen name="expense" options={{ title: 'Έξοδα' }} />
      <Tabs.Screen name="sync" options={{ title: 'Λήψη' }} />
      <Tabs.Screen name="settings" options={{ title: 'Ρυθμίσεις' }} />
    </Tabs>
  );
}
