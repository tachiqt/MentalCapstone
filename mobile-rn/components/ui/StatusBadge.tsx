import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radii, spacing } from '../../lib/theme';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent' | 'info';

type Props = {
  label: string;
  tone?: Tone;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
};

const toneMap: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.warning },
  danger: { bg: colors.dangerLight, fg: colors.danger },
  neutral: { bg: colors.primarySoft, fg: colors.primary },
  accent: { bg: colors.accentSoft, fg: colors.accent },
  info: { bg: colors.infoLight, fg: colors.info },
};

export function StatusBadge({ label, tone = 'neutral', icon, style }: Props) {
  const palette = toneMap[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: palette.bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} /> : null}
      <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    textTransform: 'capitalize',
  },
});
