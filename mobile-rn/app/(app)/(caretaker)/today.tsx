import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../lib/api';
import { childName } from '../../../lib/format';
import { Screen } from '../../../components/ui/Screen';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ChildAvatar } from '../../../components/ui/ChildAvatar';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { BlurredModalBackdrop } from '../../../components/ui/BlurredModalBackdrop';
import { SafeModalSheet } from '../../../components/ui/SafeModalSheet';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type Dose = {
  id: number;
  dose_key?: string;
  medication_name?: string;
  name?: string;
  dosage?: string;
  child_name?: string;
  child?: { first_name?: string; last_name?: string };
  scheduled_time?: string;
  time?: string;
  time_of_day?: string;
  times_of_day?: string[];
  status?: string;
  logged_today?: boolean;
  notes?: string;
};

type LogDraft = {
  dose: Dose;
  status: 'given' | 'skipped';
};

function doseWhen(dose: Dose) {
  return (
    dose.scheduled_time ||
    dose.time ||
    dose.time_of_day ||
    (Array.isArray(dose.times_of_day) ? dose.times_of_day[0] : undefined)
  );
}

function parseTime(value?: string): Date | null {
  if (!value) return null;
  if (value.includes('T')) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const ampm = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2]);
    const mer = ampm[3].toUpperCase();
    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }
  const hm = value.match(/(\d{1,2}):(\d{2})/);
  if (hm) {
    const d = new Date();
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return d;
  }
  return null;
}

function formatClock(value?: string) {
  const d = parseTime(value);
  if (!d) return value ? String(value).slice(0, 5) : '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

type Bucket = 'due' | 'upcoming' | 'completed';

function classifyDose(dose: Dose, now: Date): Bucket {
  if (dose.status === 'given' || dose.logged_today) return 'completed';
  if (dose.status === 'missed' || dose.status === 'skipped') return 'completed';
  const t = parseTime(doseWhen(dose));
  if (!t) return 'due';
  if (t.getTime() <= now.getTime()) return 'due';
  return 'upcoming';
}

function doseReached(dose: Dose, now: Date) {
  const t = parseTime(doseWhen(dose));
  if (!t) return true;
  return t.getTime() <= now.getTime();
}

function doseStateLabel(
  dose: Dose,
  bucket: Bucket
): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'accent' | 'neutral';
  icon: keyof typeof Ionicons.glyphMap;
} {
  if (dose.status === 'given' || (dose.logged_today && dose.status !== 'missed' && dose.status !== 'skipped')) {
    return { label: 'Given', tone: 'success', icon: 'checkmark-circle' };
  }
  if (dose.status === 'missed' || dose.status === 'skipped') {
    return { label: dose.status === 'missed' ? 'Missed' : 'Skipped', tone: 'danger', icon: 'close-circle' };
  }
  const t = parseTime(doseWhen(dose));
  if (t && t.getTime() < Date.now() - 15 * 60 * 1000) {
    return { label: 'Late', tone: 'warning', icon: 'time' };
  }
  if (bucket === 'upcoming') return { label: 'Upcoming', tone: 'accent', icon: 'time-outline' };
  return { label: 'Due now', tone: 'warning', icon: 'alert-circle' };
}

