import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, shadows, spacing } from '../../lib/theme';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra padding beyond the system inset (default: spacing.lg). */
  extraBottom?: number;
  /** Cap sheet height; default 90%. */
  maxHeight?: number | `${number}%`;
};

/**
 * Bottom-sheet container that clears the Android/iOS system navigation bar
 * and home indicator so Cancel/Save actions stay tappable.
 */
export function SafeModalSheet({
  children,
  style,
  extraBottom = spacing.lg,
  maxHeight = '90%',
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, spacing.md) + extraBottom;

  return (
    <View style={[styles.sheet, { paddingBottom: bottomPad, maxHeight }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.sm,
    ...shadows.lg,
  },
});
