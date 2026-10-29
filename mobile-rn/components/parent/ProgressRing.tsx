import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../../lib/theme';

type Props = {
  value: number;
  max?: number;
  label?: string;
  sublabel?: string;
  size?: number;
  color?: string;
  trackColor?: string;
};

/**
 * Draws a circular progress ring using the CSS border + rotation masking technique.
 * Two half-circle clips are stacked; only the filled half rotates to reveal the arc.
 * Works without react-native-svg.
 */
export function ProgressRing({
  value,
  max = 100,
  label,
  sublabel,
  size = 72,
  color = colors.primary,
  trackColor = colors.borderLight,
}: Props) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const display = max === 100 ? `${Math.round(pct)}%` : String(value);
  const stroke = Math.max(4, Math.round(size * 0.1));
  const inner = size - stroke * 2;

  // Convert % to degrees (0–360)
  const deg = (pct / 100) * 360;

  // For 0–50% only left half rotates; for 50–100% both halves contribute.
  const leftRotate = deg > 180 ? 180 : deg;
  const rightVisible = deg > 180;
  const rightRotate = deg > 180 ? deg - 180 : 0;

  return (
    <View style={styles.wrap}>
      {/* Ring container */}
      <View style={{ width: size, height: size }}>
        {/* Track */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: trackColor,
            },
          ]}
        />

        {/* Right half (0–180 deg) — always rendered, starts from top-right */}
        <View
          style={[
            styles.halfWrap,
            { width: size / 2, height: size, left: size / 2, borderTopRightRadius: size / 2, borderBottomRightRadius: size / 2 },
          ]}
        >
          <View
            style={[
              styles.halfFill,
              {
                width: size / 2,
                height: size,
                borderTopRightRadius: size / 2,
                borderBottomRightRadius: size / 2,
                borderWidth: stroke,
                borderColor: color,
                borderLeftWidth: 0,
                borderLeftColor: 'transparent',
                transform: [
                  { translateX: -(size / 4) },
                  { rotate: `${leftRotate}deg` },
                  { translateX: size / 4 },
                ],
              },
            ]}
          />
        </View>

        {/* Left half (180–360 deg) — only visible when > 50% */}
        {rightVisible ? (
          <View
            style={[
              styles.halfWrap,
              { width: size / 2, height: size, left: 0, borderTopLeftRadius: size / 2, borderBottomLeftRadius: size / 2 },
            ]}
          >
            <View
              style={[
                styles.halfFill,
                {
                  width: size / 2,
                  height: size,
                  borderTopLeftRadius: size / 2,
                  borderBottomLeftRadius: size / 2,
                  borderWidth: stroke,
                  borderColor: color,
                  borderRightWidth: 0,
                  borderRightColor: 'transparent',
                  transform: [
                    { translateX: size / 4 },
                    { rotate: `${rightRotate}deg` },
                    { translateX: -(size / 4) },
                  ],
                },
              ]}
            />
          </View>
        ) : null}

        {/* Center label */}
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <View
            style={{
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[styles.value, { fontSize: Math.max(10, Math.round(size * 0.2)) }]}>
              {display}
            </Text>
          </View>
        </View>
      </View>

      {label ? <Text style={styles.label}>{label}</Text> : null}
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  halfWrap: { position: 'absolute', top: 0, overflow: 'hidden' },
  halfFill: { position: 'absolute', top: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  value: { fontFamily: fonts.heading, color: colors.text, letterSpacing: -0.4 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  sublabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted, textAlign: 'center' },
});
