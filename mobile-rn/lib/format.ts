/** Human-readable dates from API strings (ISO or YYYY-MM-DD). */
export function formatDate(value?: string | null, style: 'medium' | 'short' | 'relative' = 'medium'): string {
  if (!value) return '';

  const raw = value.includes('T') ? value : `${value}T12:00:00`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return value;

  if (style === 'relative') {
    const diffMs = Date.now() - date.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
  }

  if (style === 'short') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function childName(child?: { first_name?: string; last_name?: string }): string {
  if (!child) return '';
  return `${child.first_name || ''} ${child.last_name || ''}`.trim();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}
