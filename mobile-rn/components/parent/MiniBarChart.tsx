import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, fonts, spacing, radii, shadows } from '../../lib/theme';

type Bar = { label: string; value: number; color?: string };

type Props = {
  title: string;
  subtitle?: string;
  data: Bar[];
};

const BAR_TONES = [colors.primary, colors.primaryLight, '#2A8A86', '#3FA09B'];

export function MiniBarChart({ title, subtitle, data }: Props) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="bar-chart" size={16} color={colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.totalPill}>
          <Text style={styles.totalValue}>{total}</Text>
          <Text style={styles.totalLabel}>total</Text>
        </View>
      </View>

      <View style={styles.bars}>
        {data.map((bar, index) => {
          const tone = bar.color || BAR_TONES[index % BAR_TONES.length];
          const pct = Math.max((bar.value / max) * 100, bar.value > 0 ? 12 : 0);
          return (
            <View key={bar.label} style={styles.row}>
              <View style={[styles.avatar, { backgroundColor: `${tone}18` }]}>
                <Text style={[styles.avatarText, { color: tone }]}>
                  {bar.label.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowMain}>
                <View style={styles.rowTop}>
                  <Text style={styles.label} numberOfLines={1}>
                    {bar.label}
                  </Text>
                  <Text style={[styles.value, { color: tone }]}>{bar.value}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: tone }]} />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a10,
    gap: spacing.lg,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1, gap: 2 },
  title: {
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    color: colors.primary,
    letterSpacing: -0.2,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  totalPill: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  totalValue: { fontFamily: fonts.heading, fontSize: 15, color: colors.primary, lineHeight: 18 },
  totalLabel: { fontFamily: fonts.body, fontSize: 9, color: colors.textMuted, marginTop: -1 },
  bars: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.headingSemi, fontSize: 13 },
  rowMain: { flex: 1, gap: 6 },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  label: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.text,
  },
  value: { fontFamily: fonts.headingSemi, fontSize: 14 },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.tint300,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 999 },
});
