import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, fonts, spacing, radii, shadows } from '../../lib/theme';

type Props = {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  delta?: string;
  tone?: 'primary' | 'accent' | 'success' | 'warning';
  style?: ViewStyle;
};

const toneMap = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.warning },
};

export function StatTile({ label, value, icon, delta, tone = 'primary', style }: Props) {
  const palette = toneMap[tone];

  return (
    <View style={[styles.tile, style]}>
      <View style={[styles.iconWrap, { backgroundColor: palette.bg }]}>
        <Ionicons name={icon} size={18} color={palette.fg} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {delta ? <Text style={[styles.delta, { color: palette.fg }]}>{delta}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    alignItems: 'center',
    gap: 2,
    ...shadows.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  value: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  label: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  delta: { fontFamily: fonts.bodyMedium, fontSize: 10, marginTop: 2 },
});
