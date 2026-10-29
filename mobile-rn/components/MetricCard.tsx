import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, fonts, spacing, radii, shadows } from '../lib/theme';

type Props = {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: 'primary' | 'accent' | 'success' | 'warning';
  style?: ViewStyle;
};

const toneMap = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.warning },
};

export function MetricCard({ label, value, icon, tone = 'primary', style }: Props) {
  const palette = toneMap[tone];

  return (
    <View style={[styles.card, style]}>
      <View style={[styles.iconWrap, { backgroundColor: palette.bg }]}>
        <Ionicons name={icon} size={18} color={palette.fg} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  value: { fontFamily: fonts.heading, fontSize: 24, color: colors.text },
  label: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
