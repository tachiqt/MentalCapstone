import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, fonts, radii, shadows, spacing } from '../../lib/theme';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
};

export function Button({ label, onPress, loading, disabled, variant = 'primary', icon, style }: Props) {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';
  const isDanger = variant === 'danger';

  const iconColor = isPrimary || isDanger ? colors.white : isGhost ? colors.primary : colors.primary;

  return (
    <TouchableOpacity
      style={[
        styles.base,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        isGhost && styles.ghost,
        isDanger && styles.danger,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary || isDanger ? colors.white : colors.primary} />
      ) : (
        <View style={styles.inner}>
          {icon ? <Ionicons name={icon} size={16} color={iconColor} style={styles.icon} /> : null}
          <Text
            style={[
              styles.label,
              isPrimary && styles.primaryLabel,
              isSecondary && styles.secondaryLabel,
              isGhost && styles.ghostLabel,
              isDanger && styles.dangerLabel,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: 14,
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  icon: { marginTop: 1 },
  primary: { backgroundColor: colors.primary, ...shadows.sm },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: alpha.a22,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.danger, ...shadows.sm },
  disabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  label: { fontFamily: fonts.headingSemi, fontSize: 15, letterSpacing: -0.1 },
  primaryLabel: { color: colors.white },
  secondaryLabel: { color: colors.primary },
  ghostLabel: { color: colors.primary },
  dangerLabel: { color: colors.white },
});
