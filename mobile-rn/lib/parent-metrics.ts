type ChildLike = { id: number; first_name?: string; last_name?: string };
type RecordLike = { child_id?: number; recorded_on?: string; child?: ChildLike };
type SessionLike = { scheduled_at: string; status?: string; child_id?: number };
type MedLogLike = { status: string };

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const raw = value.includes('T') ? value : `${value}T12:00:00`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function recordChildId(record: RecordLike): number | undefined {
  return record.child_id ?? record.child?.id;
}

export function milestonesThisMonth(records: RecordLike[]): number {
  const now = new Date();
  return records.filter((r) => {
    const d = parseDate(r.recorded_on);
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
}

export function milestonesByChild(
  records: RecordLike[],
  children: ChildLike[],
): { label: string; value: number; color?: string }[] {
  const palette = ['#0F4C4A', '#0891B2', '#12B76A', '#F79009'];
  return children.map((child, i) => {
    const count = records.filter((r) => recordChildId(r) === child.id).length;
    const label = `${child.first_name || ''} ${child.last_name || ''}`.trim() || 'Child';
    return { label: child.first_name || label, value: count, color: palette[i % palette.length] };
  });
}

export function milestonesByWeek(records: RecordLike[], weeks = 6): { label: string; value: number }[] {
  const result: { label: string; value: number }[] = [];
  const now = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - i * 7 - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const count = records.filter((r) => {
      const d = parseDate(r.recorded_on);
      return d && d >= weekStart && d <= weekEnd;
    }).length;

    const label = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    result.push({ label, value: count });
  }

  return result;
}

export function medAdherenceRate(logs: MedLogLike[]): number {
  if (!logs.length) return 0;
  const given = logs.filter((l) => l.status === 'given').length;
  return Math.round((given / logs.length) * 100);
}

export function sessionStats(sessions: SessionLike[]) {
  const now = new Date();
  const thisMonth = sessions.filter((s) => {
    const d = new Date(s.scheduled_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const upcoming = sessions.filter((s) => {
    const d = new Date(s.scheduled_at);
    return !Number.isNaN(d.getTime()) && d >= now && s.status !== 'cancelled';
  }).length;

  const completed = thisMonth.filter((s) => s.status === 'completed').length;
  const cancelled = thisMonth.filter((s) => s.status === 'cancelled').length;
  const totalThisMonth = thisMonth.length;
  const attendanceRate = totalThisMonth > 0 ? Math.round((completed / totalThisMonth) * 100) : 0;

  return { upcoming, completed, cancelled, totalThisMonth, attendanceRate };
}

export type DaySessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'other';

export function sessionsForDay(sessions: SessionLike[], key: string): SessionLike[] {
  return sessions.filter((s) => {
    const d = new Date(s.scheduled_at);
    if (Number.isNaN(d.getTime())) return false;
    return dateKey(d) === key;
  });
}

export function dayStatusDots(sessions: SessionLike[], key: string): DaySessionStatus[] {
  return sessionsForDay(sessions, key).map((s) => {
    if (s.status === 'completed') return 'completed';
    if (s.status === 'cancelled') return 'cancelled';
    if (s.status === 'scheduled' || !s.status) return 'scheduled';
    return 'other';
  });
}

export function greetingName(fullName?: string): string {
  if (!fullName) return 'there';
  return fullName.split(/\s+/)[0] || fullName;
}

export function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
