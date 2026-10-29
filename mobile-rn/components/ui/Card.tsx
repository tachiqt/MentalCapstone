import { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { alpha, colors, radii, shadows, spacing } from '../../lib/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  /** Green-tinted fill instead of plain white, for secondary panels. */
  tinted?: boolean;
  /**
   * Marks the card as current, unread, or otherwise wanting attention. Reads as
   * a tinted, more firmly outlined surface rather than a colored edge stripe.
   */
  highlighted?: boolean;
};

export function Card({ children, style, tinted = false, highlighted = false }: Props) {
  return (
    <View
      style={[
        styles.card,
        tinted && styles.tinted,
        highlighted && styles.highlighted,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  tinted: {
    backgroundColor: colors.tint100,
    borderColor: alpha.a10,
  },
  highlighted: {
    backgroundColor: colors.tint100,
    borderColor: alpha.a22,
    ...shadows.md,
  },
});
