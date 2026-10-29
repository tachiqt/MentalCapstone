import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { childName } from '../../../lib/format';
import { dateKey } from '../../../lib/parent-metrics';
import { Screen } from '../../../components/ui/Screen';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { ChildAvatar } from '../../../components/ui/ChildAvatar';
import { Button } from '../../../components/ui/Button';
import { BlurredModalBackdrop } from '../../../components/ui/BlurredModalBackdrop';
import { SafeModalSheet } from '../../../components/ui/SafeModalSheet';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type Child = {
  id: number;
  first_name?: string;
  last_name?: string;
};

type TherapyPlan = {
  id: number;
  title?: string;
  child_id?: number;
  status?: string;
  sessions_per_week?: number;
};

type Session = {
  id: number;
  title?: string;
  scheduled_at?: string;
  date?: string;
  notes?: string;
  status?: string;
  duration_minutes?: number;
  child_id?: number;
  therapy_plan_id?: number | null;
  intervention_notes?: string | null;
  observations?: string;
  outcomes?: string;
  participation?: string;
  child?: Child;
  child_name?: string;
};

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const STATUS_ACCENT: Record<string, string> = {
  scheduled: colors.accent,
  completed: colors.success,
  cancelled: colors.textMuted,
};

function sessionWhen(session: Session) {
  return session.scheduled_at || session.date;
}

