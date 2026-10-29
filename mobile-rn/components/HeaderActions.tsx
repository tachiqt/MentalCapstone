import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { colors, spacing, fonts } from '../lib/theme';
import { useUnreadCount } from '../lib/notifications';
import { UserAvatar } from './ui/UserAvatar';

type Props = {
  showProfile?: boolean;
};

export function HeaderActions({ showProfile = true }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const unread = useUnreadCount();
  const hasUnread = unread > 0;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.iconBtn, hasUnread && styles.iconBtnActive]}
        onPress={() => router.push('/(app)/notifications')}
        accessibilityRole="button"
        accessibilityLabel={hasUnread ? `Notifications, ${unread} unread` : 'Notifications'}
        hitSlop={4}
      >
        <Ionicons
          name={hasUnread ? 'notifications' : 'notifications-outline'}
          size={20}
          color={hasUnread ? colors.green800 : colors.text}
        />
        {hasUnread ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {showProfile ? (
        <TouchableOpacity
          onPress={() => router.push('/(app)/profile')}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          hitSlop={4}
        >
          <UserAvatar
            name={user?.name}
            avatarUrl={user?.avatar_url}
            size={40}
            maxInitials={1}
            style={styles.avatarBtn}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.green100,
  },
  iconBtnActive: { backgroundColor: colors.green100 },
  // Deliberately the one non-green signal in the UI; nothing else reads as urgent.
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: {
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    lineHeight: 13,
    color: colors.white,
  },
  avatarBtn: {
    borderWidth: 2,
    borderColor: colors.primaryLight,
  },
});
