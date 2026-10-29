import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, fonts, spacing, radii, shadows } from '../../lib/theme';
import { dateKey } from '../../lib/parent-metrics';
import { ChildAvatar } from '../ui/ChildAvatar';
import { StatusBadge } from '../ui/StatusBadge';

export type MedSchedule = {
  id: number;
  medication_name?: string;
  name?: string;
  medicine_name?: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
  notes?: string;
  time_of_day?: string;
  times_of_day?: string[];
  days_of_week?: number[] | null;
  is_active?: boolean;
  child_id?: number;
  child_name?: string;
  child?: { id?: number; first_name?: string; last_name?: string };
};

export type MedLog = {
  id: number;
  status: string;
  medication_schedule_id?: number;
  administered_at?: string;
  logged_at?: string;
  child_id?: number;
};

type DayTone = 'scheduled' | 'given' | 'missed' | 'mixed';

const toneColor: Record<DayTone, string> = {
  scheduled: colors.accent,
  given: colors.success,
  missed: colors.danger,
  mixed: colors.warning,
};

const DAY_WIDTH = 56;
const DAY_GAP = 8;
const STRIP_PAD = 16;
/** Days before and after today in the horizontal strip */
const RANGE = 21;

function scheduleName(s: MedSchedule) {
  return s.medication_name || s.name || s.medicine_name || 'Medication';
}

function childLabel(s: MedSchedule) {
  if (s.child_name) return s.child_name;
  if (s.child) {
    return `${s.child.first_name || ''} ${s.child.last_name || ''}`.trim();
  }
  return 'Child';
}

function scheduleTimes(s: MedSchedule): string[] {
  if (Array.isArray(s.times_of_day) && s.times_of_day.length) {
    return s.times_of_day.map((t) => String(t).slice(0, 5));
  }
  if (s.time_of_day) return [String(s.time_of_day).slice(0, 5)];
  return [];
}

function formatClock(hm: string) {
  const [hStr, mStr] = hm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h)) return hm;
  const d = new Date();
  d.setHours(h, Number.isNaN(m) ? 0 : m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function runsOnDay(schedule: MedSchedule, dow: number) {
  if (!schedule.is_active && schedule.is_active !== undefined) return false;
  const days = schedule.days_of_week;
  if (!days || !Array.isArray(days) || days.length === 0) return true;
  return days.map(Number).includes(dow);
}

function logDateKey(log: MedLog): string | null {
  const raw = log.administered_at || log.logged_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : dateKey(d);
}

function buildDayRange(center: Date) {
  const start = new Date(center);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - RANGE);
  return Array.from({ length: RANGE * 2 + 1 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return dateKey(d);
  });
}

type Props = {
  schedules: MedSchedule[];
  logs?: MedLog[];
};

