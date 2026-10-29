import { useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '../../lib/format';
import { Screen } from '../../components/ui/Screen';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { SkeletonCard } from '../../components/ui/SkeletonCard';
import { IconSquircle } from '../../components/ui/IconSquircle';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { AppNotification, typeMeta, useNotifications } from '../../lib/notifications';
import { alpha, colors, fonts, shadows, spacing, radii, layout } from '../../lib/theme';

type Filter = 'all' | 'unread';

function isToday(value?: string) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
}

function timeLabel(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(value)) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return formatDate(value, 'relative') || formatDate(value, 'medium');
}

export default function NotificationsScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const {
    notifications,
    unread,
    isLoading,
    isRefetching,
    error,
    refetch,
    markRead,
    markAllRead,
  } = useNotifications();

  const sections = useMemo(() => {
    const visible = filter === 'unread' ? notifications.filter((n) => !n.read_at) : notifications;
    const today = visible.filter((n) => isToday(n.created_at));
    const earlier = visible.filter((n) => !isToday(n.created_at));
    return [
      ...(today.length ? [{ title: 'Today', data: today }] : []),
      ...(earlier.length ? [{ title: 'Earlier', data: earlier }] : []),
    ];
  }, [notifications, filter]);

  const header = (
    <ScreenHeader
      title="Notifications"
      action={
        unread > 0 ? (
          <TouchableOpacity
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
          >
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : null
      }
    />
  );

  if (isLoading) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <View style={styles.pad}>
          <SkeletonCard height={72} />
          <SkeletonCard height={72} />
          <SkeletonCard height={72} />
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <ErrorState
          title="Couldn't load notifications"
          message={error.message}
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      {header}
      <View style={styles.toolbar}>
        <SegmentedControl<Filter>
          options={[
            { key: 'all', label: 'All', count: notifications.length },
            { key: 'unread', label: 'Unread', count: unread },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <Text style={styles.summary}>
          {unread > 0 ? `${unread} unread update${unread === 1 ? '' : 's'}` : 'Everything is read'}
        </Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.green800}
            colors={[colors.green800]}
          />
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item }) => <Row item={item} onRead={(id) => markRead.mutate(id)} />}
        ListEmptyComponent={
          filter === 'unread' ? (
            <EmptyState
              title="Nothing unread"
              message="You've read everything. New alerts will show up here."
              icon="checkmark-done-outline"
            />
          ) : (
            <EmptyState
              title="You're all caught up"
              message="New therapy, medication, and progress alerts will appear here."
              icon="notifications-off-outline"
            />
          )
        }
      />
    </Screen>
  );
}

function Row({ item, onRead }: { item: AppNotification; onRead: (id: number) => void }) {
  const unread = !item.read_at;
  const meta = typeMeta(item.type);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => unread && onRead(item.id)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title || 'Notification'}${unread ? ', unread' : ''}`}
      style={[styles.card, unread && styles.cardUnread]}
    >
      <IconSquircle
        icon={meta.icon as never}
        accent={meta.accent}
        background={unread ? meta.background : colors.green50}
      />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, unread && styles.titleUnread]} numberOfLines={2}>
            {item.title || 'Notification'}
          </Text>
          {unread ? <View style={styles.dot} /> : null}
        </View>
        {item.message || item.body ? (
          <Text style={styles.message}>{item.message || item.body}</Text>
        ) : null}
        <View style={styles.metaRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{meta.label}</Text>
          </View>
          <Text style={styles.time}>{timeLabel(item.created_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pad: { padding: layout.screenPadding, gap: spacing.md },
  toolbar: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  markAll: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.green800,
  },
  summary: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  list: {
    padding: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.massive,
    gap: spacing.md,
    flexGrow: 1,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemi,
    fontSize: 11,
    color: colors.green700,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    alignItems: 'flex-start',
  },
  // The red dot and the bolder title carry "unread"; the surface only needs to
  // lift off the page, not wear a colored edge stripe.
  cardUnread: {
    backgroundColor: colors.tint100,
    borderColor: alpha.a22,
    ...shadows.md,
  },
  body: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: {
    flex: 1,
    fontFamily: fonts.headingSemi,
    fontSize: 15,
    color: colors.green900,
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  titleUnread: { fontFamily: fonts.heading },
  message: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    backgroundColor: colors.green100,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipText: {
    fontFamily: fonts.bodySemi,
    fontSize: 10,
    color: colors.green800,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  time: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  // The one non-green signal in the UI, so unread actually reads as urgent.
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    marginTop: 6,
  },
});
