import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, fonts, radii, spacing } from '../../lib/theme';

export type SegmentOption<T extends string> = {
  key: T;
  label: string;
  count?: number;
  icon?: keyof typeof Ionicons.glyphMap;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.bar}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[
              styles.btn,
              active ? styles.btnActive : styles.btnIdle,
              active ? styles.btnExpanded : styles.btnCompact,
            ]}
            onPress={() => onChange(opt.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            activeOpacity={0.85}
          >
            {opt.icon ? (
              <Ionicons name={opt.icon} size={18} color={active ? colors.white : colors.primary} />
            ) : null}
            {active || !opt.icon ? (
              <Text style={[styles.label, active ? styles.labelActive : styles.labelIdle]} numberOfLines={1}>
                {opt.label}
              </Text>
            ) : null}
            {opt.count != null ? (
              <View style={[styles.count, active && styles.countActive]}>
                <Text style={[styles.countText, active && styles.countTextActive]}>{opt.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.pill,
    minHeight: 48,
  },
  btnExpanded: {
    flex: 1.6,
    paddingHorizontal: spacing.md,
  },
  btnCompact: {
    flex: 0.7,
    paddingHorizontal: spacing.sm,
  },
  btnActive: {
    backgroundColor: colors.green800,
  },
  btnIdle: {
    backgroundColor: colors.green50,
    borderWidth: 1.5,
    borderColor: alpha.a22,
  },
  label: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.primary },
  labelIdle: { color: colors.primary },
  labelActive: { color: colors.white },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.green100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  countText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primary },
  countTextActive: { color: colors.white },
});
