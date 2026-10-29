import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useAuth } from '../../../lib/auth';
import { api } from '../../../lib/api';
import { Screen } from '../../../components/ui/Screen';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type Child = { id: number };
type FeedbackItem = { id: number };

function MenuRow({
  icon,
  label,
  description,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuLabel}>{label}</Text>
        {description ? <Text style={styles.menuDesc}>{description}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function ParentProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const { data: children } = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[]>('/children'),
  });
  const { data: feedback } = useQuery({
    queryKey: ['parent-feedback'],
    queryFn: () => api<FeedbackItem[]>('/parent-feedback'),
  });

  const childCount = Array.isArray(children) ? children.length : 0;
  const feedbackCount = Array.isArray(feedback) ? feedback.length : 0;
  const appVersion = Constants.expoConfig?.version || '1.0.0';

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <UserAvatar
            name={user?.name || 'P'}
            avatarUrl={user?.avatar_url}
            size={72}
            textColor={colors.primary}
            style={styles.avatar}
          />
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Badge label={user?.role || 'parent'} tone="neutral" style={styles.role} />
          <View style={styles.secondaryStats}>
            <Text style={styles.secondaryStat}>
              {childCount} linked child{childCount === 1 ? '' : 'ren'}
            </Text>
            <Text style={styles.secondaryDot}>·</Text>
            <Text style={styles.secondaryStat}>{feedbackCount} updates sent</Text>
          </View>
        </View>

        <SectionHeader title="Account" />
        <View style={styles.menuGroup}>
          <MenuRow
            icon="notifications-outline"
            label="Notifications"
            description="Alerts and care updates"
            onPress={() => router.push('/(app)/notifications')}
          />
        </View>

        <SectionHeader title="Support" />
        <View style={styles.menuGroup}>
          <MenuRow
            icon="information-circle-outline"
            label="About SmartCare"
            description="Your family's care companion"
            onPress={() =>
              Alert.alert(
                'SmartCare',
                'SmartCare helps parents, teachers, and caretakers stay aligned around a child\'s therapy, medication, and everyday care.',
              )
            }
          />
        </View>

        <Button label="Sign Out" variant="danger" onPress={handleLogout} style={styles.logout} />
        <Text style={styles.version}>SmartCare v{appVersion}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive,
    gap: spacing.lg,
  },
  identity: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  avatar: {
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.md,
  },
  name: { fontFamily: fonts.heading, fontSize: 22, color: colors.green900, textAlign: 'center' },
  email: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  role: { marginTop: spacing.md, textTransform: 'capitalize' },
  secondaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  secondaryStat: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  secondaryDot: { color: colors.textMuted },
  menuGroup: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: alpha.a08,
    overflow: 'hidden',
    marginTop: -spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: alpha.a08,
    minHeight: layout.touchTarget + 16,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.green100,
    backgroundColor: colors.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCopy: { flex: 1, gap: 2 },
  menuLabel: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.text },
  menuDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  logout: { marginTop: spacing.sm },
  version: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
