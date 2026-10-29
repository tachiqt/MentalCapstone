import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../lib/api';
import { childName, formatDate, initials } from '../../../lib/format';
import {
  milestonesByChild,
  milestonesByWeek,
  milestonesThisMonth,
  medAdherenceRate,
  recordChildId,
  timeGreeting,
} from '../../../lib/parent-metrics';
import { Screen } from '../../../components/ui/Screen';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { ParentChildCard } from '../../../components/ParentChildCard';
import { ProgressRing } from '../../../components/parent/ProgressRing';
import { MiniBarChart } from '../../../components/parent/MiniBarChart';
import { Sparkline } from '../../../components/parent/Sparkline';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { AvatarChip } from '../../../components/parent/AvatarChip';
import { Button } from '../../../components/ui/Button';
import { BlurredModalBackdrop } from '../../../components/ui/BlurredModalBackdrop';
import { SafeModalSheet } from '../../../components/ui/SafeModalSheet';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type Child = {
  id: number;
  first_name?: string;
  last_name?: string;
  diagnosis?: string;
  age_band?: number;
};

type ProgressRecord = {
  id: number;
  child_id?: number;
  title: string;
  summary?: string;
  milestone?: string;
  recorded_on?: string;
  child?: Child;
};

type FeedbackItem = {
  id: number;
  message: string;
  subject?: string;
  status?: string;
  staff_response?: string | null;
  created_at?: string;
  child?: Child;
};

type TherapySession = { id: number; scheduled_at: string; status?: string; child_id?: number };
type MedLog = { status: string };

function latestRecord(records: ProgressRecord[]): ProgressRecord | undefined {
  return [...records].sort((a, b) => {
    const da = new Date(a.recorded_on || '').getTime();
    const db = new Date(b.recorded_on || '').getTime();
    return db - da;
  })[0];
}

