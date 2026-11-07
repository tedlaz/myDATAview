import { useAutoFetch } from '../background.ts'; // ορίζει και την εργασία παρασκηνίου, γι' αυτό φορτώνεται εδώ
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useColors, useTheme } from '../ui/theme.tsx';

function Screens() {
  const c = useColors();
  const { theme } = useTheme();
  useAutoFetch();
  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: c.card }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="company" options={{ title: 'Εταιρεία' }} />
        <Stack.Screen name="doc/[mark]" options={{ title: 'Παραστατικό' }} />
        <Stack.Screen name="counterparty/[vat]" options={{ title: 'Συναλλασσόμενος' }} />
      </Stack>
    </>
  );
}

export default function Layout() {
  return <ThemeProvider><Screens /></ThemeProvider>;
}
