import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';

type Props = {
  onPress?: () => void;
};

/**
 * Full-screen frosted dim behind a transparent modal sheet.
 *
 * RN Modal is a separate Android window, so BlurView cannot sample the page
 * behind it. We always paint an opaque-enough scrim on this pressable so the
 * schedule/page is clearly dimmed; iOS still gets a live BlurView on top.
 */
export function BlurredModalBackdrop({ onPress }: Props) {
  return (
    <Pressable
      style={styles.root}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
    >
      {Platform.OS === 'ios' ? (
        <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <>
          {/* Layered frost — reads as blur when true window blur is unavailable */}
          <View style={[StyleSheet.absoluteFill, styles.frostA]} pointerEvents="none" />
          <View style={[StyleSheet.absoluteFill, styles.frostB]} pointerEvents="none" />
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Critical: color on the pressable itself so Android Modal always dims
    backgroundColor: 'rgba(8, 36, 34, 0.62)',
  },
  frostA: {
    backgroundColor: 'rgba(244, 248, 247, 0.18)',
  },
  frostB: {
    backgroundColor: 'rgba(11, 61, 59, 0.22)',
  },
});
