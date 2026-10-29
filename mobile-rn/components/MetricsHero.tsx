import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../lib/theme';

type Stat = {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
};

type Props = {
  title?: string;
  subtitle?: string;
  stats: Stat[];
};

export function MetricsHero({ title = 'Overview', subtitle, stats }: Props) {
  return (
    <View style={styles.hero}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.grid}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.tile}>
            <View style={styles.iconWrap}>
              <Ionicons name={stat.icon} size={16} color={colors.primary} />
            </View>
            <Text style={styles.value}>{stat.value}</Text>
            <Text style={styles.label}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.white },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: 'rgba(255,255,255,0.82)', lineHeight: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tile: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 2,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  value: { fontFamily: fonts.heading, fontSize: 22, color: colors.white },
  label: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.85)' },
});
