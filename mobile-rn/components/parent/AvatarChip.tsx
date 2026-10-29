import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { colors, fonts, spacing, radii } from '../../lib/theme';
import { initials } from '../../lib/format';

type Props = {
  label: string;
  active?: boolean;
  onPress: () => void;
};

export function AvatarChip({ label, active = false, onPress }: Props) {
  const abbr = label === 'All' ? '∗' : initials(label);

  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.avatar, active && styles.avatarActive]}>
        <Text style={[styles.avatarText, active && styles.avatarTextActive]}>{abbr}</Text>
      </View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
    minWidth: 56,
  },
  chipActive: { backgroundColor: colors.primarySoft },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: { borderColor: colors.primary, backgroundColor: colors.surface },
  avatarText: { fontFamily: fonts.headingSemi, fontSize: 13, color: colors.textSecondary },
  avatarTextActive: { color: colors.primary },
  label: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted, maxWidth: 64, textAlign: 'center' },
  labelActive: { color: colors.primary },
});