function parseWhen(session: Session): Date | null {
  const raw = sessionWhen(session);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfWeek(d: Date) {
  const next = new Date(d);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function formatTimeRange(session: Session) {
  const start = parseWhen(session);
  if (!start) return 'Time TBD';
  const startLabel = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const mins = session.duration_minutes;
  if (!mins) return startLabel;
  const end = new Date(start.getTime() + mins * 60_000);
  const endLabel = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${startLabel} – ${endLabel}`;
}

function formatDuration(mins?: number) {
  if (!mins) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toLocalTime(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function combineDateTime(date: string, time: string) {
  const trimmedDate = (date || '').trim();
  const trimmedTime = (time || '').trim() || '10:00';
  if (!trimmedDate) return null;
  const d = new Date(`${trimmedDate}T${trimmedTime}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultDateForDay(dayKey: string) {
  return dayKey || dateKey(new Date());
}

function defaultTimeForDay() {
  return '10:00';
}

export default function TherapyScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ childId?: string; planId?: string; compose?: string }>();
  const todayKey = dateKey(new Date());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState(todayKey);

  const [composeOpen, setComposeOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [detailSession, setDetailSession] = useState<Session | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);

  const [childId, setChildId] = useState<number | null>(null);
  const [sessionDate, setSessionDate] = useState(defaultDateForDay(todayKey));
  const [sessionTime, setSessionTime] = useState(defaultTimeForDay());
  const [duration, setDuration] = useState('60');
  const [planId, setPlanId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [genChildId, setGenChildId] = useState<number | null>(null);
  const [genStart, setGenStart] = useState(() => todayKey);
  const [genFreq, setGenFreq] = useState('2');
  const [genDuration, setGenDuration] = useState('60');
  const [genDays, setGenDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [genPreferredTime, setGenPreferredTime] = useState('');
  const [genPreferredNotice, setGenPreferredNotice] = useState<string | null>(null);
  const [genInsight, setGenInsight] = useState<string | null>(null);
  const [genPlanId, setGenPlanId] = useState<number | null>(null);
  const [suggestedSlots, setSuggestedSlots] = useState<
    Array<{
      scheduled_at: string;
      duration_minutes?: number;
      child_id?: number;
      therapy_plan_id?: number | null;
      reason?: string;
      planned_activity?: string | null;
      intervention_notes?: string | null;
    }>
  >([]);
  const [selectedSlots, setSelectedSlots] = useState<Record<number, boolean>>({});

  const [participation, setParticipation] = useState('');
  const [observations, setObservations] = useState('');
  const [outcomes, setOutcomes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['therapy-sessions'],
    queryFn: () => api<Session[] | { data: Session[] }>('/therapy-sessions'),
  });

  const { data: childrenData } = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[]>('/children'),
  });

  const { data: plansData } = useQuery({
    queryKey: ['therapy-plans'],
    queryFn: () => api<TherapyPlan[]>('/therapy-plans'),
  });

  const raw = (data as { data?: Session[] })?.data || data || [];
  const sessions = (Array.isArray(raw) ? raw : []) as Session[];
  const children = Array.isArray(childrenData) ? childrenData : [];
  const plans = Array.isArray(plansData) ? plansData : [];
  const childPlans = plans.filter(
    (p) => (!childId || p.child_id === childId) && (p.status || 'active') !== 'archived',
  );
  const genChildPlans = plans.filter(
    (p) => genChildId != null && p.child_id === genChildId && (p.status || 'active') !== 'archived',
  );

  const pickDefaultPlanId = (forChildId: number | null, list: TherapyPlan[]) => {
    if (!forChildId) return null;
    const matching = list.filter((p) => p.child_id === forChildId && (p.status || 'active') !== 'archived');
    if (matching.length === 1) return matching[0].id;
    if (matching.length > 1) return matching[0].id;
    return null;
  };

  const sessionsByDay = useMemo(() => {
    const map: Record<string, Session[]> = {};
    sessions.forEach((session) => {
      const d = parseWhen(session);
      if (!d) return;
      const key = dateKey(d);
      map[key] = map[key] ? [...map[key], session] : [session];
    });
    Object.values(map).forEach((list) =>
      list.sort((a, b) => {
        const da = parseWhen(a)?.getTime() ?? 0;
        const db = parseWhen(b)?.getTime() ?? 0;
        return da - db;
      }),
    );
    return map;
  }, [sessions]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return dateKey(d);
    });
  }, [weekStart]);

  const monthLabel = new Date(selected + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'long',
  });

  const selectedSessions = sessionsByDay[selected] || [];
  const selectedDate = new Date(selected + 'T12:00:00');
  const dayCountLabel = `${selectedSessions.length} session${selectedSessions.length === 1 ? '' : 's'}`;

  useEffect(() => {
    if (!childId && children.length === 1) setChildId(children[0].id);
    if (!genChildId && children.length === 1) setGenChildId(children[0].id);
  }, [children, childId, genChildId]);

  useEffect(() => {
    const paramChild = params.childId ? Number(params.childId) : null;
    const paramPlan = params.planId ? Number(params.planId) : null;
    if (paramChild && Number.isFinite(paramChild)) {
      setChildId(paramChild);
      if (paramPlan && Number.isFinite(paramPlan)) setPlanId(paramPlan);
      else if (plans.length) setPlanId(pickDefaultPlanId(paramChild, plans));
      if (params.compose === '1') setComposeOpen(true);
    }
  }, [params.childId, params.planId, params.compose, plans]);

  useEffect(() => {
    if (!childId || editingId) return;
    if (planId && childPlans.some((p) => p.id === planId)) return;
    setPlanId(pickDefaultPlanId(childId, plans));
  }, [childId, childPlans, plans, planId, editingId]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['therapy-sessions'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!childId) throw new Error('Select a child');
      const whenDate = combineDateTime(sessionDate, sessionTime);
      if (!whenDate) throw new Error('Set a valid date and time');
      const body = {
        child_id: childId,
        teacher_id: user?.id,
        scheduled_at: whenDate.toISOString(),
        duration_minutes: Number(duration) || 60,
        therapy_plan_id: planId || null,
      };
      if (editingId) {
        return api(`/therapy-sessions/${editingId}`, { method: 'PUT', body });
      }
      return api('/therapy-sessions', { method: 'POST', body });
    },
    onSuccess: () => {
      setComposeOpen(false);
      setEditingId(null);
      setDetailSession(null);
      invalidate();
    },
    onError: (err: Error) => Alert.alert('Could not save', err.message || 'Request failed'),
  });

  const suggestMutation = useMutation({
    mutationFn: async () => {
      if (!genChildId) throw new Error('Select a child');
      if (!genDays.length) throw new Error('Pick at least one weekday');
      return api<{
        suggested_slots: Array<{
          scheduled_at: string;
          duration_minutes?: number;
          child_id?: number;
          therapy_plan_id?: number | null;
          reason?: string;
          planned_activity?: string | null;
          intervention_notes?: string | null;
        }>;
        insight?: string;
        basis?: {
          sessions_per_week?: number;
          preferred_band?: string;
          preferred_time_message?: string;
        };
        preferred_time_applied?: boolean;
        message?: string;
      }>('/therapy-sessions/suggest', {
        method: 'POST',
        body: {
          child_id: genChildId,
          therapy_plan_id: genPlanId || undefined,
          start_date: genStart,
          sessions_per_week: Number(genFreq) || 2,
          duration_minutes: Number(genDuration) || 60,
          days: genDays,
          ...(genPreferredTime.trim()
            ? { preferred_start_time: genPreferredTime.trim() }
            : {}),
        },
      });
    },
    onSuccess: (payload) => {
      const slots = payload.suggested_slots || [];
      setSuggestedSlots(slots);
      setGenInsight(payload.insight || null);
      const notice =
        payload.message ||
        (payload.preferred_time_applied === false
          ? payload.basis?.preferred_time_message
          : null);
      setGenPreferredNotice(notice || null);
      if (payload.basis?.sessions_per_week) {
        setGenFreq(String(payload.basis.sessions_per_week));
      }
      const next: Record<number, boolean> = {};
      slots.forEach((_, idx) => {
        next[idx] = true;
      });
      setSelectedSlots(next);
    },
    onError: (err: Error) => Alert.alert('Could not generate', err.message || 'Request failed'),
  });

  const applySuggestMutation = useMutation({
    mutationFn: async () => {
      if (!genChildId) throw new Error('Select a child');
      const picks = suggestedSlots.filter((_, idx) => selectedSlots[idx]);
      if (!picks.length) throw new Error('Select at least one suggested slot');
      for (const slot of picks) {
        await api('/therapy-sessions', {
          method: 'POST',
          body: {
            child_id: genChildId,
            teacher_id: user?.id,
            therapy_plan_id: slot.therapy_plan_id || genPlanId || undefined,
            scheduled_at: slot.scheduled_at,
            duration_minutes: slot.duration_minutes || Number(genDuration) || 60,
            intervention_notes: slot.intervention_notes || slot.planned_activity || undefined,
            status: 'scheduled',
          },
        });
      }
      return picks.length;
    },
    onSuccess: (count) => {
      setGenerateOpen(false);
      setSuggestedSlots([]);
      setSelectedSlots({});
      setGenInsight(null);
      setGenPreferredNotice(null);
      invalidate();
      Alert.alert('Schedule created', `${count} session${count === 1 ? '' : 's'} added.`);
    },
    onError: (err: Error) => Alert.alert('Could not save schedule', err.message || 'Request failed'),
  });

  const openGenerate = () => {
    const firstChild = children[0]?.id ?? null;
    setGenChildId(firstChild);
    setGenStart(todayKey);
    setGenDuration('60');
    setGenDays([1, 2, 3, 4, 5]);
    setSuggestedSlots([]);
    setSelectedSlots({});
    setGenInsight(null);
    const childPlansForGen = plans.filter(
      (p) => p.child_id === firstChild && (p.status || 'active') === 'active'
    );
    const plan = childPlansForGen[0];
    setGenPlanId(plan?.id ?? null);
    setGenFreq(String(plan?.sessions_per_week || 2));
    setGenerateOpen(true);
  };

  const toggleGenDay = (day: number) => {
    setGenDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  };

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!detailSession) throw new Error('No session selected');
      return api(`/therapy-sessions/${detailSession.id}`, {
        method: 'PUT',
        body: {
          status: 'completed',
          participation: participation || null,
          observations: observations.trim() || null,
          outcomes: outcomes.trim() || null,
        },
      });
    },
    onSuccess: () => {
      setCompleteOpen(false);
      setDetailSession(null);
      invalidate();
    },
    onError: (err: Error) => Alert.alert('Could not complete', err.message || 'Request failed'),
  });

  const cancelMutation = useMutation({
    mutationFn: async (session: Session) =>
      api(`/therapy-sessions/${session.id}`, {
        method: 'PUT',
        body: { status: 'cancelled' },
      }),
    onSuccess: () => {
      setDetailSession(null);
      invalidate();
    },
    onError: (err: Error) => Alert.alert('Could not cancel', err.message || 'Request failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (session: Session) =>
      api(`/therapy-sessions/${session.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDetailSession(null);
      invalidate();
    },
    onError: (err: Error) => Alert.alert('Could not delete', err.message || 'Request failed'),
  });

  const openCompose = (session?: Session | null) => {
    if (session) {
      setEditingId(session.id);
      setChildId(session.child_id || session.child?.id || null);
      const d = parseWhen(session);
      setSessionDate(d ? toLocalDate(d) : defaultDateForDay(selected));
      setSessionTime(d ? toLocalTime(d) : defaultTimeForDay());
      setDuration(String(session.duration_minutes || 60));
      setPlanId(session.therapy_plan_id || null);
    } else {
      setEditingId(null);
      const nextChild = children[0]?.id ?? null;
      setChildId(nextChild);
      setSessionDate(defaultDateForDay(selected));
      setSessionTime(defaultTimeForDay());
      setDuration('60');
      setPlanId(pickDefaultPlanId(nextChild, plans));
    }
    setComposeOpen(true);
  };

  const openComplete = (session: Session) => {
    setDetailSession(session);
    setParticipation(session.participation || '');
    setObservations(session.observations || '');
    setOutcomes(session.outcomes || '');
    setCompleteOpen(true);
  };

  const goWeek = (delta: number) => {
    const nextStart = new Date(weekStart);
    nextStart.setDate(weekStart.getDate() + delta * 7);
    const selectedDateObj = new Date(selected + 'T12:00:00');
    const weekdayIndex = selectedDateObj.getDay();
    const nextSelected = new Date(nextStart);
    nextSelected.setDate(nextStart.getDate() + weekdayIndex);
    setWeekStart(nextStart);
    setSelected(dateKey(nextSelected));
  };

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.pad}>
          <SkeletonCard height={140} />
          <SkeletonCard height={100} />
          <SkeletonCard height={100} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.monthTitle}>{monthLabel}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.generateBtn}
              onPress={openGenerate}
              accessibilityLabel="Generate schedule"
            >
              <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
              <Text style={styles.scheduleBtnText}>Generate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.scheduleBtn}
              onPress={() => openCompose()}
              accessibilityLabel="Schedule session"
            >
              <Ionicons name="add" size={18} color={colors.primary} />
              <Text style={styles.scheduleBtnText}>Schedule</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.weekRow}>
          <TouchableOpacity
            style={styles.weekArrow}
            onPress={() => goWeek(-1)}
            accessibilityLabel="Previous week"
          >
            <Ionicons name="chevron-back" size={18} color={colors.white} />
          </TouchableOpacity>

          <View style={styles.weekStrip}>
            {weekDays.map((key, i) => {
              const d = new Date(key + 'T12:00:00');
              const isSelected = key === selected;
              const isToday = key === todayKey;
              const hasSessions = Boolean(sessionsByDay[key]?.length);

              return (
                <TouchableOpacity
                  key={key}
                  style={styles.dayCell}
                  onPress={() => setSelected(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.dayLetter, isSelected && styles.dayLetterSelected]}>
                    {DAY_LETTERS[i]}
                  </Text>
                  <View
                    style={[
                      styles.dayNumWrap,
                      isSelected && styles.dayNumWrapSelected,
                      isToday && !isSelected && styles.dayNumWrapToday,
                    ]}
                  >
                    <Text style={[styles.dayNum, isSelected && styles.dayNumSelected]}>
                      {d.getDate()}
                    </Text>
                  </View>
                  {hasSessions ? (
                    <View style={[styles.dayDot, isSelected && styles.dayDotSelected]} />
                  ) : (
                    <View style={styles.dayDotSpacer} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.weekArrow}
            onPress={() => goWeek(1)}
            accessibilityLabel="Next week"
          >
            <Ionicons name="chevron-forward" size={18} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.contentRow}>
          <View style={styles.sidebar}>
            <Text style={styles.sidebarWeekday}>
              {selectedDate.toLocaleDateString(undefined, { weekday: 'short' })}
            </Text>
            <Text style={styles.sidebarDayNum}>{selectedDate.getDate()}</Text>
            <Text style={styles.sidebarMeta}>{dayCountLabel}</Text>
          </View>

          <View style={styles.cards}>
            {sessions.length === 0 ? (
              <EmptyState
                title="No therapy sessions"
                message="Tap Generate or Schedule to book sessions for an assigned child."
                icon="calendar-outline"
              />
            ) : selectedSessions.length === 0 ? (
              <View style={styles.emptyDay}>
                <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No sessions</Text>
                <Text style={styles.emptySub}>Nothing scheduled for this day.</Text>
                <Button label="Generate schedule" onPress={openGenerate} variant="secondary" />
                <Button label="Schedule for this day" onPress={() => openCompose()} variant="ghost" />
              </View>
            ) : (
              selectedSessions.map((item) => {
                const name = item.child_name || childName(item.child) || 'Child';
                const status = (item.status || 'scheduled').toLowerCase();
                const accent = STATUS_ACCENT[status] || colors.accent;
                const durationLabel = formatDuration(item.duration_minutes);

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.card}
                    onPress={() => setDetailSession(item)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.cardRail, { backgroundColor: accent }]} />
                    <View style={styles.cardBody}>
                      <View style={styles.cardTop}>
                        <ChildAvatar name={name} size={40} />
                        <View style={styles.cardCopy}>
                          <Text style={styles.cardTime}>{formatTimeRange(item)}</Text>
                          <Text style={styles.cardName}>{name}</Text>
                          <View style={styles.cardMetaRow}>
                            <View style={styles.metaItem}>
                              <Ionicons name="fitness-outline" size={12} color={colors.textMuted} />
                              <Text style={styles.metaText}>
                                {item.intervention_notes
                                  || item.title?.replace(/^Therapy — /, '')
                                  || 'Therapy'}
                              </Text>
                            </View>
                            {durationLabel ? (
                              <View style={styles.metaItem}>
                                <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                                <Text style={styles.metaText}>{durationLabel}</Text>
                              </View>
                            ) : null}
                            <View style={styles.metaItem}>
                              <Ionicons name="ellipse" size={8} color={accent} />
                              <Text style={styles.metaText}>{status.replace('_', ' ')}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                      {item.notes ? (
                        <Text style={styles.notes} numberOfLines={2}>
                          {item.notes}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      <Modal visible={composeOpen} transparent animationType="fade" onRequestClose={() => setComposeOpen(false)}>
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop onPress={() => setComposeOpen(false)} />
          <View style={styles.modalOverlay} pointerEvents="box-none">
          <SafeModalSheet>
            <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24}>
            <Text style={styles.modalTitle}>{editingId ? 'Reschedule session' : 'Schedule session'}</Text>
            <Text style={styles.modalHint}>You will be assigned as the teacher for this appointment.</Text>

            <Text style={styles.fieldLabel}>Child</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {children.map((c) => {
                const active = childId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setChildId(c.id);
                      setPlanId(pickDefaultPlanId(c.id, plans));
                    }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{childName(c)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={sessionDate}
              onChangeText={setSessionDate}
              placeholder="2026-09-03"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Time (HH:mm)</Text>
            <TextInput
              style={styles.input}
              value={sessionTime}
              onChangeText={setSessionTime}
              placeholder="10:00"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>Duration (minutes)</Text>
            <TextInput
              style={styles.input}
              value={duration}
              onChangeText={setDuration}
              keyboardType="number-pad"
              placeholder="60"
              placeholderTextColor={colors.textMuted}
            />

            {childPlans.length === 1 ? (
              <Text style={styles.modalHint}>
                Linked plan: {childPlans[0].title || `Plan #${childPlans[0].id}`}
              </Text>
            ) : childPlans.length > 1 ? (
              <>
                <Text style={styles.fieldLabel}>Therapy plan</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {childPlans.map((p) => {
                    const active = planId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setPlanId(p.id)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {p.title || `Plan #${p.id}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <Text style={styles.modalHint}>
                No therapy plan for this child yet. Create one from the child profile first.
              </Text>
            )}

            <View style={styles.modalActions}>
              <Button label="Cancel" variant="secondary" onPress={() => setComposeOpen(false)} style={styles.modalActionBtn} />
              <Button
                label={editingId ? 'Save changes' : 'Schedule'}
                onPress={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
                disabled={!childId}
                style={styles.modalActionBtn}
              />
            </View>
            </KeyboardAwareScrollView>
          </SafeModalSheet>
          </View>
        </View>
      </Modal>

      <Modal
        visible={generateOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGenerateOpen(false)}
      >
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop onPress={() => setGenerateOpen(false)} />
          <View style={styles.modalOverlay} pointerEvents="box-none">
            <SafeModalSheet>
              <KeyboardAwareScrollView
                keyboardShouldPersistTaps="handled"
                bottomOffset={24}
                contentContainerStyle={styles.genScroll}
              >
                <View style={styles.aiBadge}>
                  <Ionicons name="sparkles" size={14} color={colors.primary} />
                  <Text style={styles.aiBadgeText}>AI schedule assist</Text>
                </View>
                <Text style={styles.modalTitle}>Generate schedule</Text>
                <Text style={styles.modalHint}>
                  Same flow as scheduling a session — AI proposes times from this child’s plan,
                  progress notes, and recent engagement. Review and save what fits.
                </Text>

                <Text style={styles.fieldLabel}>Child</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {children.map((c) => {
                    const active = genChildId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          setGenChildId(c.id);
                          setSuggestedSlots([]);
                          setSelectedSlots({});
                          setGenInsight(null);
                          const nextPlans = plans.filter(
                            (p) => p.child_id === c.id && (p.status || 'active') === 'active'
                          );
                          const plan = nextPlans[0];
                          setGenPlanId(plan?.id ?? null);
                          if (plan?.sessions_per_week) setGenFreq(String(plan.sessions_per_week));
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {childName(c)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {genChildPlans.length > 0 ? (
                  <>
                    <Text style={styles.fieldLabel}>Therapy plan (optional)</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRow}
                    >
                      <TouchableOpacity
                        style={[styles.chip, !genPlanId && styles.chipActive]}
                        onPress={() => setGenPlanId(null)}
                      >
                        <Text style={[styles.chipText, !genPlanId && styles.chipTextActive]}>None</Text>
                      </TouchableOpacity>
                      {genChildPlans.map((p) => {
                        const active = genPlanId === p.id;
                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => {
                              setGenPlanId(p.id);
                              if (p.sessions_per_week) setGenFreq(String(p.sessions_per_week));
                            }}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                              {p.title || `Plan #${p.id}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : null}

                <Text style={styles.fieldLabel}>Start date (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={genStart}
                  onChangeText={setGenStart}
                  placeholder={todayKey}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />

                <Text style={styles.fieldLabel}>Preferred start time (HH:MM)</Text>
                <TextInput
                  style={styles.input}
                  value={genPreferredTime}
                  onChangeText={setGenPreferredTime}
                  placeholder="09:00"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="numbers-and-punctuation"
                />

                <View style={styles.genRow}>
                  <View style={styles.genHalf}>
                    <Text style={styles.fieldLabel}>Sessions / week</Text>
                    <TextInput
                      style={styles.input}
                      value={genFreq}
                      onChangeText={setGenFreq}
                      keyboardType="number-pad"
                      placeholder="2"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                  <View style={styles.genHalf}>
                    <Text style={styles.fieldLabel}>Duration (min)</Text>
                    <TextInput
                      style={styles.input}
                      value={genDuration}
                      onChangeText={setGenDuration}
                      keyboardType="number-pad"
                      placeholder="60"
                      placeholderTextColor={colors.textMuted}
                    />
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Preferred weekdays</Text>
                <View style={styles.chipRow}>
                  {[
                    { d: 1, label: 'Mon' },
                    { d: 2, label: 'Tue' },
                    { d: 3, label: 'Wed' },
                    { d: 4, label: 'Thu' },
                    { d: 5, label: 'Fri' },
                    { d: 6, label: 'Sat' },
                    { d: 7, label: 'Sun' },
                  ].map((item) => {
                    const active = genDays.includes(item.d);
                    return (
                      <TouchableOpacity
                        key={item.d}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => toggleGenDay(item.d)}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Button
                  label={suggestedSlots.length ? 'Regenerate suggestions' : 'Generate AI suggestions'}
                  icon="sparkles-outline"
                  onPress={() => suggestMutation.mutate()}
                  loading={suggestMutation.isPending}
                  disabled={!genChildId || !genDays.length}
                  style={styles.genPrimaryCta}
                />

                {genPreferredNotice ? (
                  <View style={styles.insightCard}>
                    <View style={styles.insightHead}>
                      <Ionicons name="time-outline" size={16} color={colors.primary} />
                      <Text style={styles.insightTitle}>Preferred time</Text>
                    </View>
                    <Text style={styles.insightBody}>{genPreferredNotice}</Text>
                  </View>
                ) : null}

                {genInsight ? (
                  <View style={styles.insightCard}>
                    <View style={styles.insightHead}>
                      <Ionicons name="analytics-outline" size={16} color={colors.primary} />
                      <Text style={styles.insightTitle}>Based on progress</Text>
                    </View>
                    <Text style={styles.insightBody}>{genInsight}</Text>
                  </View>
                ) : null}

                {suggestedSlots.length > 0 ? (
                  <View style={styles.suggestList}>
                    <View style={styles.suggestHead}>
                      <Text style={styles.fieldLabel}>Suggested sessions</Text>
                      <Text style={styles.suggestCount}>
                        {Object.values(selectedSlots).filter(Boolean).length}/{suggestedSlots.length} selected
                      </Text>
                    </View>
                    {suggestedSlots.map((slot, idx) => {
                      const active = !!selectedSlots[idx];
                      const whenLabel = new Date(slot.scheduled_at).toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                      return (
                        <TouchableOpacity
                          key={`${slot.scheduled_at}-${idx}`}
                          style={[styles.suggestRow, active && styles.suggestRowActive]}
                          onPress={() =>
                            setSelectedSlots((prev) => ({ ...prev, [idx]: !prev[idx] }))
                          }
                        >
                          <Ionicons
                            name={active ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={active ? colors.primary : colors.textMuted}
                          />
                          <View style={styles.suggestCopy}>
                            <Text style={styles.suggestText}>{whenLabel}</Text>
                            <Text style={styles.suggestMeta}>
                              {slot.duration_minutes || Number(genDuration) || 60} min
                              {slot.planned_activity || slot.intervention_notes
                                ? ` · ${slot.planned_activity || slot.intervention_notes}`
                                : slot.reason
                                  ? ` · ${slot.reason}`
                                  : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

              <View style={styles.modalActions}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setGenerateOpen(false)}
                  style={styles.modalActionBtn}
                />
                <Button
                  label={
                    suggestedSlots.length
                      ? `Save ${Object.values(selectedSlots).filter(Boolean).length} session${
                          Object.values(selectedSlots).filter(Boolean).length === 1 ? '' : 's'
                        }`
                      : 'Save schedule'
                  }
                  onPress={() => applySuggestMutation.mutate()}
                  loading={applySuggestMutation.isPending}
                  disabled={!suggestedSlots.length || !Object.values(selectedSlots).some(Boolean)}
                  style={styles.modalActionBtn}
                />
              </View>
              </KeyboardAwareScrollView>
          </SafeModalSheet>
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(detailSession) && !completeOpen && !composeOpen && !generateOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailSession(null)}
      >
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop onPress={() => setDetailSession(null)} />
          <View style={styles.modalOverlay} pointerEvents="box-none">
          {detailSession ? (
            <SafeModalSheet>
              <Text style={styles.modalTitle}>
                {detailSession.child_name || childName(detailSession.child) || 'Session'}
              </Text>
              <Text style={styles.modalHint}>
                {formatTimeRange(detailSession)} · {(detailSession.status || 'scheduled').replace('_', ' ')}
              </Text>
              {detailSession.intervention_notes ? (
                <Text style={styles.modalHint}>Intervention: {detailSession.intervention_notes}</Text>
              ) : null}

              <View style={styles.modalActionsCol}>
                {(detailSession.status || 'scheduled') === 'scheduled' ? (
                  <>
                    <Button
                      label="Reschedule"
                      variant="secondary"
                      icon="calendar-outline"
                      onPress={() => openCompose(detailSession)}
                    />
                    <Button
                      label="Mark completed"
                      icon="checkmark-circle-outline"
                      onPress={() => openComplete(detailSession)}
                    />
                    <Button
                      label="Cancel session"
                      variant="ghost"
                      onPress={() =>
                        Alert.alert('Cancel session?', 'It will remain in history as cancelled.', [
                          { text: 'Keep', style: 'cancel' },
                          {
                            text: 'Cancel session',
                            style: 'destructive',
                            onPress: () => cancelMutation.mutate(detailSession),
                          },
                        ])
                      }
                      loading={cancelMutation.isPending}
                    />
                  </>
                ) : (
                  <Button
                    label="Delete session"
                    variant="danger"
                    onPress={() =>
                      Alert.alert('Delete session?', 'This permanently removes the appointment.', [
                        { text: 'Keep', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => deleteMutation.mutate(detailSession),
                        },
                      ])
                    }
                    loading={deleteMutation.isPending}
                  />
                )}
                <Button label="Close" variant="ghost" onPress={() => setDetailSession(null)} />
              </View>
          </SafeModalSheet>
          ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={completeOpen} transparent animationType="fade" onRequestClose={() => setCompleteOpen(false)}>
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop onPress={() => setCompleteOpen(false)} />
          <View style={styles.modalOverlay} pointerEvents="box-none">
          <SafeModalSheet>
            <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24}>
            <Text style={styles.modalTitle}>Record outcome</Text>
            <Text style={styles.fieldLabel}>Participation</Text>
            <View style={styles.chipRow}>
              {['', 'engaged', 'partial', 'withdrawn'].map((value) => {
                const label = value || 'Not recorded';
                const active = participation === value;
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setParticipation(value)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Observations</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={observations}
              onChangeText={setObservations}
              multiline
              placeholder="What did you observe?"
              placeholderTextColor={colors.textMuted}
            />
            <Text style={styles.fieldLabel}>Outcomes</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={outcomes}
              onChangeText={setOutcomes}
              multiline
              placeholder="What progressed?"
              placeholderTextColor={colors.textMuted}
            />
            <View style={styles.modalActions}>
              <Button label="Cancel" variant="ghost" onPress={() => setCompleteOpen(false)} />
              <Button
                label="Mark completed"
                onPress={() => completeMutation.mutate()}
                loading={completeMutation.isPending}
              />
            </View>
            </KeyboardAwareScrollView>
          </SafeModalSheet>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  pad: { padding: layout.screenPadding, gap: spacing.md },
  header: {
    backgroundColor: colors.primary,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  monthTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 20,
    color: colors.white,
    flex: 1,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  scheduleBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.primary,
  },
  suggestList: { gap: spacing.sm, marginTop: spacing.md },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    backgroundColor: colors.tint100,
  },
  suggestRowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  suggestText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, flex: 1 },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  weekArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekStrip: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  dayLetter: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.65)',
  },
  dayLetterSelected: { color: colors.white },
  dayNumWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumWrapSelected: {
    borderWidth: 2,
    borderColor: colors.white,
  },
  dayNumWrapToday: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  dayNum: {
    fontFamily: fonts.headingSemi,
    fontSize: 15,
    color: colors.white,
  },
  dayNumSelected: { color: colors.white },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  dayDotSelected: { backgroundColor: colors.white },
  dayDotSpacer: { width: 5, height: 5 },
  body: { flex: 1, backgroundColor: colors.background },
  bodyContent: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive,
  },
  contentRow: { flexDirection: 'row', gap: spacing.md },
  sidebar: {
    width: 48,
    paddingTop: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  sidebarWeekday: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  sidebarDayNum: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
  },
  sidebarMeta: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  cards: { flex: 1, gap: spacing.md },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  cardRail: { width: 4 },
  cardBody: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTop: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  cardCopy: { flex: 1, gap: 3 },
  cardTime: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.text },
  cardName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
  cardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: 4,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'capitalize',
  },
  notes: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    paddingLeft: 52,
  },
  emptyDay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.huge,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: alpha.a08,
    paddingHorizontal: spacing.md,
  },
  emptyTitle: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.text },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  modalRoot: {
    flex: 1,
    // Guarantees the page behind is dimmed even if the backdrop child fails to layout
    backgroundColor: 'rgba(8, 36, 34, 0.55)',
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', zIndex: 1 },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '88%',
  },
  modalTitle: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.text },
  modalHint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: alpha.a08,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: alpha.a08,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  modalActionBtn: { flex: 1 },
  modalActionsCol: { gap: spacing.sm, marginTop: spacing.md },
  genScroll: { paddingBottom: spacing.md, gap: 2 },
  genRow: { flexDirection: 'row', gap: spacing.sm },
  genHalf: { flex: 1 },
  genPrimaryCta: { marginTop: spacing.md },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    marginBottom: 4,
  },
  aiBadgeText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primary },
  insightCard: {
    marginTop: spacing.md,
    backgroundColor: colors.tint100,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.sm,
  },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  insightTitle: { fontFamily: fonts.headingSemi, fontSize: 13, color: colors.primary },
  insightBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  suggestHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  suggestCount: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
  suggestCopy: { flex: 1, gap: 2 },
  suggestMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 16 },
});
