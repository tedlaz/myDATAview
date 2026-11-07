// Το κάτω μενού: κάρτα που αιωρείται πάνω από το φόντο, με τα εικονίδια του myDATA και φωτεινό χάπι στην ενεργή καρτέλα.
import type { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useColors } from './theme.tsx';

const ICONS: Record<string, { paths: string[]; circle?: boolean }> = {
  reports: { paths: ['M3 3v18h18M18 17V9M13 17V5M8 17v-3'] },
  income: { paths: ['M16 12l-4-4-4 4M12 16V8'], circle: true },
  expense: { paths: ['M8 12l4 4 4-4M12 8v8'], circle: true },
  sync: { paths: ['M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12A9 9 0 0 1 18.5 5.8L21 8M21 3v5h-5M3 21v-5h5'] },
  settings: { paths: ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'] },
};

function Icon({ name, color }: { name: string; color: string }) {
  const icon = ICONS[name];
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      {icon?.circle && <Circle cx={12} cy={12} r={10} {...stroke} />}
      {icon?.paths.map((d) => <Path key={d} d={d} {...stroke} />)}
    </Svg>
  );
}

function Item({ name, label, focused, onPress }: { name: string; label: string; focused: boolean; onPress: () => void }) {
  const c = useColors();
  const [on] = useState(() => new Animated.Value(focused ? 1 : 0));
  const [press] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.spring(on, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
  }, [focused, on]);

  const scale = (toValue: number) => Animated.spring(press, { toValue, useNativeDriver: true, speed: 40 }).start();
  const color = focused ? c.accentDeep : c.muted;

  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}
      onPress={onPress} onPressIn={() => scale(0.92)} onPressOut={() => scale(1)} style={styles.item}>
      <Animated.View style={[styles.inner, { transform: [{ scale: press }] }]}>
        <View style={styles.iconBox}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.pill, {
            backgroundColor: c.accentSoft,
            opacity: on,
            transform: [{ scaleX: on.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
          }]} />
          <Icon name={name} color={color} />
        </View>
        <Animated.Text numberOfLines={1} style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]}>{label}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

// Τα props όπως τα ορίζει η Expo Router, ώστε μια αλλαγή τους να φαίνεται στον έλεγχο τύπων.
type Props = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: Props) {
  const c = useColors();
  return (
    <View style={[styles.area, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View accessibilityRole="tablist" style={[styles.dock, { backgroundColor: c.card, borderColor: c.line }]}>
        {state.routes.map((route, i) => (
          <Item key={route.key} name={route.name} label={descriptors[route.key].options.title ?? route.name} focused={state.index === i}
            onPress={() => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (state.index !== i && !event.defaultPrevented) navigateToTab(route.key);
            }} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  area: { paddingHorizontal: 10, paddingTop: 6 },
  dock: {
    flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, paddingVertical: 7, paddingHorizontal: 4,
    elevation: 8, shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  item: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 3 },
  iconBox: { width: 56, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 16 },
  label: { fontSize: 11 },
});
