import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '../../lib/theme';

type Props = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 'lg' (default, 18px) for top-level screen sections; 'md' (15px) for in-card sub-sections */
  size?: 'lg' | 'md';
};

export function SectionHeader({ title, subtitle, actionLabel, onAction, size = 'lg' }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={size === 'md' ? styles.titleMd : styles.titleLg}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  copy: { flex: 1, gap: 3 },
  titleLg: {
    fontFamily: fonts.heading,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.35,
    color: colors.green900,
  },
  titleMd: {
    fontFamily: fonts.headingSemi,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: -0.15,
    color: colors.green800,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  action: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.primary },
});
