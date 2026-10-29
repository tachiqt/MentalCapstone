import { useEffect, useRef } from 'react';
import { View, StyleSheet, ViewStyle, Animated } from 'react-native';
import { alpha, colors, radii, spacing } from '../../lib/theme';

function usePulse() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
}

function Bone({ widthPct, fixedWidth, height = 10, style }: {
  widthPct?: number;
  fixedWidth?: number;
  height?: number;
  style?: ViewStyle;
}) {
  const opacity = usePulse();
  const w = fixedWidth != null ? fixedWidth : `${widthPct ?? 100}%` as `${number}%`;
  return (
    <Animated.View
      style={[styles.bone, { width: w, height, borderRadius: height / 2, opacity }, style]}
    />
  );
}

type Props = {
  height?: number;
  style?: ViewStyle;
  lines?: number;
};

export function SkeletonCard({ height = 88, style, lines = 0 }: Props) {
  return (
    <View style={[styles.card, { minHeight: height }, style]}>
      <View style={styles.row}>
        <Bone fixedWidth={48} height={48} style={styles.circle} />
        <View style={styles.col}>
          <Bone widthPct={55} height={11} />
          <Bone widthPct={35} height={8} />
        </View>
      </View>
      {Array.from({ length: lines }).map((_, i) => (
        <Bone key={i} widthPct={i % 2 === 0 ? 90 : 70} height={9} style={{ marginTop: spacing.sm }} />
      ))}
    </View>
  );
}

export function SkeletonRow({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.rowOnly, style]}>
      <Bone fixedWidth={40} height={40} style={styles.circleSm} />
      <View style={styles.col}>
        <Bone widthPct={40} height={11} />
        <Bone widthPct={30} height={8} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  col: { flex: 1, gap: 8 },
  bone: { backgroundColor: colors.green100 },
  circle: { borderRadius: 24, flexShrink: 0 },
  circleSm: { borderRadius: 20, flexShrink: 0 },
});
