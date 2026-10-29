import { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../lib/api';
import { childName } from '../../../lib/format';
import { Screen } from '../../../components/ui/Screen';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { Badge } from '../../../components/ui/Badge';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ChildAvatar } from '../../../components/ui/ChildAvatar';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type Child = {
  id: number;
  first_name?: string;
  last_name?: string;
  diagnosis?: string;
  age_band?: number;
  age?: number;
};

type Dose = {
  id: number;
  dose_key?: string;
  child_id?: number;
  child_name?: string;
  medication_name?: string;
  name?: string;
  dosage?: string;
  scheduled_time?: string;
  time?: string;
  time_of_day?: string;
  times_of_day?: string[];
  status?: string;
  logged_today?: boolean;
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
  const hm = value.match(/(\d{1,2}):(\d{2})/);
  if (!hm) return null;
  const d = new Date();
  d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
  return d;
}

function formatClock(value?: string) {
  const d = parseTime(value);
  if (!d) return value ? String(value).slice(0, 5) : '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function doseStatus(dose: Dose): { label: string; tone: 'success' | 'warning' | 'danger' | 'accent' | 'neutral' } {
  if (dose.status === 'given' || (dose.logged_today && dose.status !== 'missed' && dose.status !== 'skipped')) {
    return { label: 'Given', tone: 'success' };
  }
  if (dose.status === 'missed' || dose.status === 'skipped') {
    return { label: dose.status === 'missed' ? 'Missed' : 'Skipped', tone: 'danger' };
  }
  const t = parseTime(doseWhen(dose));
  if (t && t.getTime() > Date.now()) return { label: 'Upcoming', tone: 'accent' };
  return { label: 'Due', tone: 'warning' };
}

export default function ChildrenScreen() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const { data: childrenData, isLoading: loadingChildren } = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[] | { data: Child[] }>('/children'),
  });
  const { data: dosesData, isLoading: loadingDoses } = useQuery({
    queryKey: ['today-doses'],
    queryFn: () => api<Dose[] | { data: Dose[] }>('/medication-schedules?today=1'),
  });

  if (loadingChildren || loadingDoses) {
    return (
      <Screen>
        <View style={styles.pad}>
          <SkeletonCard height={88} />
          <SkeletonCard height={88} />
        </View>
      </Screen>
    );
  }

  const rawChildren = (childrenData as { data?: Child[] })?.data || childrenData || [];
  const children = (Array.isArray(rawChildren) ? rawChildren : []) as Child[];
  const rawDoses = (dosesData as { data?: Dose[] })?.data || dosesData || [];
  const doses = (Array.isArray(rawDoses) ? rawDoses : []) as Dose[];

  const dosesByChild = new Map<number, Dose[]>();
  doses.forEach((d) => {
    if (!d.child_id) return;
    const list = dosesByChild.get(d.child_id) || [];
    list.push(d);
    dosesByChild.set(d.child_id, list);
  });
  dosesByChild.forEach((list, childId) => {
    dosesByChild.set(
      childId,
      list.slice().sort((a, b) => {
        const at = parseTime(doseWhen(a))?.getTime() ?? 0;
        const bt = parseTime(doseWhen(b))?.getTime() ?? 0;
        return at - bt;
      })
    );
  });

  const toggle = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Screen>
      <FlatList
        data={children}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <SectionHeader title="Children" subtitle="Children assigned to your care today" />
        }
        renderItem={({ item }) => {
          const name = childName(item);
          const age = item.age_band ?? item.age;
          const childDoses = dosesByChild.get(item.id) || [];
          const todayCount = childDoses.length;
          const open = !!expanded[item.id];

          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => toggle(item.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${name}, ${todayCount} medication doses today`}
            >
              <View style={styles.headerRow}>
                <ChildAvatar name={name} size={48} />
                <View style={styles.copy}>
                  <Text style={styles.name}>{name}</Text>
                  <View style={styles.metaRow}>
                    {age != null ? <Text style={styles.meta}>Age {age}</Text> : null}
                    {item.diagnosis ? <Badge label={item.diagnosis} tone="accent" /> : null}
                  </View>
                  <Text style={styles.doses}>
                    {todayCount > 0
                      ? `${todayCount} medication dose${todayCount === 1 ? '' : 's'} today`
                      : 'No doses scheduled today'}
                    {todayCount > 0 && !open ? ' · Tap to view' : ''}
                  </Text>
                </View>
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                  style={styles.chevron}
                />
              </View>

              {open ? (
                <View style={styles.scheduleBox}>
                  <Text style={styles.scheduleLabel}>Scheduled today</Text>
                  {childDoses.length === 0 ? (
                    <Text style={styles.emptySchedule}>No medications scheduled for today.</Text>
                  ) : (
                    childDoses.map((dose) => {
                      const status = doseStatus(dose);
                      const med = dose.medication_name || dose.name || 'Medication';
                      const when = formatClock(doseWhen(dose));
                      return (
                        <View
                          key={dose.dose_key || `${dose.id}-${doseWhen(dose)}`}
                          style={styles.doseRow}
                        >
                          <View style={styles.doseCopy}>
                            <Text style={styles.medName}>{med}</Text>
                            <Text style={styles.doseMeta}>
                              {when}
                              {dose.dosage ? ` · ${dose.dosage}` : ''}
                            </Text>
                          </View>
                          <StatusBadge label={status.label} tone={status.tone} />
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No children assigned"
            message="Children linked to your caretaker account will appear here."
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.md,
    ...shadows.sm,
  },
  headerRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  copy: { flex: 1, gap: 6 },
  chevron: { marginTop: 4 },
  name: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.green900 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  doses: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  scheduleBox: {
    backgroundColor: colors.tint100,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  scheduleLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptySchedule: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: alpha.a08,
  },
  doseCopy: { flex: 1, gap: 2 },
  medName: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.green900 },
  doseMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
});