export default function TodayScreen() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LogDraft | null>(null);
  const [notes, setNotes] = useState('');
  const [tick, setTick] = useState(() => Date.now());

  const { data, isLoading } = useQuery({
    queryKey: ['today-doses'],
    queryFn: () => api<Dose[] | { data: Dose[] }>('/medication-schedules?today=1'),
    refetchInterval: 30_000,
  });

  const { data: logsData } = useQuery({
    queryKey: ['medication-logs'],
    queryFn: () =>
      api<
        | Array<{
            id: number;
            medication_schedule_id?: number;
            status?: string;
            notes?: string;
            logged_at?: string;
            administered_at?: string;
            created_at?: string;
          }>
        | {
            data: Array<{
              id: number;
              medication_schedule_id?: number;
              status?: string;
              notes?: string;
              logged_at?: string;
              administered_at?: string;
              created_at?: string;
            }>;
          }
      >('/medication-logs'),
  });

  // Re-evaluate due/upcoming boundaries once a minute.
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const logMutation = useMutation({
    mutationFn: (body: { schedule_id: number; status: string; notes?: string }) =>
      api('/medication-logs', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today-doses'] });
      queryClient.invalidateQueries({ queryKey: ['medication-logs'] });
      setDraft(null);
      setNotes('');
    },
  });

  if (isLoading) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.scroll}>
          <SkeletonCard height={72} />
          <SkeletonCard height={120} />
          <SkeletonCard height={120} />
        </ScrollView>
      </Screen>
    );
  }

  const raw = (data as { data?: Dose[] })?.data || data || [];
  const rawLogs = (logsData as { data?: any[] })?.data || logsData || [];
  const todayLogs = (Array.isArray(rawLogs) ? rawLogs : []).filter((log) => {
    const stamp = log.logged_at || log.administered_at || log.created_at;
    if (!stamp) return false;
    const d = new Date(stamp);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  });

  const logsBySchedule = new Map<number, typeof todayLogs>();
  todayLogs
    .slice()
    .sort((a, b) => {
      const at = new Date(a.logged_at || a.administered_at || a.created_at || 0).getTime();
      const bt = new Date(b.logged_at || b.administered_at || b.created_at || 0).getTime();
      return at - bt;
    })
    .forEach((log) => {
      if (log.medication_schedule_id == null) return;
      const list = logsBySchedule.get(log.medication_schedule_id) || [];
      list.push(log);
      logsBySchedule.set(log.medication_schedule_id, list);
    });

  const scheduleCounters = new Map<number, number>();
  const doses = ((Array.isArray(raw) ? raw : []) as Dose[])
    .slice()
    .sort((a, b) => {
      const at = parseTime(doseWhen(a))?.getTime() ?? 0;
      const bt = parseTime(doseWhen(b))?.getTime() ?? 0;
      return at - bt;
    })
    .map((dose) => {
      if (dose.logged_today || dose.status) return dose;
      const idx = scheduleCounters.get(dose.id) || 0;
      scheduleCounters.set(dose.id, idx + 1);
      const log = logsBySchedule.get(dose.id)?.[idx];
      if (!log) return dose;
      return {
        ...dose,
        logged_today: true,
        status: log.status,
        notes: log.notes,
      };
    });
  const now = new Date(tick);
  const due = doses.filter((d) => classifyDose(d, now) === 'due');
  const upcoming = doses.filter((d) => classifyDose(d, now) === 'upcoming');
  const completed = doses.filter((d) => classifyDose(d, now) === 'completed');

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const openLog = (dose: Dose, status: 'given' | 'skipped') => {
    setNotes(dose.notes || '');
    setDraft({ dose, status });
  };

  const submitLog = () => {
    if (!draft) return;
    logMutation.mutate({
      schedule_id: draft.dose.id,
      status: draft.status,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.title}>Today</Text>
          <Text style={styles.subtitle}>{dateLabel}</Text>
        </View>

        {doses.length === 0 ? (
          <EmptyState
            title="No doses scheduled"
            message="There are currently no medications due for today."
            icon="medkit-outline"
          />
        ) : (
          <>
            {due.length > 0 ? (
              <Section>
                <SectionHeader title="Due now" subtitle={`${due.length} dose${due.length === 1 ? '' : 's'}`} />
                {due.map((dose) => (
                  <DoseCard
                    key={dose.dose_key || `${dose.id}-${doseWhen(dose)}`}
                    dose={dose}
                    bucket="due"
                    busy={logMutation.isPending}
                    canAct={doseReached(dose, now)}
                    onGiven={() => openLog(dose, 'given')}
                    onSkipped={() => openLog(dose, 'skipped')}
                  />
                ))}
              </Section>
            ) : null}

            {upcoming.length > 0 ? (
              <Section>
                <SectionHeader title="Upcoming" subtitle={`${upcoming.length} remaining`} />
                {upcoming.map((dose) => (
                  <DoseCard
                    key={dose.dose_key || `${dose.id}-${doseWhen(dose)}`}
                    dose={dose}
                    bucket="upcoming"
                    busy={logMutation.isPending}
                    canAct={false}
                    onGiven={() => openLog(dose, 'given')}
                    onSkipped={() => openLog(dose, 'skipped')}
                  />
                ))}
              </Section>
            ) : null}

            {completed.length > 0 ? (
              <Section>
                <SectionHeader title="Completed" subtitle={`${completed.length} logged`} />
                {completed.map((dose) => (
                  <DoseCard
                    key={dose.dose_key || `${dose.id}-${doseWhen(dose)}`}
                    dose={dose}
                    bucket="completed"
                    busy={false}
                    canAct={false}
                  />
                ))}
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal
        visible={!!draft}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!logMutation.isPending) {
            setDraft(null);
            setNotes('');
          }
        }}
      >
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop
            onPress={() => {
              if (!logMutation.isPending) {
                setDraft(null);
                setNotes('');
              }
            }}
          />
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
          >
          <SafeModalSheet>
            <Text style={styles.modalTitle}>
              {draft?.status === 'skipped' ? 'Mark as skipped' : 'Mark as given'}
            </Text>
            <Text style={styles.modalSubtitle}>
              {draft
                ? `${draft.dose.child_name || childName(draft.dose.child) || 'Child'} · ${
                    draft.dose.medication_name || draft.dose.name || 'Medication'
                  } · ${formatClock(doseWhen(draft.dose))}`
                : ''}
            </Text>
            <Text style={styles.fieldLabel}>Comment / note</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Optional note for parents and the medication log"
              placeholderTextColor={colors.textMuted}
              editable={!logMutation.isPending}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                disabled={logMutation.isPending}
                onPress={() => {
                  setDraft(null);
                  setNotes('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, logMutation.isPending && styles.btnDisabled]}
                disabled={logMutation.isPending}
                onPress={submitLog}
              >
                <Text style={styles.modalConfirmText}>
                  {logMutation.isPending
                    ? 'Saving…'
                    : draft?.status === 'skipped'
                      ? 'Confirm skipped'
                      : 'Confirm given'}
                </Text>
              </TouchableOpacity>
            </View>
          </SafeModalSheet>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Screen>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <View style={styles.section}>{children}</View>;
}

function DoseCard({
  dose,
  bucket,
  busy,
  canAct,
  onGiven,
  onSkipped,
}: {
  dose: Dose;
  bucket: Bucket;
  busy: boolean;
  canAct: boolean;
  onGiven?: () => void;
  onSkipped?: () => void;
}) {
  const name = dose.child_name || childName(dose.child) || 'Child';
  const med = dose.medication_name || dose.name || 'Medication';
  const state = doseStateLabel(dose, bucket);
  const showActions = bucket !== 'completed' && onGiven && onSkipped;
  const when = doseWhen(dose);
  const clock = formatClock(when);
  const disabled = busy || !canAct;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <ChildAvatar name={name} size={44} />
        <View style={styles.cardCopy}>
          <Text style={styles.childName}>{name}</Text>
          <Text style={styles.medName}>{med}</Text>
          {dose.dosage ? <Text style={styles.dose}>{dose.dosage}</Text> : null}
        </View>
        <StatusBadge label={state.label} tone={state.tone} icon={state.icon} />
      </View>

      <View style={styles.timeRow}>
        <Ionicons name="time-outline" size={14} color={colors.green700} />
        <Text style={styles.timeText}>Scheduled {clock}</Text>
      </View>

      {dose.notes ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Note</Text>
          <Text style={styles.noteText}>{dose.notes}</Text>
        </View>
      ) : null}

      {showActions ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btnPrimary, disabled && styles.btnDisabled]}
            disabled={disabled}
            onPress={onGiven}
            accessibilityRole="button"
            accessibilityLabel="Mark as given"
            accessibilityState={{ disabled }}
          >
            <Ionicons name="checkmark-circle" size={18} color={colors.white} />
            <Text style={styles.btnPrimaryText}>Mark as Given</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnSecondary, disabled && styles.btnDisabled]}
            disabled={disabled}
            onPress={onSkipped}
            accessibilityRole="button"
            accessibilityLabel="Mark as skipped"
            accessibilityState={{ disabled }}
          >
            <Text style={styles.btnSecondaryText}>Skipped</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showActions && !canAct ? (
        <Text style={styles.waitHint}>Available at {clock}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive,
    gap: layout.sectionGap,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.7,
    color: colors.green900,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary, marginTop: 4 },
  section: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.lg,
    ...shadows.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  cardCopy: { flex: 1, gap: 3 },
  childName: {
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    letterSpacing: -0.15,
    color: colors.green900,
  },
  medName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
  dose: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.tint200,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },
  timeText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.green700 },
  noteBox: {
    backgroundColor: colors.tint100,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 4,
  },
  noteLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  noteText: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.md },
  waitHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -spacing.sm,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    minHeight: 50,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  btnPrimaryText: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.white },
  btnSecondary: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: alpha.a22,
  },
  btnSecondaryText: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.green800 },
  btnDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(8, 36, 34, 0.55)' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', zIndex: 1 },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadows.lg,
  },
  modalTitle: { fontFamily: fonts.headingSemi, fontSize: 20, color: colors.green900 },
  modalSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: -4 },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: alpha.a16,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.green900,
    backgroundColor: colors.tint100,
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalCancel: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: alpha.a22,
  },
  modalCancelText: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.green800 },
  modalConfirm: {
    flex: 1.2,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  modalConfirmText: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.white },
});
