import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { childName } from '../../../lib/format';
import { sessionStats } from '../../../lib/parent-metrics';
import { Screen } from '../../../components/ui/Screen';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { SessionCalendar, CalendarSession } from '../../../components/SessionCalendar';
import { AvatarChip } from '../../../components/parent/AvatarChip';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type Child = { id: number; first_name?: string; last_name?: string; diagnosis?: string };

export default function ScheduleScreen() {
  const [selectedChildId, setSelectedChildId] = useState<number | 'all'>('all');

  const { data: children, isLoading: loadingChildren } = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[]>('/children'),
  });

  const childIdParam = selectedChildId === 'all' ? '' : `?child_id=${selectedChildId}`;
  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ['therapy-sessions', selectedChildId],
    queryFn: () => api<CalendarSession[]>(`/therapy-sessions${childIdParam}`),
  });

  if (loadingChildren || loadingSessions) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.scroll}>
          <SkeletonCard height={60} />
          <SkeletonCard height={80} />
          <SkeletonCard height={280} />
        </ScrollView>
      </Screen>
    );
  }

  const childList = Array.isArray(children) ? children : [];
  const allSessions = Array.isArray(sessions) ? sessions : [];

  const childIds = new Set(childList.map((c) => c.id));
  const mySessions = allSessions.filter((s) => {
    const id = s.child_id ?? s.child?.id;
    return id ? childIds.has(id) : false;
  });

  const stats = sessionStats(mySessions);
  const selectedChild = selectedChildId === 'all' ? null : childList.find((c) => c.id === selectedChildId);

  if (!childList.length) {
    return (
      <Screen>
        <EmptyState
          title="No therapy schedule yet"
          message="Sessions will appear here once your care team schedules them."
          icon="calendar-outline"
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeader
          title="Therapy schedule"
          subtitle={
            selectedChild
              ? `Sessions for ${childName(selectedChild)}`
              : `Care calendar for your ${childList.length} child${childList.length === 1 ? '' : 'ren'}`
          }
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <AvatarChip label="All" active={selectedChildId === 'all'} onPress={() => setSelectedChildId('all')} />
          {childList.map((child) => (
            <AvatarChip
              key={child.id}
              label={child.first_name || childName(child)}
              active={selectedChildId === child.id}
              onPress={() => setSelectedChildId(child.id)}
            />
          ))}
        </ScrollView>

        <View style={styles.summary}>
          <SummaryCell label="This month" value={stats.totalThisMonth} />
          <View style={styles.summaryDivider} />
          <SummaryCell label="Upcoming" value={stats.upcoming} />
          <View style={styles.summaryDivider} />
          <SummaryCell label="Completed" value={stats.completed} />
        </View>

        <SessionCalendar sessions={mySessions} />
      </ScrollView>
    </Screen>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive,
    gap: layout.sectionGap,
  },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  summary: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    paddingVertical: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  summaryCell: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.text },
  summaryLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  summaryDivider: { width: 1, backgroundColor: colors.borderLight, marginVertical: 4 },
});