function isToday(value?: string | null): boolean {
  if (!value) return false;
  const raw = value.includes('T') ? value : `${value}T12:00:00`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export default function ProgressScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [feedbackChildId, setFeedbackChildId] = useState<number | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);

  const { data: children, isLoading: l1, isError: e1, refetch: r1 } = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[]>('/children'),
  });
  const { data: progress, isLoading: l2 } = useQuery({
    queryKey: ['progress'],
    queryFn: () => api<ProgressRecord[]>('/progress'),
  });
  const { data: sessions, isLoading: l3 } = useQuery({
    queryKey: ['therapy-sessions'],
    queryFn: () => api<TherapySession[]>('/therapy-sessions'),
  });
  const { data: feedback, isLoading: l4 } = useQuery({
    queryKey: ['parent-feedback'],
    queryFn: () => api<FeedbackItem[]>('/parent-feedback'),
  });
  const { data: medLogs, isLoading: l5 } = useQuery({
    queryKey: ['medication-logs'],
    queryFn: () => api<MedLog[]>('/medication-logs'),
  });

  const submitMutation = useMutation({
    mutationFn: (body: { message: string; child_id: number }) =>
      api('/parent-feedback', { method: 'POST', body }),
    onSuccess: () => {
      setMessage('');
      setComposeOpen(false);
      queryClient.invalidateQueries({ queryKey: ['parent-feedback'] });
    },
  });

  const loading = l1 || l2 || l3 || l4 || l5;
  const childList = Array.isArray(children) ? children : [];
  const records = Array.isArray(progress) ? progress : [];
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const feedbackList = Array.isArray(feedback) ? feedback : [];
  const medLogList = Array.isArray(medLogs) ? medLogs : [];

  const childIds = new Set(childList.map((c) => c.id));
  const myRecords = records.filter((r) => {
    const id = recordChildId(r);
    return id ? childIds.has(id) : false;
  });
  const mySessions = sessionList.filter((s) => s.child_id && childIds.has(s.child_id));
  const myFeedback = feedbackList.filter(
    (f) => f.child?.id && childIds.has(f.child.id) && isToday(f.created_at)
  );

  const upcoming = mySessions.filter((s) => {
    const d = new Date(s.scheduled_at);
    return !Number.isNaN(d.getTime()) && d >= new Date() && s.status !== 'cancelled';
  }).length;

  const grouped = childList.map((child) => ({
    child,
    records: myRecords.filter((r) => recordChildId(r) === child.id),
  }));

  const selectedChildId = feedbackChildId ?? childList[0]?.id ?? null;
  const monthCount = milestonesThisMonth(myRecords);
  const medRate = medAdherenceRate(medLogList);
  const barData = milestonesByChild(myRecords, childList);
  const sparkData = milestonesByWeek(myRecords);
  const hasMedLogs = medLogList.length > 0;

  if (loading) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <SkeletonCard height={72} />
          <SkeletonCard height={100} />
          <SkeletonCard height={120} lines={2} />
          <SkeletonCard height={88} />
        </ScrollView>
      </Screen>
    );
  }

  if (e1) {
    return (
      <Screen>
        <EmptyState
          title="Couldn't load your children"
          message="Check your connection and try again."
          icon="cloud-offline-outline"
        />
        <TouchableOpacity style={styles.retry} onPress={() => r1()}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </Screen>
    );
  }

  if (!childList.length) {
    return (
      <Screen>
        <EmptyState
          title="No children linked yet"
          message="When your care team links a child to your account, they will appear here."
          icon="people-outline"
        />
      </Screen>
    );
  }

  const subtitle =
    monthCount > 0
      ? `Here's how your children are progressing — ${monthCount} milestone${monthCount === 1 ? '' : 's'} this month.`
      : "Here's how your children are progressing.";

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={require('../../../assets/bannerbg.png')}
          style={styles.banner}
          imageStyle={styles.bannerImage}
          resizeMode="contain"
        >
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>{timeGreeting()}!</Text>
            <Text style={styles.bannerSub}>{subtitle}</Text>
          </View>
        </ImageBackground>

        <View style={styles.overview}>
          <Text style={styles.overviewTitle}>Care overview</Text>
          <View style={styles.overviewRow}>
            {hasMedLogs ? (
              <ProgressRing
                value={medRate}
                max={100}
                label="Medication"
                sublabel="adherence"
                size={68}
                color={colors.primary}
              />
            ) : null}
            <MetricIcon
              icon="ribbon-outline"
              value={monthCount}
              label="Milestones"
              sublabel="this month"
            />
            <MetricIcon
              icon="calendar-outline"
              value={upcoming}
              label="Therapy"
              sublabel="upcoming"
            />
          </View>
        </View>

        {barData.some((b) => b.value > 0) ? (
          <MiniBarChart title="Milestones by child" subtitle="Total recorded progress" data={barData} />
        ) : null}

        <Sparkline title="6-week progress trend" subtitle="Milestones recorded per week" data={sparkData} />

        <SectionHeader title="Your children" subtitle="Latest updates — tap for full history" />

        {grouped.map(({ child, records: childRecords }) => {
          const name = childName(child);
          const latest = latestRecord(childRecords);
          return (
            <ParentChildCard
              key={child.id}
              name={name}
              diagnosis={child.diagnosis}
              ageBand={child.age_band}
              latestTitle={latest?.title}
              latestDate={latest ? formatDate(latest.recorded_on, 'medium') : undefined}
              latestMilestone={latest?.milestone}
              milestoneCount={childRecords.length}
              onPress={() => router.push(`/(app)/(parent)/child/${child.id}`)}
            />
          );
        })}

        <View style={styles.updatesCard}>
          <View style={styles.updatesHeader}>
            <View style={styles.updatesHeaderIcon}>
              <Ionicons name="chatbubbles" size={18} color={colors.primary} />
            </View>
            <View style={styles.updatesHeaderCopy}>
              <Text style={styles.updatesTitle}>Parent feedback</Text>
              <Text style={styles.updatesSubtitle}>After visits · shared with the care team</Text>
            </View>
            {myFeedback.length > 0 ? (
              <View style={styles.updatesCount}>
                <Text style={styles.updatesCountText}>{myFeedback.length}</Text>
              </View>
            ) : null}
          </View>

          {myFeedback.length > 0 ? (
            <View style={styles.updatesList}>
              {myFeedback.map((item) => {
                const name = childName(item.child);
                return (
                  <View key={item.id} style={styles.feedbackCard}>
                    <View style={styles.feedbackBody}>
                      <View style={styles.feedbackHeader}>
                        <Text style={styles.feedbackSubject} numberOfLines={1}>
                          {item.subject || 'Parent feedback'}
                        </Text>
                        <Text style={styles.feedbackDate}>
                          {formatDate(item.created_at, 'relative') ||
                            formatDate(item.created_at, 'short')}
                        </Text>
                      </View>
                      <Text style={styles.feedbackMessage} numberOfLines={3}>
                        {item.message}
                      </Text>
                      {item.staff_response ? (
                        <Text style={styles.feedbackMessage} numberOfLines={2}>
                          Staff: {item.staff_response}
                        </Text>
                      ) : null}
                      {name ? (
                        <View style={styles.feedbackFooter}>
                          <View style={styles.feedbackAvatar}>
                            <Text style={styles.feedbackAvatarText}>{initials(name)}</Text>
                          </View>
                          <Text style={styles.feedbackChild}>{name}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyUpdates}>
              <View style={styles.emptyUpdatesIcon}>
                <Ionicons name="leaf-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.emptyUpdatesTitle}>No feedback yet today</Text>
              <Text style={styles.emptyUpdatesText}>
                Share observations, concerns, or suggestions after visiting your child at the facility.
              </Text>
            </View>
          )}

          <Button
            label="Send feedback"
            icon="send-outline"
            onPress={() => setComposeOpen(true)}
            style={styles.sendBtn}
          />
        </View>
      </ScrollView>

      <Modal
        visible={composeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setComposeOpen(false)}
      >
        <View style={styles.modalShell}>
          <BlurredModalBackdrop onPress={() => setComposeOpen(false)} />
          <KeyboardAvoidingView
            style={styles.modalRoot}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
          >
          <SafeModalSheet style={styles.modalSheetOverride}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={styles.modalTitle}>Send parent feedback</Text>
                <Text style={styles.modalSubtitle}>
                  Tell the facility team about your child’s progress, care, or visit experience
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setComposeOpen(false)}
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {childList.length > 1 ? (
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>About</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {childList.map((child) => (
                    <AvatarChip
                      key={child.id}
                      label={child.first_name || childName(child)}
                      active={selectedChildId === child.id}
                      onPress={() => setFeedbackChildId(child.id)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : childList[0] ? (
              <View style={styles.modalChildPill}>
                <View style={styles.modalChildAvatar}>
                  <Text style={styles.modalChildAvatarText}>
                    {initials(childName(childList[0]))}
                  </Text>
                </View>
                <Text style={styles.modalChildName}>{childName(childList[0])}</Text>
              </View>
            ) : null}

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Feedback</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={`Share feedback about ${
                  childList.find((c) => c.id === selectedChildId)?.first_name || 'your child'
                }'s progress or care at the facility…`}
                placeholderTextColor={colors.textMuted}
                value={message}
                onChangeText={setMessage}
                multiline
                autoFocus
              />
            </View>

            <Button
              label={submitMutation.isPending ? 'Sending…' : 'Send feedback'}
              icon="send-outline"
              loading={submitMutation.isPending}
              disabled={!message.trim() || !selectedChildId}
              onPress={() => {
                if (!message.trim() || !selectedChildId) return;
                submitMutation.mutate({ message: message.trim(), child_id: selectedChildId });
              }}
            />
          </SafeModalSheet>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Screen>
  );
}

function MetricIcon({
  icon,
  value,
  label,
  sublabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  sublabel: string;
}) {
  return (
    <View style={styles.metricIcon}>
      <View style={styles.metricIconWrap}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricSub}>{sublabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.tint200 },
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive,
    gap: layout.sectionGap,
  },
  banner: {
    width: '100%',
    aspectRatio: 3,
    borderRadius: radii.xl,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: '#EEF6F1',
    borderWidth: 1,
    borderColor: alpha.a08,
  },
  bannerImage: {
    borderRadius: radii.xl,
    resizeMode: 'contain',
  },
  bannerCopy: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: '58%',
    gap: 4,
  },
  bannerTitle: {
    fontFamily: fonts.heading,
    fontSize: 24,
    lineHeight: 30,
    color: colors.green900,
    letterSpacing: -0.5,
  },
  bannerSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  overview: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.lg,
    ...shadows.sm,
  },
  overviewTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 17,
    letterSpacing: -0.2,
    color: colors.green900,
  },
  overviewRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around' },
  metricIcon: { alignItems: 'center', flex: 1, gap: 2 },
  metricIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: alpha.a10,
    backgroundColor: colors.green50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  metricValue: {
    fontFamily: fonts.heading,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.8,
    color: colors.green900,
  },
  metricLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.textSecondary },
  metricSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  updatesCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: alpha.a10,
    gap: spacing.lg,
    ...shadows.md,
  },
  updatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  updatesHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.green100,
    backgroundColor: colors.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updatesHeaderCopy: { flex: 1, gap: 2 },
  updatesTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.green900,
    letterSpacing: -0.3,
  },
  updatesSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  updatesCount: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updatesCountText: {
    fontFamily: fonts.headingSemi,
    fontSize: 12,
    color: colors.white,
  },
  // Updates read as rows divided by a hairline rather than cards inside a card.
  updatesList: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  feedbackCard: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  feedbackBody: {
    flex: 1,
    paddingVertical: spacing.lg,
    gap: 6,
  },
  feedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  feedbackSubject: {
    fontFamily: fonts.headingSemi,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  feedbackDate: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  feedbackMessage: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  feedbackFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  feedbackAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackAvatarText: {
    fontFamily: fonts.headingSemi,
    fontSize: 8,
    color: colors.primary,
  },
  feedbackChild: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary },
  emptyUpdates: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  emptyUpdatesIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.green100,
    backgroundColor: colors.green50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyUpdatesTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 15,
    color: colors.primary,
  },
  emptyUpdatesText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },
  sendBtn: { marginTop: spacing.xs },
  modalShell: { flex: 1, backgroundColor: 'rgba(8, 36, 34, 0.55)' },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  modalSheetOverride: {
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingTop: spacing.sm,
    gap: spacing.lg,
    borderTopWidth: 1,
    borderColor: alpha.a08,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15, 76, 74, 0.2)',
    marginBottom: spacing.xs,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  modalHeaderCopy: { flex: 1, gap: 4 },
  modalTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.primary,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalField: { gap: spacing.sm },
  modalLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.primary,
  },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  modalChildPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  modalChildAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalChildAvatarText: {
    fontFamily: fonts.headingSemi,
    fontSize: 11,
    color: colors.primary,
  },
  modalChildName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.primary,
  },
  modalInput: {
    backgroundColor: colors.tint100,
    borderWidth: 1.5,
    borderColor: alpha.a18,
    borderRadius: radii.lg,
    padding: spacing.lg,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  retry: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
  },
  retryText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.primary },
});
