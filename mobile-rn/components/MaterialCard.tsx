import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from './ui/Badge';
import { alpha, colors, fonts, radii, shadows, spacing } from '../lib/theme';
import {
  LearningMaterial,
  getMaterialFileUrl,
  getMediaKind,
  getTypeMeta,
} from '../lib/materials';

type Props = {
  material: LearningMaterial;
  onPress: () => void;
};

export function MaterialCard({ material, onPress }: Props) {
  const meta = getTypeMeta(material.type);
  const fileUrl = getMaterialFileUrl(material);
  const kind = getMediaKind(material);
  const isImage = kind === 'image' && fileUrl;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.preview}>
        {isImage ? (
          <Image source={{ uri: fileUrl }} style={styles.previewImage} resizeMode="cover" />
        ) : (
          <View style={[styles.previewFallback, { backgroundColor: meta.background }]}>
            <Ionicons name={meta.icon as any} size={36} color={meta.accent} />
          </View>
        )}

        {kind === 'video' && (
          <View style={styles.playBadge}>
            <Ionicons name="play" size={18} color="#FFF" />
          </View>
        )}

        <View style={styles.typePill}>
          <Text style={[styles.typeText, { color: meta.accent }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{material.title}</Text>
        {material.description ? (
          <Text style={styles.description} numberOfLines={2}>{material.description}</Text>
        ) : null}

        <View style={styles.footer}>
          {fileUrl ? (
            <View style={styles.fileHint}>
              <Ionicons name="open-outline" size={14} color={colors.primary} />
              <Text style={styles.fileHintText}>Tap to view</Text>
            </View>
          ) : (
            <Text style={styles.noFile}>Details only</Text>
          )}
          {material.uploader?.name ? (
            <Text style={styles.uploader} numberOfLines={1}>{material.uploader.name}</Text>
          ) : null}
        </View>

        {material.tags && material.tags.length > 0 ? (
          <View style={styles.tags}>
            {material.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} label={tag} tone="neutral" />
            ))}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  preview: {
    height: 160,
    backgroundColor: colors.surfaceMuted,
    position: 'relative',
  },
  previewImage: { width: '100%', height: '100%' },
  previewFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -22,
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 76, 74, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  typeText: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.green900, lineHeight: 22 },
  description: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  fileHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fileHintText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary },
  noFile: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  uploader: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, textAlign: 'right' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
});
