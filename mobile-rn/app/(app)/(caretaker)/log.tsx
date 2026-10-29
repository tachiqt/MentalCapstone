import { useState } from 'react';
import { View, Text, SectionList, StyleSheet, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { Screen } from '../../../components/ui/Screen';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type Log = {
  id: number;
  medication_name?: string;
  status: string;
  child_name?: string;
  notes?: string;
  logged_at?: string;
  administered_at?: string;
  created_at?: string;
};

function isToday(value?: string) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function logStamp(item: Log) {
  return item.logged_at || item.administered_at || item.created_at;
}

function formatLogWhen(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday(value)) return time;
  const date = formatDate(value, 'medium') || formatDate(value, 'short');
  return date ? `${date} · ${time}` : time;
}

function toneFor(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'given') return 'success';
  if (status === 'missed' || status === 'refused') return 'danger';
  if (status === 'skipped' || status === 'partial') return 'warning';
  return 'neutral';
}

export default function LogScreen() {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const { data, isLoading } = useQuery({
    queryKey: ['medication-logs'],
    queryFn: () => api<Log[] | { data: Log[] }>('/medication-logs'),
  });

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.pad}>
          <SkeletonCard height={72} />
          <SkeletonCard height={72} />
          <SkeletonCard height={72} />
        </View>
      </Screen>
    );
  }

  const raw = (data as { data?: Log[] })?.data || data || [];
  const logs = (Array.isArray(raw) ? raw : []) as Log[];
  const today = logs.filter((l) => isToday(logStamp(l)));
  const earlier = logs.filter((l) => !isToday(logStamp(l)));

  const sections = [
    ...(today.length ? [{ title: 'Today', data: today }] : []),
    ...(earlier.length ? [{ title: 'Earlier', data: earlier }] : []),
  ];

  const toggle = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Screen>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <SectionHeader title="Medication log" subtitle="History of doses you have recorded" />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const when = formatLogWhen(logStamp(item));
          const hasNote = Boolean(item.notes?.trim());
          const open = !!expanded[item.id];
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => toggle(item.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${item.medication_name || 'Medication'} log${hasNote ? ', has note' : ''}`}
            >
              <View style={styles.row}>
                <View style={styles.copy}>
                  <Text style={styles.title}>{item.medication_name || 'Medication'}</Text>
                  <Text style={styles.meta}>
                    {item.child_name || 'Child'}
                    {when ? ` · ${when}` : ''}
                  </Text>
                  {!open && hasNote ? (
                    <Text style={styles.noteHint}>Tap to view note</Text>
                  ) : null}
                </View>
                <View style={styles.trailing}>
                  <StatusBadge label={item.status} tone={toneFor(item.status)} />
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textMuted}
                  />
                </View>
              </View>

              {open ? (
                <View style={styles.noteBox}>
                  <Text style={styles.noteLabel}>Note</Text>
                  <Text style={styles.notes}>
                    {hasNote ? item.notes : 'No note recorded for this dose.'}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No logs recorded yet"
            message="Doses you mark as given or skipped will appear here."
            icon="list-outline"
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
  sectionTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.md,
    ...shadows.sm,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  copy: { flex: 1, gap: 4 },
  trailing: { alignItems: 'flex-end', gap: spacing.sm, paddingTop: 2 },
  title: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.green900 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  noteHint: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary, marginTop: 2 },
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
  notes: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
});
