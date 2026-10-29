import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../../lib/api';
import { childName, formatDate, initials } from '../../../../lib/format';
import { medAdherenceRate, milestonesThisMonth } from '../../../../lib/parent-metrics';
import { Screen } from '../../../../components/ui/Screen';
import { ScreenHeader } from '../../../../components/ui/ScreenHeader';
import { Badge } from '../../../../components/ui/Badge';
import { StatusBadge } from '../../../../components/ui/StatusBadge';
import { SegmentedControl } from '../../../../components/ui/SegmentedControl';
import { Timeline, TimelineItem } from '../../../../components/ui/Timeline';
import { ProgressRing } from '../../../../components/parent/ProgressRing';
import { SkeletonCard } from '../../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../../components/EmptyState';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../../lib/theme';

const PAGE_SIZE = 10;

type ChildDetail = {
  id: number;
  first_name?: string;
  last_name?: string;
  diagnosis?: string;
  age_band?: number;
  sex?: string;
  condition_notes?: string;
  birth_date?: string;
};

type ProgressRecord = {
  id: number;
  title: string;
  summary?: string;
  milestone?: string;
  recorded_on?: string;
};

type MedLog = {
  id: number;
  status: string;
  medication_name?: string;
  dosage?: string;
  administered_at?: string;
  logged_at?: string;
  notes?: string;
  caretaker?: { name?: string };
};

type TherapySession = {
  id: number;
  scheduled_at: string;
  status?: string;
  duration_minutes?: number;
  title?: string;
  observations?: string;
  outcomes?: string;
  notes?: string;
  intervention_notes?: string;
  participation?: string;
  teacher?: { name?: string };
  therapy_plan?: { title?: string };
  therapyPlan?: { title?: string };
};

type MedSchedule = {
  id: number;
  medicine_name?: string;
  medication_name?: string;
  name?: string;
  dosage?: string;
  instructions?: string;
  frequency?: string;
  time_of_day?: string;
  times_of_day?: string[];
  scheduled_time?: string;
  days_of_week?: number[];
  is_active?: boolean;
};

type Tab = 'progress' | 'meds' | 'schedule';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function capitalize(value?: string) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function medTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'given') return 'success';
  if (status === 'missed' || status === 'refused') return 'danger';
  if (status === 'partial' || status === 'skipped') return 'warning';
  return 'neutral';
}

function medIcon(status: string): keyof typeof Ionicons.glyphMap {
  if (status === 'given') return 'checkmark-circle';
  if (status === 'missed' || status === 'refused') return 'close-circle';
  return 'alert-circle';
}

function sessionTone(status?: string): 'success' | 'warning' | 'danger' | 'accent' | 'neutral' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'scheduled') return 'accent';
  return 'neutral';
}

function formatClock(value?: string) {
  if (!value) return '';
  const d = value.includes('T') ? new Date(value) : (() => {
    const hm = value.match(/(\d{1,2}):(\d{2})/);
    if (!hm) return null;
    const next = new Date();
    next.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return next;
  })();
  if (!d || Number.isNaN(d.getTime())) return String(value).slice(0, 5);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatLogWhen(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const date = formatDate(value, 'medium');
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return date ? `${date} · ${time}` : time;
}

function daysLabel(days?: number[]) {
  if (!days || days.length === 0 || days.length === 7) return 'Every day';
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d] || String(d))
    .join(', ');
}

function scheduleTimes(item: MedSchedule) {
  const times = (item.times_of_day || [])
    .map((t) => formatClock(t))
    .filter(Boolean);
  if (times.length) return times.join(', ');
  return formatClock(item.scheduled_time || item.time_of_day) || '—';
}

function paginate<T>(items: T[], page: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * PAGE_SIZE;
  return {
    page: safePage,
    totalPages,
    slice: items.slice(start, start + PAGE_SIZE),
    start: items.length === 0 ? 0 : start + 1,
    end: Math.min(start + PAGE_SIZE, items.length),
    total: items.length,
  };
}

