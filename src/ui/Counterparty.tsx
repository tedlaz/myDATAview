// Αρχικά και ρόλος συναλλασσόμενου, με τα χρώματα του myDATA: πελάτης πράσινο, προμηθευτής μπλε, και τα δύο μωβ.
import { StyleSheet, Text, View } from 'react-native';
import { shortName } from '../names.ts';
import type { Role } from '../store.ts';

const ROLES: Record<Role, { hue: string; icon: string; label: string }> = {
  income: { hue: '150 60%', icon: '🛒', label: 'Πελάτης' },
  expense: { hue: '210 70%', icon: '🚚', label: 'Προμηθευτής' },
  both: { hue: '270 60%', icon: '🔁', label: 'Πελάτης & Προμηθευτής' },
};
const hsl = (hue: string, lightness: number, alpha = 1) => {
  const [h, s] = hue.split(' ');
  return `hsla(${h}, ${s}, ${lightness}%, ${alpha})`;
};

export function Avatar({ name, role }: { name: string | null; role: Role }) {
  const initials = (shortName(name) || '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={[styles.avatar, { backgroundColor: hsl(ROLES[role].hue, 42) }]}>
      <Text style={styles.initials}>{initials}</Text>
    </View>
  );
}

export function RolePill({ role }: { role: Role }) {
  const { hue, icon, label } = ROLES[role];
  return (
    <View accessibilityLabel={label} style={[styles.pill, { backgroundColor: hsl(hue, 50, 0.14), borderColor: hsl(hue, 50, 0.4) }]}>
      <Text style={styles.icon}>{icon}</Text>
    </View>
  );
}

export const roleLabel = (role: Role) => ROLES[role].label;

const styles = StyleSheet.create({
  avatar: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '800', fontSize: 14 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  icon: { fontSize: 13 },
});