export function MedicationCalendar({ schedules, logs = [] }: Props) {
  const todayKey = dateKey(new Date());
  const [selected, setSelected] = useState(todayKey);
  const scrollRef = useRef<ScrollView>(null);
  const didCenter = useRef(false);

  const dayKeys = useMemo(() => buildDayRange(new Date()), []);

  const active = useMemo(
    () => schedules.filter((s) => s.is_active !== false),
    [schedules],
  );

  const logsByDaySchedule = useMemo(() => {
    const map: Record<string, Record<number, string>> = {};
    logs.forEach((log) => {
      const key = logDateKey(log);
      const sid = log.medication_schedule_id;
      if (!key || !sid) return;
      if (!map[key]) map[key] = {};
      map[key][sid] = log.status;
    });
    return map;
  }, [logs]);

  function dayTone(key: string): DayTone | null {
    const d = new Date(key + 'T12:00:00');
    const dow = d.getDay();
    const due = active.filter((s) => runsOnDay(s, dow));
    if (!due.length) return null;

    const dayLogs = logsByDaySchedule[key] || {};
    const statuses = due.map((s) => dayLogs[s.id]).filter(Boolean);
    if (!statuses.length) return 'scheduled';

    const allGiven = statuses.every((s) => s === 'given');
    const anyMissed = statuses.some((s) => s === 'missed' || s === 'refused' || s === 'skipped');
    if (allGiven && statuses.length >= due.length) return 'given';
    if (anyMissed) {
      return statuses.some((s) => s === 'given') ? 'mixed' : 'missed';
    }
    if (statuses.some((s) => s === 'given') && statuses.length < due.length) return 'mixed';
    if (allGiven) return 'given';
    return 'scheduled';
  }

  const selectedDow = new Date(selected + 'T12:00:00').getDay();
  const selectedSchedules = active
    .filter((s) => runsOnDay(s, selectedDow))
    .sort((a, b) => {
      const ta = scheduleTimes(a)[0] || '99:99';
      const tb = scheduleTimes(b)[0] || '99:99';
      return ta.localeCompare(tb);
    });

  const selectedLogs = logsByDaySchedule[selected] || {};
  const isPastOrToday = selected <= todayKey;
  const monthLabel = new Date(selected + 'T12:00:00').toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const scrollToKey = (key: string, animated = true) => {
    const index = dayKeys.indexOf(key);
    if (index < 0 || !scrollRef.current) return;
    const x = Math.max(0, index * (DAY_WIDTH + DAY_GAP) - DAY_WIDTH * 1.5);
    scrollRef.current.scrollTo({ x, animated });
  };

  useEffect(() => {
    if (didCenter.current) return;
    const t = setTimeout(() => {
      scrollToKey(todayKey, false);
      didCenter.current = true;
    }, 80);
    return () => clearTimeout(t);
  }, [todayKey, dayKeys]);

  const selectDay = (key: string) => {
    setSelected(key);
    scrollToKey(key, true);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.stripCard}>
        <View style={styles.monthRow}>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          {selected !== todayKey ? (
            <TouchableOpacity style={styles.todayBtn} onPress={() => selectDay(todayKey)} hitSlop={8}>
              <Ionicons name="today-outline" size={14} color={colors.primary} />
              <Text style={styles.todayText}>Today</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}
          decelerationRate="fast"
          snapToInterval={DAY_WIDTH + DAY_GAP}
          snapToAlignment="start"
        >
          {dayKeys.map((key) => {
            const d = new Date(key + 'T12:00:00');
            const isSelected = key === selected;
            const isToday = key === todayKey;
            const tone = dayTone(key);
            const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });

            return (
              <TouchableOpacity
                key={key}
                style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                onPress={() => selectDay(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${weekday} ${d.getDate()}`}
              >
                <Text style={[styles.dayWeek, isSelected && styles.dayWeekSelected]}>
                  {weekday}
                </Text>
                <Text
                  style={[
                    styles.dayNum,
                    isToday && !isSelected && styles.dayNumToday,
                    isSelected && styles.dayNumSelected,
                  ]}
                >
                  {d.getDate()}
                </Text>
                {tone ? (
                  <View style={styles.medMark}>
                    <Ionicons
                      name="medical"
                      size={10}
                      color={isSelected ? colors.white : toneColor[tone]}
                    />
                  </View>
                ) : (
                  <View style={styles.medMarkSpacer} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.dayPanel}>
        <Text style={styles.dayTitle}>
          {new Date(selected + 'T12:00:00').toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
        <Text style={styles.daySub}>
          {selectedSchedules.length === 0
            ? 'No doses scheduled'
            : `${selectedSchedules.length} dose${selectedSchedules.length === 1 ? '' : 's'} scheduled`}
        </Text>

        {selectedSchedules.length === 0 ? (
          <View style={styles.emptyDay}>
            <View style={styles.emptyIcon}>
              <Ionicons name="medkit-outline" size={28} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>Nothing due</Text>
            <Text style={styles.emptySub}>No medication schedules fall on this day.</Text>
          </View>
        ) : (
          selectedSchedules.map((schedule, index) => {
            const times = scheduleTimes(schedule);
            const name = childLabel(schedule);
            const status = selectedLogs[schedule.id];
            const badge = status
              ? status === 'given'
                ? { label: 'Given', tone: 'success' as const, icon: 'checkmark-circle' as const }
                : status === 'missed' || status === 'skipped' || status === 'refused'
                ? {
                    label: status === 'refused' ? 'Refused' : 'Missed',
                    tone: 'danger' as const,
                    icon: 'close-circle' as const,
                  }
                : { label: status, tone: 'warning' as const, icon: 'alert-circle' as const }
              : isPastOrToday && selected === todayKey
              ? { label: 'Due today', tone: 'accent' as const, icon: 'time-outline' as const }
              : selected < todayKey
              ? { label: 'No log', tone: 'neutral' as const, icon: 'ellipse-outline' as const }
              : { label: 'Upcoming', tone: 'accent' as const, icon: 'calendar-outline' as const };

            return (
              <View key={schedule.id} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor:
                          status === 'given'
                            ? colors.success
                            : status === 'missed' || status === 'skipped' || status === 'refused'
                            ? colors.danger
                            : colors.accent,
                      },
                    ]}
                  />
                  {index < selectedSchedules.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>

                <View style={styles.doseCard}>
                  <View style={styles.doseTop}>
                    <ChildAvatar name={name} size={40} />
                    <View style={styles.doseCopy}>
                      <Text style={styles.medName}>{scheduleName(schedule)}</Text>
                      <Text style={styles.childName}>{name}</Text>
                      {schedule.dosage ? <Text style={styles.dosage}>{schedule.dosage}</Text> : null}
                    </View>
                    <StatusBadge label={badge.label} tone={badge.tone} icon={badge.icon} />
                  </View>

                  {times.length > 0 ? (
                    <View style={styles.timeRow}>
                      {times.map((t) => (
                        <View key={t} style={styles.timeChip}>
                          <Ionicons name="time-outline" size={12} color={colors.primary} />
                          <Text style={styles.timeText}>{formatClock(t)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {schedule.instructions || schedule.frequency || schedule.notes ? (
                    <Text style={styles.notes} numberOfLines={2}>
                      {schedule.instructions || schedule.frequency || schedule.notes}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  stripCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    overflow: 'hidden',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  monthLabel: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.primary },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  todayText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary },
  strip: {
    paddingHorizontal: STRIP_PAD,
    gap: DAY_GAP,
    paddingBottom: spacing.xs,
  },
  dayCell: {
    width: DAY_WIDTH,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    gap: 4,
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
    ...shadows.sm,
  },
  dayWeek: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.primaryLight,
  },
  dayWeekSelected: { color: 'rgba(255,255,255,0.85)' },
  dayNum: {
    fontFamily: fonts.headingSemi,
    fontSize: 18,
    color: colors.primary,
  },
  dayNumToday: { color: colors.accent },
  dayNumSelected: { color: colors.white },
  medMark: { height: 14, alignItems: 'center', justifyContent: 'center' },
  medMarkSpacer: { height: 14 },
  dayPanel: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.md,
    ...shadows.sm,
  },
  dayTitle: { fontFamily: fonts.headingSemi, fontSize: 17, color: colors.text },
  daySub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: -8 },
  emptyDay: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.text },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  timelineRow: { flexDirection: 'row', gap: spacing.md },
  timelineRail: { width: 16, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 18 },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.borderLight, marginTop: 4 },
  doseCard: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: alpha.a08,
    marginBottom: spacing.sm,
  },
  doseTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  doseCopy: { flex: 1, gap: 2 },
  medName: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.text },
  childName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  dosage: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  timeText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary },
  notes: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
