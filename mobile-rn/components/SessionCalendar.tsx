import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, fonts, spacing, radii, shadows } from '../lib/theme';
import { initials } from '../lib/format';
import { dateKey, dayStatusDots, DaySessionStatus } from '../lib/parent-metrics';

export type CalendarSession = {
  id: number;
  child_id?: number;
  scheduled_at: string;
  title?: string;
  status?: string;
  duration_minutes?: number;
  observations?: string;
  outcomes?: string;
  notes?: string;
  intervention_notes?: string;
  participation?: string;
  teacher?: { name?: string };
  therapy_plan?: { title?: string };
  therapyPlan?: { title?: string };
  child?: { id?: number; first_name?: string; last_name?: string };
};

type Props = {
  sessions: CalendarSession[];
  onSelectSession?: (session: CalendarSession) => void;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const statusColors: Record<DaySessionStatus, string> = {
  scheduled: colors.accent,
  completed: colors.success,
  cancelled: colors.textMuted,
  other: colors.warning,
};

function parseSessionDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sessionDisplayName(session: CalendarSession) {
  if (session.child) {
    return `${session.child.first_name || ''} ${session.child.last_name || ''}`.trim();
  }
  return session.title?.replace('Therapy — ', '') || 'Therapy session';
}

export function SessionCalendar({ sessions, onSelectSession }: Props) {
  const todayKey = dateKey(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState(todayKey);

  const sessionsByDay = useMemo(() => {
    const map: Record<string, CalendarSession[]> = {};
    sessions.forEach((session) => {
      const d = parseSessionDate(session.scheduled_at);
      if (!d) return;
      const key = dateKey(d);
      map[key] = map[key] ? [...map[key], session] : [session];
    });
    return map;
  }, [sessions]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedSessions = (sessionsByDay[selected] || []).sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
  );

  const shiftMonth = (delta: number) => {
    setCursor(new Date(year, month + delta, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(todayKey);
  };

  const weekStrip = useMemo(() => {
    const base = new Date(selected + 'T12:00:00');
    const start = new Date(base);
    start.setDate(base.getDate() - base.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return dateKey(d);
    });
  }, [selected]);

  return (
    <View style={styles.wrap}>
      <View style={styles.calendarCard}>
        <View style={styles.monthRow}>
          <TouchableOpacity style={styles.navBtn} onPress={() => shiftMonth(-1)} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity style={styles.navBtn} onPress={() => shiftMonth(1)} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.todayBtn} onPress={goToday}>
          <Ionicons name="today-outline" size={14} color={colors.primary} />
          <Text style={styles.todayText}>Today</Text>
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
          {weekStrip.map((key) => {
            const d = new Date(key + 'T12:00:00');
            const isSelected = key === selected;
            const isToday = key === todayKey;
            const hasSession = Boolean(sessionsByDay[key]?.length);
            return (
              <TouchableOpacity
                key={key}
                style={[styles.weekDay, isSelected && styles.weekDaySelected]}
                onPress={() => setSelected(key)}
              >
                <Text style={[styles.weekDayLabel, isSelected && styles.weekDayLabelSelected]}>
                  {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
                </Text>
                <Text style={[styles.weekDayNum, isToday && styles.weekDayToday, isSelected && styles.weekDayNumSelected]}>
                  {d.getDate()}
                </Text>
                {hasSession ? <View style={styles.weekDot} /> : <View style={styles.weekDotSpacer} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((day) => (
            <Text key={day} style={styles.weekday}>{day}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((day, index) => {
            if (!day) return <View key={`empty-${index}`} style={styles.cell} />;

            const key = dateKey(new Date(year, month, day));
            const dots = dayStatusDots(sessions, key);
            const isSelected = key === selected;
            const isToday = key === todayKey;

            return (
              <TouchableOpacity
                key={key}
                style={[styles.cell, isSelected && styles.cellSelected, isToday && !isSelected && styles.cellToday]}
                onPress={() => setSelected(key)}
              >
                <Text style={[styles.dayText, isToday && styles.dayToday, isSelected && styles.daySelected]}>
                  {day}
                </Text>
                {dots.length > 0 ? (
                  <View style={styles.dotRow}>
                    {dots.slice(0, 3).map((status, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: statusColors[status] }]} />
                    ))}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.legend}>
          <LegendDot color={statusColors.scheduled} label="Scheduled" />
          <LegendDot color={statusColors.completed} label="Done" />
          <LegendDot color={statusColors.cancelled} label="Cancelled" />
        </View>
      </View>

      <View style={styles.dayPanel}>
        <Text style={styles.dayTitle}>
          {new Date(selected + 'T12:00:00').toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}
        </Text>

        {selectedSessions.length === 0 ? (
          <View style={styles.emptyDay}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No sessions</Text>
            <Text style={styles.emptySub}>Nothing scheduled for this day.</Text>
          </View>
        ) : (
          selectedSessions.map((session, index) => {
            const time = parseSessionDate(session.scheduled_at)?.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            });
            const name = sessionDisplayName(session);
            const abbr = initials(name);
            const status = (session.status || 'scheduled') as DaySessionStatus;
            const statusColor = statusColors[status] || statusColors.other;
            const plan = session.therapy_plan?.title || session.therapyPlan?.title;
            const detailNote =
              session.observations ||
              session.outcomes ||
              session.notes ||
              session.intervention_notes;
            const detailParts = [
              session.duration_minutes ? `${session.duration_minutes} min` : null,
              session.teacher?.name ? `with ${session.teacher.name}` : null,
              plan || null,
            ].filter(Boolean);

            return (
              <View key={session.id} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[styles.timelineDot, { backgroundColor: statusColor }]} />
                  {index < selectedSessions.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <TouchableOpacity
                  style={styles.sessionCard}
                  onPress={() => onSelectSession?.(session)}
                  activeOpacity={0.85}
                >
                  <View style={styles.sessionTop}>
                    <Text style={styles.sessionTime}>{time}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>
                        {(session.status || 'scheduled').replace('_', ' ')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.sessionBody}>
                    <View style={styles.sessionAvatar}>
                      <Text style={styles.sessionAvatarText}>{abbr}</Text>
                    </View>
                    <View style={styles.sessionCopy}>
                      <Text style={styles.sessionTitle}>{name}</Text>
                      <Text style={styles.sessionSub}>
                        {detailParts.length ? detailParts.join(' · ') : 'Therapy session'}
                      </Text>
                      {session.participation ? (
                        <Text style={styles.sessionMeta}>
                          Participation: {session.participation}
                        </Text>
                      ) : null}
                      {detailNote ? (
                        <Text style={styles.sessionNote} numberOfLines={3}>
                          {detailNote}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontFamily: fonts.headingSemi, fontSize: 17, color: colors.text },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.md,
  },
  todayText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary },
  weekStrip: { gap: spacing.sm, marginBottom: spacing.md },
  weekDay: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.lg,
    minWidth: 44,
    gap: 2,
  },
  weekDaySelected: { backgroundColor: colors.primarySoft },
  weekDayLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted },
  weekDayLabelSelected: { color: colors.primary },
  weekDayNum: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.text },
  weekDayToday: { color: colors.primary },
  weekDayNumSelected: { color: colors.primary },
  weekDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent, marginTop: 2 },
  weekDotSpacer: { height: 6 },
  weekdayRow: { flexDirection: 'row', marginBottom: spacing.sm },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%` as `${number}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    paddingTop: 4,
  },
  cellSelected: { backgroundColor: colors.primarySoft },
  cellToday: { borderWidth: 1, borderColor: colors.primary },
  dayText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  dayToday: { color: colors.primary, fontFamily: fonts.headingSemi },
  daySelected: { color: colors.primary },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 3 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textMuted },
  dayPanel: { gap: spacing.sm },
  dayTitle: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.text, paddingHorizontal: spacing.xs },
  emptyDay: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.text },
  emptySub: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  timelineRow: { flexDirection: 'row', gap: spacing.md },
  timelineRail: { width: 16, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, marginTop: 20 },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.borderLight, marginTop: 4 },
  sessionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  sessionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sessionTime: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.primary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 11, textTransform: 'capitalize' },
  sessionBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sessionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionAvatarText: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.primary },
  sessionCopy: { flex: 1, gap: 2 },
  sessionTitle: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.text },
  sessionSub: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  sessionMeta: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  sessionNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 4,
  },
});
