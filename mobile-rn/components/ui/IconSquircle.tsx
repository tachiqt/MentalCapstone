import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../lib/theme';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  size?: number;
  /** Icon colour. Also used for the border tint when no background is given. */
  accent?: string;
  background?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The rounded-square icon tile used across the app in place of flat circles,
 * mirroring the web dashboard's tinted icon wells.
 */
export function IconSquircle({
  icon,
  size = 40,
  accent = colors.green800,
  background = colors.green50,
  style,
}: Props) {
  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, backgroundColor: background, borderColor: colors.green100 },
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.45)} color={accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