export default function ChildProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const childId = Number(id);
  const [tab, setTab] = useState<Tab>('progress');
  const [progressPage, setProgressPage] = useState(0);
  const [medsPage, setMedsPage] = useState(0);

  const { data: child, isLoading: loadingChild } = useQuery({
    queryKey: ['child', childId],
    queryFn: () => api<ChildDetail>(`/children/${childId}`),
    enabled: Number.isFinite(childId),
  });

  const { data: progress, isLoading: loadingProgress } = useQuery({
    queryKey: ['child-progress', childId],
    queryFn: () => api<ProgressRecord[]>(`/children/${childId}/progress`),
    enabled: Number.isFinite(childId),
  });

  const { data: medLogs, isLoading: loadingMeds } = useQuery({
    queryKey: ['child-med-logs', childId],
    queryFn: () => api<MedLog[]>(`/children/${childId}/medication-logs`),
    enabled: Number.isFinite(childId),
  });

  const { data: therapySessions, isLoading: loadingTherapy } = useQuery({
    queryKey: ['child-therapy', childId],
    queryFn: () => api<TherapySession[]>(`/therapy-sessions?child_id=${childId}`),
    enabled: Number.isFinite(childId),
  });

  const { data: medSchedules, isLoading: loadingSchedules } = useQuery({
    queryKey: ['child-med-schedules', childId],
    queryFn: () => api<MedSchedule[]>(`/medication-schedules?child_id=${childId}`),
    enabled: Number.isFinite(childId),
  });

  useEffect(() => {
    setProgressPage(0);
    setMedsPage(0);
  }, [tab, childId]);

  const records = useMemo(() => (Array.isArray(progress) ? progress : []), [progress]);
  const logs = useMemo(() => (Array.isArray(medLogs) ? medLogs : []), [medLogs]);
  const sessions = useMemo(
    () =>
      (Array.isArray(therapySessions) ? therapySessions : [])
        .slice()
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    [therapySessions]
  );
  const schedules = useMemo(
    () =>
      (Array.isArray(medSchedules) ? medSchedules : []).filter(
        (s) => s.is_active !== false
      ),
    [medSchedules]
  );

  const progressPaging = paginate(records, progressPage);
  const medsPaging = paginate(logs, medsPage);

  if (!Number.isFinite(childId)) {
    return (
      <Screen style={styles.screen}>
        <ScreenHeader title="Child" />
        <EmptyState title="Invalid profile" message="This child profile could not be found." icon="alert-circle-outline" />
      </Screen>
    );
  }

  if (loadingChild || loadingProgress || loadingMeds || loadingTherapy || loadingSchedules) {
    return (
      <Screen style={styles.screen}>
        <ScreenHeader title="Child profile" />
        <ScrollView contentContainerStyle={styles.scroll}>
          <SkeletonCard height={160} />
          <SkeletonCard height={48} />
          <SkeletonCard height={100} lines={2} />
        </ScrollView>
      </Screen>
    );
  }

  const name = childName(child);
  const medRate = medAdherenceRate(logs);
  const monthMilestones = milestonesThisMonth(records);

  return (
    <Screen style={styles.screen}>
      <ScreenHeader title={child?.first_name || 'Child profile'} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Image
            source={require('../../../../assets/profilebannerbg.png')}
            style={styles.bannerBg}
            resizeMode="cover"
          />
          <View style={styles.bannerContent}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </View>
            <Text style={styles.name}>{name}</Text>
            <View style={styles.identityMeta}>
              {child?.age_band != null ? <Text style={styles.metaText}>Age {child.age_band}</Text> : null}
              {child?.sex ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaText}>{capitalize(child.sex)}</Text>
                </>
              ) : null}
            </View>
            {child?.diagnosis ? (
              <View style={styles.diagnosisWrap}>
                <Ionicons name="heart" size={13} color={colors.primary} />
                <Text style={styles.diagnosisText}>{child.diagnosis}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.snapshot}>
          <Text style={styles.snapshotTitle}>Care snapshot</Text>
          <View style={styles.snapshotRow}>
            {logs.length > 0 ? (
              <>
                <View style={styles.snapshotCell}>
                  <ProgressRing
                    value={medRate}
                    max={100}
                    label="Medication adherence"
                    size={58}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.snapshotDivider} />
              </>
            ) : null}
            <View style={styles.snapshotCell}>
              <SnapshotStat icon="ribbon-outline" value={records.length} label="Milestones" />
            </View>
            <View style={styles.snapshotDivider} />
            <View style={styles.snapshotCell}>
              <SnapshotStat icon="calendar-outline" value={monthMilestones} label="This month" />
            </View>
          </View>
        </View>

        <View style={styles.facts}>
          {child?.birth_date ? (
            <FactRow icon="gift-outline" label="Birth date" value={formatDate(child.birth_date, 'medium')} />
          ) : null}
          {child?.age_band != null ? (
            <FactRow icon="people-outline" label="Age band" value={`${child.age_band} years`} />
          ) : null}
          {child?.sex ? <FactRow icon="person-outline" label="Sex" value={capitalize(child.sex)} /> : null}
        </View>

        {child?.condition_notes ? (
          <View style={styles.notesBox}>
            <Image
              source={require('../../../../assets/profilebannerbg.png')}
              style={styles.notesBg}
              resizeMode="cover"
            />
            <View style={styles.notesContent}>
              <View style={styles.notesHeader}>
                <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                <Text style={styles.notesLabel}>Care notes</Text>
              </View>
              <Text style={styles.notesText}>{child.condition_notes}</Text>
            </View>
          </View>
        ) : null}

        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { key: 'progress', label: 'Progress', count: records.length, icon: 'trending-up-outline' },
            { key: 'meds', label: 'Medication', count: logs.length, icon: 'medkit-outline' },
            { key: 'schedule', label: 'Schedule', count: sessions.length + schedules.length, icon: 'calendar-outline' },
          ]}
        />

        {tab === 'progress' ? (
          records.length === 0 ? (
            <EmptyState
              title="No milestones yet"
              message="Progress updates from the care team will appear here."
              icon="ribbon-outline"
            />
          ) : (
            <View style={styles.tabBody}>
              <Timeline>
                {progressPaging.slice.map((item, index) => (
                  <TimelineItem
                    key={item.id}
                    title={item.title}
                    body={item.summary}
                    meta={formatDate(item.recorded_on, 'medium')}
                    isFirst={index === 0}
                    isLast={index === progressPaging.slice.length - 1}
                    badge={item.milestone ? <Badge label={item.milestone} tone="neutral" /> : undefined}
                  />
                ))}
              </Timeline>
              <Pager
                label={`Showing ${progressPaging.start}–${progressPaging.end} of ${progressPaging.total}`}
                page={progressPaging.page}
                totalPages={progressPaging.totalPages}
                onPrev={() => setProgressPage((p) => Math.max(0, p - 1))}
                onNext={() => setProgressPage((p) => p + 1)}
              />
            </View>
          )
        ) : null}

        {tab === 'meds' ? (
          logs.length === 0 ? (
            <EmptyState
              title="No medication logs"
              message="There are currently no medication records for this child."
              icon="medkit-outline"
            />
          ) : (
            <View style={styles.tabBody}>
              <View style={styles.medList}>
                {medsPaging.slice.map((log) => (
                  <View key={log.id} style={styles.medCard}>
                    <View style={styles.medTop}>
                      <Text style={styles.medTitle}>{log.medication_name || 'Medication'}</Text>
                      <StatusBadge
                        label={capitalize(log.status)}
                        tone={medTone(log.status)}
                        icon={medIcon(log.status)}
                      />
                    </View>
                    {log.dosage ? <Text style={styles.medDose}>{log.dosage}</Text> : null}
                    <Text style={styles.medMeta}>
                      {formatLogWhen(log.logged_at || log.administered_at) || 'Logged'}
                      {log.caretaker?.name ? ` · ${log.caretaker.name}` : ''}
                    </Text>
                    {log.notes ? <Text style={styles.medNotes}>{log.notes}</Text> : null}
                  </View>
                ))}
              </View>
              <Pager
                label={`Showing ${medsPaging.start}–${medsPaging.end} of ${medsPaging.total}`}
                page={medsPaging.page}
                totalPages={medsPaging.totalPages}
                onPrev={() => setMedsPage((p) => Math.max(0, p - 1))}
                onNext={() => setMedsPage((p) => p + 1)}
              />
            </View>
          )
        ) : null}

        {tab === 'schedule' ? (
          sessions.length === 0 && schedules.length === 0 ? (
            <EmptyState
              title="No schedule yet"
              message="Therapy sessions and medication schedules will appear here."
              icon="calendar-outline"
            />
          ) : (
            <View style={styles.tabBody}>
              {schedules.length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Medication schedule</Text>
                  {schedules.map((item) => {
                    const med = item.medication_name || item.medicine_name || item.name || 'Medication';
                    return (
                      <View key={item.id} style={styles.detailCard}>
                        <View style={styles.medTop}>
                          <Text style={styles.medTitle}>{med}</Text>
                          <StatusBadge label="Active" tone="success" />
                        </View>
                        {item.dosage ? <DetailRow label="Dosage" value={item.dosage} /> : null}
                        <DetailRow label="Times" value={scheduleTimes(item)} />
                        <DetailRow label="Days" value={daysLabel(item.days_of_week)} />
                        {item.instructions || item.frequency ? (
                          <DetailRow label="Instructions" value={item.instructions || item.frequency || ''} />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {sessions.length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Therapy sessions</Text>
                  {sessions.map((session) => {
                    const plan = session.therapy_plan?.title || session.therapyPlan?.title;
                    const note =
                      session.observations ||
                      session.outcomes ||
                      session.notes ||
                      session.intervention_notes;
                    return (
                      <View key={session.id} style={styles.detailCard}>
                        <View style={styles.medTop}>
                          <Text style={styles.medTitle}>
                            {formatDate(session.scheduled_at, 'medium') || 'Therapy'}
                          </Text>
                          <StatusBadge
                            label={capitalize(session.status || 'scheduled')}
                            tone={sessionTone(session.status)}
                          />
                        </View>
                        <DetailRow label="Time" value={formatClock(session.scheduled_at) || '—'} />
                        {session.duration_minutes ? (
                          <DetailRow label="Duration" value={`${session.duration_minutes} min`} />
                        ) : null}
                        {session.teacher?.name ? (
                          <DetailRow label="Teacher" value={session.teacher.name} />
                        ) : null}
                        {plan ? <DetailRow label="Plan" value={plan} /> : null}
                        {session.participation ? (
                          <DetailRow label="Participation" value={capitalize(session.participation)} />
                        ) : null}
                        {note ? <Text style={styles.medNotes}>{note}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Pager({
  label,
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  label: string;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <View style={styles.pager}>
      <Text style={styles.pagerLabel}>{label}</Text>
      <View style={styles.pagerActions}>
        <TouchableOpacity
          style={[styles.pagerBtn, page === 0 && styles.pagerBtnDisabled]}
          disabled={page === 0}
          onPress={onPrev}
        >
          <Ionicons name="chevron-back" size={16} color={page === 0 ? colors.textMuted : colors.primary} />
          <Text style={[styles.pagerBtnText, page === 0 && styles.pagerBtnTextDisabled]}>Prev</Text>
        </TouchableOpacity>
        <Text style={styles.pagerPage}>
          {page + 1} / {totalPages}
        </Text>
        <TouchableOpacity
          style={[styles.pagerBtn, page >= totalPages - 1 && styles.pagerBtnDisabled]}
          disabled={page >= totalPages - 1}
          onPress={onNext}
        >
          <Text
            style={[styles.pagerBtnText, page >= totalPages - 1 && styles.pagerBtnTextDisabled]}
          >
            Next
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={page >= totalPages - 1 ? colors.textMuted : colors.primary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function SnapshotStat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.snapshotStat}>
      <View style={styles.snapshotIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={styles.snapshotValue}>{value}</Text>
      <Text style={styles.snapshotLabel}>{label}</Text>
    </View>
  );
}

function FactRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.factRow}>
      <View style={styles.factIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={styles.factCopy}>
        <Text style={styles.factLabel}>{label}</Text>
        <Text style={styles.factValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.tint200 },
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive,
    gap: spacing.md,
  },
  banner: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.tint300,
    borderWidth: 1,
    borderColor: alpha.a10,
  },
  bannerBg: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  bannerContent: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: alpha.a10,
    ...shadows.sm,
  },
  avatarText: { fontFamily: fonts.heading, fontSize: 24, color: colors.primary },
  name: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  identityMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  metaDot: { color: colors.textMuted },
  diagnosisWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    maxWidth: '100%',
    ...shadows.sm,
  },
  diagnosisText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
    flexShrink: 1,
    textAlign: 'center',
  },
  snapshot: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.sm,
    ...shadows.sm,
  },
  snapshotTitle: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.primary },
  snapshotRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  snapshotCell: { flex: 1, alignItems: 'center' },
  snapshotDivider: {
    width: 1,
    height: 72,
    backgroundColor: colors.borderLight,
    marginTop: 8,
  },
  snapshotStat: { alignItems: 'center', gap: 2 },
  snapshotIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  snapshotValue: { fontFamily: fonts.heading, fontSize: 20, color: colors.primary },
  snapshotLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  facts: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.sm,
    ...shadows.sm,
  },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 2 },
  factIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  factCopy: { flex: 1, gap: 1 },
  factLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  factValue: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  notesBox: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha.a10,
    backgroundColor: colors.tint300,
  },
  notesBg: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  notesContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 6,
  },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  notesLabel: { fontFamily: fonts.headingSemi, fontSize: 13, color: colors.primary },
  notesText: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  tabBody: { gap: spacing.md },
  medList: { gap: spacing.md },
  medCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: 6,
    ...shadows.sm,
  },
  medTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  medTitle: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.text, flex: 1 },
  medDose: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  medMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  medNotes: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  block: { gap: spacing.sm },
  blockTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: 8,
    ...shadows.sm,
  },
  detailRow: { gap: 2 },
  detailLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailValue: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  pager: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.sm,
  },
  pagerLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  pagerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  pagerBtnDisabled: { backgroundColor: colors.surfaceMuted },
  pagerBtnText: { fontFamily: fonts.headingSemi, fontSize: 13, color: colors.primary },
  pagerBtnTextDisabled: { color: colors.textMuted },
  pagerPage: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
});
