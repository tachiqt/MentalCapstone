import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, fonts } from '../../lib/theme';
import { initials } from '../../lib/format';

type Props = {
  name: string;
  size?: number;
  style?: ViewStyle;
  tone?: 'primary' | 'accent' | 'soft';
};

export function ChildAvatar({ name, size = 48, style, tone = 'soft' }: Props) {
  const bg =
    tone === 'primary'
      ? colors.green800
      : tone === 'accent'
      ? colors.tint300
      : colors.green50;

  const fg =
    tone === 'primary'
      ? colors.white
      : tone === 'accent'
      ? colors.green700
      : colors.green800;

  const borderColor =
    tone === 'primary'
      ? colors.green700
      : tone === 'accent'
      ? colors.green100
      : colors.green100;

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderColor,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: Math.max(10, Math.round(size * 0.34)), color: fg }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  text: { fontFamily: fonts.headingSemi },
});
