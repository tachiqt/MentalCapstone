import { resolveMediaUrl } from './config';

export type LearningMaterial = {
  id: number;
  title: string;
  description?: string | null;
  type?: string | null;
  file_path?: string | null;
  file_url?: string | null;
  tags?: string[] | null;
  child_id?: number | null;
  uploaded_by?: number;
  uploader?: { id: number; name: string; username?: string };
  created_at?: string;
};

export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'none';

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'm4v']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac']);
const DOC_EXT = new Set(['doc', 'docx']);

export function getMaterialFileUrl(material: LearningMaterial): string | null {
  return resolveMediaUrl(material.file_url || material.file_path);
}

function extensionFromUrl(url?: string | null): string {
  if (!url) return '';
  const clean = url.split('?')[0];
  return clean.split('.').pop()?.toLowerCase() || '';
}

export function getMediaKind(material: LearningMaterial): MediaKind {
  const url = material.file_url || material.file_path || '';
  const ext = extensionFromUrl(url);

  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (DOC_EXT.has(ext)) return 'document';
  // Fall back to declared type only when extension is unknown.
  if (!ext) {
    if (material.type === 'visual') return 'image';
    if (material.type === 'video') return 'video';
    if (material.type === 'audio') return 'audio';
    if (material.type === 'worksheet' || material.type === 'guide') return 'pdf';
  }
  if (url) return 'document';
  return 'none';
}

export const MATERIAL_TYPE_META: Record<
  string,
  { label: string; icon: string; accent: string; background: string }
> = {
  worksheet: { label: 'Worksheet', icon: 'document-text-outline', accent: '#0891B2', background: '#E0F7FA' },
  visual: { label: 'Visual', icon: 'image-outline', accent: '#7C3AED', background: '#EDE9FE' },
  video: { label: 'Video', icon: 'videocam-outline', accent: '#DC2626', background: '#FEE2E2' },
  audio: { label: 'Audio', icon: 'musical-notes-outline', accent: '#EA580C', background: '#FFEDD5' },
  activity: { label: 'Activity', icon: 'extension-puzzle-outline', accent: '#059669', background: '#D1FAE5' },
  guide: { label: 'Guide', icon: 'book-outline', accent: '#0F4C4A', background: '#E6F4F3' },
};

export function getTypeMeta(type?: string | null) {
  return MATERIAL_TYPE_META[type || ''] || {
    label: type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Resource',
    icon: 'folder-open-outline',
    accent: '#667085',
    background: '#F2F4F7',
  };
}

export function getMediaKindLabel(kind: MediaKind): string {
  switch (kind) {
    case 'image': return 'Image';
    case 'video': return 'Video';
    case 'audio': return 'Audio';
    case 'pdf': return 'PDF';
    case 'document': return 'Document';
    default: return 'Preview';
  }
}
