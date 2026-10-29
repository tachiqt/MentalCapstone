import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { colors } from './theme';

export type AppNotification = {
  id: number;
  title?: string;
  message?: string;
  body?: string;
  type?: string;
  data?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at?: string;
};

type Envelope = {
  notifications?: AppNotification[];
  data?: AppNotification[];
  unread?: number;
};

/** Matches the web dashboard's 45s notification poll. */
const POLL_INTERVAL = 45_000;

export const NOTIFICATIONS_KEY = ['notifications'] as const;

type TypeMeta = {
  label: string;
  icon: string;
  accent: string;
  background: string;
};

const TYPE_META: Record<string, TypeMeta> = {
  'record.child': { label: 'Child', icon: 'people-outline', accent: colors.green800, background: colors.green100 },
  'record.assignment': { label: 'Assignment', icon: 'person-add-outline', accent: colors.green800, background: colors.green100 },
  'record.therapy': { label: 'Therapy', icon: 'calendar-outline', accent: colors.green700, background: colors.green50 },
  'record.therapy_plan': { label: 'Therapy plan', icon: 'clipboard-outline', accent: colors.green700, background: colors.green50 },
  'record.medication': { label: 'Medication', icon: 'medkit-outline', accent: '#0891B2', background: '#E0F7FA' },
  'record.medication_log': { label: 'Dose logged', icon: 'checkmark-done-outline', accent: '#027A48', background: '#D1FADF' },
  'record.progress': { label: 'Progress', icon: 'ribbon-outline', accent: '#7C3AED', background: '#EDE9FE' },
  'record.assessment': { label: 'Assessment', icon: 'document-text-outline', accent: colors.green800, background: colors.green100 },
  'record.recommendation': { label: 'AI insight', icon: 'sparkles-outline', accent: '#B54708', background: '#FEF0C7' },
  'record.feedback': { label: 'Feedback', icon: 'chatbubble-outline', accent: '#0891B2', background: '#E0F7FA' },
  'record.material': { label: 'Material', icon: 'library-outline', accent: colors.green700, background: colors.green50 },
  'record.staff': { label: 'Staff', icon: 'briefcase-outline', accent: colors.green800, background: colors.green100 },
  'account.updated': { label: 'Account', icon: 'person-circle-outline', accent: colors.green800, background: colors.green100 },
  'schedule.therapy': { label: 'Session due', icon: 'alarm-outline', accent: '#B54708', background: '#FEF0C7' },
  'schedule.medication': { label: 'Dose due', icon: 'alarm-outline', accent: '#B42318', background: '#FEE4E2' },
};

const FALLBACK: TypeMeta = {
  label: 'Update',
  icon: 'notifications-outline',
  accent: colors.green800,
  background: colors.green50,
};

export function typeMeta(type?: string | null): TypeMeta {
  const key = (type || '').toLowerCase();
  if (TYPE_META[key]) return TYPE_META[key];

  // Types can be added server-side faster than this table, so degrade by keyword
  // rather than dropping straight to the generic bell.
  if (key.includes('med')) return TYPE_META['record.medication'];
  if (key.includes('therap') || key.includes('session')) return TYPE_META['record.therapy'];
  if (key.includes('progress') || key.includes('milestone')) return TYPE_META['record.progress'];
  if (key.includes('feedback') || key.includes('message')) return TYPE_META['record.feedback'];
  if (key.startsWith('schedule.')) return TYPE_META['schedule.therapy'];
  return FALLBACK;
}

/**
 * Single source of truth for the notification list and the unread count, so the
 * header bell and the notifications screen can never disagree.
 */
export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => api<AppNotification[] | Envelope>('/notifications'),
    refetchInterval: POLL_INTERVAL,
    staleTime: POLL_INTERVAL,
  });

  const envelope = (query.data || {}) as Envelope;
  const raw = Array.isArray(query.data)
    ? query.data
    : envelope.notifications || envelope.data || [];
  const notifications = Array.isArray(raw) ? raw : [];

  // Trust the server count when present; fall back to the page we already have.
  const unread =
    typeof envelope.unread === 'number'
      ? envelope.unread
      : notifications.filter((n) => !n.read_at).length;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

  const markRead = useMutation({
    mutationFn: (id: number) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: invalidate,
  });

  return {
    notifications,
    unread,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error as Error | null,
    refetch: query.refetch,
    markRead,
    markAllRead,
  };
}

/** Lightweight subscriber for the header bell — shares the cache with the screen. */
export function useUnreadCount(): number {
  const { data } = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => api<AppNotification[] | Envelope>('/notifications'),
    refetchInterval: POLL_INTERVAL,
    staleTime: POLL_INTERVAL,
  });

  if (Array.isArray(data)) return data.filter((n) => !n.read_at).length;
  const envelope = (data || {}) as Envelope;
  if (typeof envelope.unread === 'number') return envelope.unread;
  return (envelope.notifications || envelope.data || []).filter((n) => !n.read_at).length;
}
