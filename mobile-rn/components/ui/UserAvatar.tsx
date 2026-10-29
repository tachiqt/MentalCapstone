import { useState } from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, fonts } from '../../lib/theme';
import { initials } from '../../lib/format';
import { resolveMediaUrl } from '../../lib/config';

type Props = {
  name?: string | null;
  avatarUrl?: string | null;
  size?: number;
  /** Number of initials to show when there is no image. */
  maxInitials?: number;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Avatar backed by the API's `avatar_url` (public Cloud Storage), falling back to
 * initials when there is no upload or the image fails to load. Mirrors
 * SC.fillAvatarEl on the web dashboard.
 */
export function UserAvatar({
  name,
  avatarUrl,
  size = 40,
  maxInitials = 2,
  textColor = colors.white,
  style,
}: Props) {
  const [failed, setFailed] = useState(false);
  const uri = failed ? null : resolveMediaUrl(avatarUrl);
  const abbr = initials(name || '?').slice(0, maxInitials);

  const frame = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  return (
    <View style={[styles.frame, frame, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={frame}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text
          style={[styles.text, { fontSize: Math.max(11, Math.round(size * 0.38)), color: textColor }]}
        >
          {abbr}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  text: { fontFamily: fonts.headingSemi },
});
