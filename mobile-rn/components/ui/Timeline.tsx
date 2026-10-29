import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { alpha, colors, fonts, spacing, radii } from '../../lib/theme';

type ItemProps = {
  title: string;
  body?: string;
  meta?: string;
  badge?: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
  accent?: string;
  children?: React.ReactNode;
};

export function TimelineItem({
  title,
  body,
  meta,
  badge,
  isFirst,
  isLast,
  accent = colors.primary,
  children,
}: ItemProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View
          style={[
            styles.dot,
            isFirst && styles.dotFirst,
            { backgroundColor: accent, borderColor: colors.primarySoft },
          ]}
        />
        {!isLast ? <View style={styles.line} /> : null}
      </View>
      <View style={[styles.card, isFirst && styles.cardFirst]}>
        <Text style={styles.title}>{title}</Text>
        {badge ? <View style={styles.badgeWrap}>{badge}</View> : null}
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export function Timeline({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.wrap, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: { flexDirection: 'row', gap: spacing.md },
  rail: { width: 18, alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 14,
    backgroundColor: colors.border,
  },
  dotFirst: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
    marginTop: 12,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: colors.green100,
    marginTop: 4,
    minHeight: 16,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: 6,
    marginBottom: spacing.md,
  },
  // The larger rail dot already marks this entry as current; a colored edge
  // stripe on top of it would be decoration.
  cardFirst: {
    backgroundColor: colors.tint100,
    borderColor: alpha.a22,
  },
  title: {
    fontFamily: fonts.headingSemi,
    fontSize: 15,
    color: colors.green900,
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  badgeWrap: { alignSelf: 'flex-start' },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
