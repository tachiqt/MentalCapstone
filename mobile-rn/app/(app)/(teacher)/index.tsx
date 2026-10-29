import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { childName } from '../../../lib/format';
import { greetingName, timeGreeting } from '../../../lib/parent-metrics';
import { Screen } from '../../../components/ui/Screen';
import { Badge } from '../../../components/ui/Badge';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { ChildAvatar } from '../../../components/ui/ChildAvatar';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type Child = {
  id: number;
  first_name?: string;
  last_name?: string;
  diagnosis?: string;
};

type Recommendation = { id: number };

export default function TeacherHome() {
  const { user } = useAuth();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[] | { data: Child[] }>('/children'),
  });
  const { data: recs } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => api<Recommendation[] | { data: Recommendation[] }>('/recommendations?status=pending_review'),
  });

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.pad}>
          <SkeletonCard height={72} />
          <SkeletonCard height={88} />
          <SkeletonCard height={88} />
        </View>
      </Screen>
    );
  }

  const raw = (data as { data?: Child[] })?.data || data || [];
  const children = (Array.isArray(raw) ? raw : []) as Child[];
  const rawRecs = (recs as { data?: Recommendation[] })?.data || recs || [];
  const pendingCount = (Array.isArray(rawRecs) ? rawRecs : []).length;

  return (
    <Screen>
      <FlatList
        data={children}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.greetBlock}>
              <Text style={styles.greeting}>
                {timeGreeting()}, {greetingName(user?.name)}
              </Text>
              <Text style={styles.subtitle}>Focus on the children who need you today.</Text>
            </View>

            <TouchableOpacity
              style={styles.quickLink}
              onPress={() => router.push('/(app)/(teacher)/assessments')}
              activeOpacity={0.85}
            >
              <View style={styles.quickLinkIcon}>
                <Ionicons name="clipboard-outline" size={18} color={colors.green900} />
              </View>
              <View style={styles.quickLinkCopy}>
                <Text style={styles.quickLinkTitle}>Submitted assessments</Text>
                <Text style={styles.quickLinkBody}>View responses and generate AI recommendations</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {pendingCount > 0 ? (
              <TouchableOpacity
                style={styles.attention}
                onPress={() => router.push('/(app)/(teacher)/ai-review')}
                activeOpacity={0.85}
              >
                <View style={styles.attentionIcon}>
                  <Ionicons name="sparkles-outline" size={18} color={colors.accent} />
                </View>
                <View style={styles.attentionCopy}>
                  <Text style={styles.attentionTitle}>Needs attention</Text>
                  <Text style={styles.attentionBody}>
                    {pendingCount} AI recommendation{pendingCount === 1 ? '' : 's'} waiting for review
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}

            <SectionHeader
              title="Assigned children"
              subtitle={`${children.length} active profile${children.length === 1 ? '' : 's'}`}
            />
          </View>
        }
        renderItem={({ item }) => {
          const name = childName(item);
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/(app)/(teacher)/child/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${name}`}
            >
              <ChildAvatar name={name} size={44} />
              <View style={styles.meta}>
                <Text style={styles.name}>{name}</Text>
                {item.diagnosis ? <Badge label={item.diagnosis} tone="accent" /> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No children assigned"
            message="Children assigned to you will appear here."
            icon="people-outline"
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: layout.screenPadding, gap: spacing.md },
  list: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive,
    gap: spacing.md,
    flexGrow: 1,
  },
  headerBlock: { gap: spacing.xxl, marginBottom: spacing.md },
  greetBlock: { gap: spacing.xs },
  greeting: {
    fontFamily: fonts.heading,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.7,
    color: colors.green900,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  quickLinkIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: alpha.a10,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLinkCopy: { flex: 1, gap: 3 },
  quickLinkTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 15,
    letterSpacing: -0.15,
    color: colors.green900,
  },
  quickLinkBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  attention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: alpha.a12,
  },
  attentionIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: alpha.a10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionCopy: { flex: 1, gap: 3 },
  attentionTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 15,
    letterSpacing: -0.15,
    color: colors.green900,
  },
  attentionBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  meta: { flex: 1, gap: 7 },
  name: {
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    letterSpacing: -0.15,
    color: colors.green900,
  },
});
