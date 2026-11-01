import { StyleSheet, View } from 'react-native';
import { AuthImage } from './AuthImage';
import { spacing, radii } from '../lib/theme';

export type ProgressPhoto = {
  id: number;
  download_path?: string;
  original_filename?: string;
};

type Props = {
  photos?: ProgressPhoto[] | null;
};

export function ProgressPhotoGrid({ photos }: Props) {
  const list = Array.isArray(photos) ? photos.filter((p) => p?.download_path) : [];
  if (!list.length) return null;

  return (
    <View style={styles.grid}>
      {list.map((photo) => (
        <AuthImage key={photo.id} path={String(photo.download_path)} style={styles.thumb} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
  },
});
