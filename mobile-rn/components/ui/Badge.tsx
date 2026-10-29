import { Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, fonts, radii } from '../../lib/theme';

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

type Props = {
  label: string;
  tone?: Tone;
  style?: ViewStyle;
};

const toneStyles: Record<Tone, { bg: string; text: string }> = {
  accent: { bg: colors.accentSoft, text: colors.accent },
  success: { bg: colors.successLight, text: colors.success },
  warning: { bg: colors.warningLight, text: colors.warning },
  danger: { bg: colors.dangerLight, text: colors.danger },
  neutral: { bg: colors.primarySoft, text: colors.primary },
};

export function Badge({ label, tone = 'accent', style }: Props) {
  const palette = toneStyles[tone];
  return (
    <Text style={[styles.badge, { backgroundColor: palette.bg, color: palette.text }, style]}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
});
