import { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { api } from '../../../lib/api';
import { childName } from '../../../lib/format';
import { Screen } from '../../../components/ui/Screen';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { ChildAvatar } from '../../../components/ui/ChildAvatar';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { AvatarChip } from '../../../components/parent/AvatarChip';
import { BlurredModalBackdrop } from '../../../components/ui/BlurredModalBackdrop';
import { SafeModalSheet } from '../../../components/ui/SafeModalSheet';
import {
  MedicationCalendar,
  MedSchedule,
  MedLog,
} from '../../../components/teacher/MedicationCalendar';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Child = {
  id: number;
  first_name?: string;
  last_name?: string;
};

function medName(s: MedSchedule) {
  return s.medication_name || s.name || s.medicine_name || 'Medication';
}

function childNameOf(s: MedSchedule) {
  if (s.child_name) return s.child_name;
  if (s.child) return `${s.child.first_name || ''} ${s.child.last_name || ''}`.trim();
  return 'Child';
}

function formatDays(days?: number[] | null) {
  if (!days || !days.length) return 'Every day';
  if (days.length === 7) return 'Every day';
  const sorted = [...days].map(Number).sort((a, b) => a - b);
  const weekdays = [1, 2, 3, 4, 5];
  if (sorted.length === 5 && weekdays.every((d) => sorted.includes(d))) return 'Weekdays';
  return sorted.map((d) => DAY_LABELS[d]).join(', ');
}

function formatTimes(s: MedSchedule) {
  const times =
    Array.isArray(s.times_of_day) && s.times_of_day.length
      ? s.times_of_day.map((t) => String(t).slice(0, 5))
      : s.time_of_day
        ? [String(s.time_of_day).slice(0, 5)]
        : [];
  return times
    .map((hm) => {
      const [hStr, mStr] = hm.split(':');
      const h = Number(hStr);
      const m = Number(mStr);
      if (Number.isNaN(h)) return hm;
      const d = new Date();
      d.setHours(h, Number.isNaN(m) ? 0 : m, 0, 0);
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    })
    .join(', ');
}

function scheduleTimesText(s: MedSchedule) {
  if (Array.isArray(s.times_of_day) && s.times_of_day.length) {
    return s.times_of_day.map((t) => String(t).slice(0, 5)).join(', ');
  }
  if (s.time_of_day) return String(s.time_of_day).slice(0, 5);
  return '08:00';
}

export default function MedicationScreen() {
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [childId, setChildId] = useState<number | null>(null);
  const [medicineName, setMedicineName] = useState('');
  const [dosage, setDosage] = useState('');
  const [instructions, setInstructions] = useState('');
  const [timesText, setTimesText] = useState('08:00');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const { data, isLoading } = useQuery({
    queryKey: ['medication-schedules'],
    queryFn: () => api<MedSchedule[] | { data: MedSchedule[] }>('/medication-schedules'),
  });

  const { data: logsData } = useQuery({
    queryKey: ['medication-logs'],
    queryFn: () => api<MedLog[] | { data: MedLog[] }>('/medication-logs'),
  });

  const { data: childrenData } = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[] | { data: Child[] }>('/children'),
  });

  const resetComposer = () => {
    setComposerOpen(false);
    setEditingId(null);
    setMedicineName('');
    setDosage('');
    setInstructions('');
    setTimesText('08:00');
    setDays([0, 1, 2, 3, 4, 5, 6]);
    setChildId(null);
  };

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editingId
        ? api(`/medication-schedules/${editingId}`, { method: 'PUT', body })
        : api('/medication-schedules', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-schedules'] });
      resetComposer();
    },
    onError: (err: Error) =>
      Alert.alert(editingId ? 'Could not update medication' : 'Could not schedule medication', err.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api(`/medication-schedules/${id}`, { method: 'PUT', body: { is_active } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-schedules'] });
    },
    onError: (err: Error) => Alert.alert('Could not update status', err.message),
  });

  const raw = (data as { data?: MedSchedule[] })?.data || data || [];
  const schedules = (Array.isArray(raw) ? raw : []) as MedSchedule[];
  const rawLogs = (logsData as { data?: MedLog[] })?.data || logsData || [];
  const logs = (Array.isArray(rawLogs) ? rawLogs : []) as MedLog[];
  const active = schedules.filter((s) => s.is_active !== false);
  const inactive = schedules.filter((s) => s.is_active === false);
  const children = useMemo(() => {
    const list = (childrenData as { data?: Child[] })?.data || childrenData || [];
    return (Array.isArray(list) ? list : []) as Child[];
  }, [childrenData]);

  const toggleDay = (day: number) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const openCreate = () => {
    setEditingId(null);
    setMedicineName('');
    setDosage('');
    setInstructions('');
    setTimesText('08:00');
    setDays([0, 1, 2, 3, 4, 5, 6]);
    setChildId(children[0]?.id ?? null);
    setComposerOpen(true);
  };

  const openEdit = (item: MedSchedule) => {
    setEditingId(item.id);
    setChildId(item.child_id || item.child?.id || null);
    setMedicineName(medName(item));
    setDosage(item.dosage || '');
    setInstructions(item.instructions || item.frequency || '');
    setTimesText(scheduleTimesText(item));
    setDays(
      Array.isArray(item.days_of_week) && item.days_of_week.length
        ? item.days_of_week.map(Number)
        : [0, 1, 2, 3, 4, 5, 6],
    );
    setComposerOpen(true);
  };

  const confirmToggleActive = (item: MedSchedule) => {
    const nextActive = item.is_active === false;
    Alert.alert(
      nextActive ? 'Reactivate schedule' : 'Deactivate schedule',
      nextActive
        ? `Reactivate ${medName(item)} so caretakers see it again in today's doses?`
        : `Deactivate ${medName(item)}? It will stay in history but stop appearing in today's doses.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextActive ? 'Reactivate' : 'Deactivate',
          style: nextActive ? 'default' : 'destructive',
          onPress: () => toggleActiveMutation.mutate({ id: item.id, is_active: nextActive }),
        },
      ],
    );
  };

  const submit = () => {
    if (!childId && !editingId) {
      Alert.alert('Choose a child', 'Select which patient this medication is for.');
      return;
    }
    if (!medicineName.trim()) {
      Alert.alert('Medicine required', 'Enter the medicine name.');
      return;
    }
    const times = timesText
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.length === 4 && t.includes(':') ? `0${t}` : t))
      .filter((t) => /^\d{2}:\d{2}$/.test(t));
    if (!times.length) {
      Alert.alert('Time required', 'Enter at least one time like 08:00 or 08:00,20:00.');
      return;
    }
    const body: Record<string, unknown> = {
      medicine_name: medicineName.trim(),
      dosage: dosage.trim() || null,
      instructions: instructions.trim() || null,
      times_of_day: times,
      days_of_week: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    };
    if (!editingId) body.child_id = childId;
    saveMutation.mutate(body);
  };

  const renderScheduleCard = (item: MedSchedule) => {
    const name = childNameOf(item);
    const times = formatTimes(item);
    const dayLabel = formatDays(item.days_of_week);
    const isActive = item.is_active !== false;
    return (
      <View key={item.id} style={[styles.scheduleCard, !isActive && styles.scheduleCardInactive]}>
        <View style={styles.scheduleTop}>
          <ChildAvatar name={name} size={44} />
          <View style={styles.scheduleCopy}>
            <Text style={styles.scheduleMed}>{medName(item)}</Text>
            <Text style={styles.scheduleChild}>{name}</Text>
            {item.dosage ? <Text style={styles.scheduleDosage}>{item.dosage}</Text> : null}
          </View>
          <StatusBadge
            label={isActive ? 'Active' : 'Inactive'}
            tone={isActive ? 'success' : 'neutral'}
            icon={isActive ? 'checkmark-circle' : 'pause-circle'}
          />
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="calendar-outline" size={13} color={colors.primary} />
            <Text style={styles.metaText}>{dayLabel}</Text>
          </View>
          {times ? (
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={13} color={colors.primary} />
              <Text style={styles.metaText}>{times}</Text>
            </View>
          ) : null}
        </View>

        {item.instructions || item.frequency || item.notes ? (
          <Text style={styles.scheduleNotes} numberOfLines={3}>
            {item.instructions || item.frequency || item.notes}
          </Text>
        ) : null}

        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.cardActionBtn} onPress={() => openEdit(item)}>
            <Ionicons name="pencil-outline" size={16} color={colors.primary} />
            <Text style={styles.cardActionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardActionBtn} onPress={() => confirmToggleActive(item)}>
            <Ionicons
              name={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
              size={16}
              color={isActive ? colors.danger : colors.success}
            />
            <Text style={[styles.cardActionText, { color: isActive ? colors.danger : colors.success }]}>
              {isActive ? 'Deactivate' : 'Reactivate'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.pad}>
          <SkeletonCard height={72} />
          <SkeletonCard height={160} />
          <SkeletonCard height={120} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View>
          <Text style={styles.title}>Medication</Text>
          <Text style={styles.subtitle}>
            Schedule doses for children in your care — caretakers log them
          </Text>
        </View>

        {!schedules.length ? (
          <EmptyState
            title="No medication schedules"
            message="Tap + to schedule a medication for an assigned child."
            icon="medkit-outline"
          />
        ) : (
          <>
            <SectionHeader title="Daily doses" subtitle="Scroll dates to see what's scheduled" />
            <MedicationCalendar schedules={schedules} logs={logs} />

            <SectionHeader
              title="Active schedules"
              subtitle={`${active.length} active regimen${active.length === 1 ? '' : 's'}`}
            />
            {active.map(renderScheduleCard)}

            {inactive.length > 0 ? (
              <>
                <SectionHeader
                  title="Inactive schedules"
                  subtitle="Kept for history — not shown in today's doses"
                />
                {inactive.map(renderScheduleCard)}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={openCreate}
        accessibilityRole="button"
        accessibilityLabel="Schedule medication"
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={resetComposer}>
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop onPress={resetComposer} />
          <SafeModalSheet style={styles.sheetOverride}>
            <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit medication' : 'Schedule medication'}</Text>
              <Text style={styles.modalSubtitle}>
                {editingId
                  ? 'Update medicine details, times, or days. Inactive schedules stay in history.'
                  : 'Caretakers will see this on their Today tab.'}
              </Text>

              {!editingId ? (
                <>
                  <Text style={styles.fieldLabel}>Child</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {children.map((c) => (
                      <AvatarChip
                        key={c.id}
                        label={childName(c)}
                        active={childId === c.id}
                        onPress={() => setChildId(c.id)}
                      />
                    ))}
                  </ScrollView>
                </>
              ) : null}

              <Text style={styles.fieldLabel}>Medicine</Text>
              <TextInput
                style={styles.input}
                value={medicineName}
                onChangeText={setMedicineName}
                placeholder="e.g. Melatonin"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.fieldLabel}>Dosage</Text>
              <TextInput
                style={styles.input}
                value={dosage}
                onChangeText={setDosage}
                placeholder="e.g. 3mg"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.fieldLabel}>Times (HH:MM, comma-separated)</Text>
              <TextInput
                style={styles.input}
                value={timesText}
                onChangeText={setTimesText}
                placeholder="08:00, 20:00"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>Days</Text>
              <View style={styles.dayRow}>
                {DAY_LABELS.map((label, idx) => (
                  <TouchableOpacity
                    key={label}
                    style={[styles.dayChip, days.includes(idx) && styles.dayChipActive]}
                    onPress={() => toggleDay(idx)}
                  >
                    <Text style={[styles.dayChipText, days.includes(idx) && styles.dayChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Instructions</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={instructions}
                onChangeText={setInstructions}
                placeholder="Give with water at bedtime"
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={resetComposer}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSave, saveMutation.isPending && styles.modalSaveDisabled]}
                  disabled={saveMutation.isPending}
                  onPress={submit}
                >
                  <Text style={styles.modalSaveText}>
                    {saveMutation.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Save schedule'}
                  </Text>
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollView>
          </SafeModalSheet>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: layout.screenPadding, gap: spacing.md },
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive + 72,
    gap: layout.sectionGap,
  },
  title: { fontFamily: fonts.heading, fontSize: 28, color: colors.green900 },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: layout.screenPadding,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...shadows.lg,
  },
  scheduleCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.md,
    ...shadows.sm,
  },
  scheduleTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  scheduleCopy: { flex: 1, gap: 2 },
  scheduleMed: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.text },
  scheduleChild: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  scheduleDosage: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  metaText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary },
  scheduleNotes: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  scheduleCardInactive: { opacity: 0.72 },
  cardActions: {
    flexDirection: 'row',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: alpha.a08,
    paddingTop: spacing.md,
  },
  cardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  cardActionText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.primary,
  },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetOverride: {
    maxHeight: '90%',
  },
  modalTitle: { fontFamily: fonts.headingSemi, fontSize: 20, color: colors.green900 },
  modalSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: 4,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  chips: { gap: spacing.sm },
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
  textarea: { minHeight: 84, textAlignVertical: 'top' },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    minWidth: 40,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: alpha.a12,
    backgroundColor: colors.tint100,
    alignItems: 'center',
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  dayChipTextActive: { color: colors.white },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.lg },
  modalCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: alpha.a22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textSecondary },
  modalSave: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveDisabled: { opacity: 0.5 },
  modalSaveText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.white },
});
