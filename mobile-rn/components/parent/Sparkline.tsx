import { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, fonts, spacing, radii, shadows } from '../../lib/theme';

type Point = { label: string; value: number };

type Props = {
  title: string;
  subtitle?: string;
  data: Point[];
};

const CHART_HEIGHT = 96;
const PAD_Y = 14;
const DOT = 8;

type Coord = { x: number; y: number };

const STROKE = 2.5;

function lineSegment(from: Coord, to: Coord) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return {
    length,
    angle,
    left: (from.x + to.x) / 2 - length / 2,
    top: (from.y + to.y) / 2 - STROKE / 2,
  };
}

export function Sparkline({ title, subtitle, data }: Props) {
  const [width, setWidth] = useState(0);
  const max = Math.max(...data.map((d) => d.value), 1);
  const last = data[data.length - 1];
  const peak = Math.max(...data.map((d) => d.value), 0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  const coords: Coord[] = data.map((point, i) => {
    const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width;
    const usable = CHART_HEIGHT - PAD_Y * 2;
    const y = CHART_HEIGHT - PAD_Y - (point.value / max) * usable;
    return { x, y };
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="trending-up" size={16} color={colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {last ? (
          <View style={styles.badge}>
            <Text style={styles.badgeValue}>{last.value}</Text>
            <Text style={styles.badgeLabel}>this week</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.chartWrap}>
        <View style={styles.chart} onLayout={onLayout}>
          {width > 0 ? (
            <>
              {[0.25, 0.5, 0.75].map((ratio) => (
                <View key={ratio} style={[styles.gridLine, { top: CHART_HEIGHT * ratio }]} />
              ))}
              {coords.slice(0, -1).map((from, i) => {
                const { length, angle, left, top } = lineSegment(from, coords[i + 1]);
                return (
                  <View
                    key={`seg-${data[i].label}`}
                    style={[
                      styles.segment,
                      {
                        width: length,
                        left,
                        top,
                        transform: [{ rotate: `${angle}deg` }],
                      },
                    ]}
                  />
                );
              })}
              {coords.map((point, i) => {
                const isLatest = i === coords.length - 1;
                const isPeak = data[i].value === peak && peak > 0;
                const size = isLatest ? 11 : DOT;
                return (
                  <View
                    key={`dot-${data[i].label}`}
                    style={[
                      styles.dot,
                      isPeak && !isLatest && styles.dotPeak,
                      isLatest && styles.dotLatest,
                      { left: point.x - size / 2, top: point.y - size / 2 },
                    ]}
                  />
                );
              })}
            </>
          ) : null}
        </View>

        <View style={styles.labels}>
          {data.map((d) => (
            <Text key={d.label} style={styles.axisLabel} numberOfLines={1}>
              {d.label}
            </Text>
          ))}
        </View>
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
    borderColor: alpha.a10,
    gap: spacing.md,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1, gap: 2 },
  title: {
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    color: colors.primary,
    letterSpacing: -0.2,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  badgeValue: { fontFamily: fonts.heading, fontSize: 15, color: colors.white, lineHeight: 18 },
  badgeLabel: { fontFamily: fonts.body, fontSize: 9, color: 'rgba(255,255,255,0.75)', marginTop: -1 },
  chartWrap: {
    backgroundColor: colors.green50,
    borderRadius: radii.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: alpha.a06,
    gap: spacing.sm,
  },
  chart: {
    height: CHART_HEIGHT,
    position: 'relative',
    marginHorizontal: spacing.xs,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: alpha.a10,
  },
  segment: {
    position: 'absolute',
    height: STROKE,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  dotPeak: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.primarySoft,
  },
  dotLatest: {
    backgroundColor: colors.primary,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  axisLabel: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
