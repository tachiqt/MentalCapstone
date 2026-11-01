import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { childName } from '../../../lib/format';
import { recordChildId } from '../../../lib/parent-metrics';
import { ProgressPhotoGrid, ProgressPhoto } from '../../../components/ProgressPhotoGrid';
import { colors, fonts, spacing, radii, shadows } from '../../../lib/theme';

type Child = { id: number; first_name?: string; last_name?: string };
type ProgressRecord = {
  id: number;
  child_id?: number;
  child?: Child;
  photos?: ProgressPhoto[];
};

export default function FeedbackScreen() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [childId, setChildId] = useState<number | null>(null);

  const { data: childrenData } = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[]>('/children'),
  });
  const { data: progressData } = useQuery({
    queryKey: ['progress'],
    queryFn: () => api<ProgressRecord[]>('/progress'),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['parent-feedback'],
    queryFn: () => api('/parent-feedback'),
  });

  const children = Array.isArray(childrenData) ? childrenData : [];
  const selectedChildId = childId ?? children[0]?.id ?? null;
  const careTeamPhotos = useMemo(() => {
    const records = Array.isArray(progressData) ? progressData : [];
    return records
      .filter((r) => recordChildId(r) === selectedChildId)
      .flatMap((r) => (Array.isArray(r.photos) ? r.photos : []))
      .filter((p) => p?.download_path)
      .slice(0, 12);
  }, [progressData, selectedChildId]);

  const submitMutation = useMutation({
    mutationFn: (body: { message: string; child_id: number }) =>
      api('/parent-feedback', { method: 'POST', body }),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['parent-feedback'] });
    },
  });

  const feedbacks = data?.data || data || [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {children.length > 1 ? (
          <View style={styles.chipRow}>
            {children.map((child) => {
              const active = selectedChildId === child.id;
              return (
                <TouchableOpacity
                  key={child.id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setChildId(child.id)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {child.first_name || childName(child)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {careTeamPhotos.length > 0 ? (
          <View style={styles.photosBlock}>
            <Text style={styles.photosTitle}>Photos from the care team</Text>
            <Text style={styles.photosHint}>Displayed for viewing — no download required.</Text>
            <ProgressPhotoGrid photos={careTeamPhotos} />
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Share your feedback..."
          placeholderTextColor={colors.textMuted}
          value={message}
          onChangeText={setMessage}
          multiline
        />
        <TouchableOpacity
          style={styles.btnSubmit}
          onPress={() => {
            if (!message.trim()) return Alert.alert('Error', 'Please enter feedback');
            if (!selectedChildId) return Alert.alert('Error', 'Select a child');
            submitMutation.mutate({ message: message.trim(), child_id: selectedChildId });
          }}
        >
          <Text style={styles.btnSubmitText}>
            {submitMutation.isPending ? 'Sending…' : 'Submit'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={feedbacks}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ padding: spacing.lg }}
          renderItem={({ item }: { item: any }) => (
            <View style={styles.card}>
              <Text style={styles.cardBody}>{item.message}</Text>
              {item.staff_response ? (
                <Text style={styles.cardMeta}>Staff: {item.staff_response}</Text>
              ) : null}
              <Text style={styles.cardMeta}>{item.created_at}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No feedback submitted yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  form: { padding: spacing.lg, gap: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  photosBlock: { gap: 4 },
  photosTitle: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.green900 },
  photosHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.lg,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  btnSubmit: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radii.md, alignItems: 'center' },
  btnSubmitText: { fontFamily: fonts.headingSemi, fontSize: 15, color: colors.white },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  cardBody: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  cardMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
});
