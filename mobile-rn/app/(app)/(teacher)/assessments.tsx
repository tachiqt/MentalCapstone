import { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { childName, formatDate } from '../../../lib/format';
import { Screen } from '../../../components/ui/Screen';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type AiGenerationStatus = 'none' | 'pending_review' | 'approved' | 'modified';

type AssessmentListItem = {
  id: number;
  child_id: number;
  status?: string;
  severity_level?: string;
  notes?: string;
  created_at?: string;
  ai_generation_status?: AiGenerationStatus;
  child?: { first_name?: string; last_name?: string };
  checklist?: { title?: string };
  psychometrician?: { name?: string };
};

type AssessmentResponse = {
  id: number;
  score?: string | null;
  comment?: string | null;
  checklist_item?: { prompt?: string; domain?: string };
};

type AssessmentDetail = AssessmentListItem & {
  responses?: AssessmentResponse[];
};

function aiStatusLabel(status?: AiGenerationStatus) {
  switch (status) {
    case 'pending_review':
      return 'Awaiting review';
    case 'approved':
      return 'AI approved';
    case 'modified':
      return 'AI modified';
    default:
      return 'Ready for AI';
  }
}

function aiStatusTone(status?: AiGenerationStatus): 'accent' | 'success' | 'neutral' {
  if (status === 'none' || !status) return 'accent';
  if (status === 'pending_review') return 'accent';
  return 'success';
}

export default function TeacherAssessmentsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['assessments'],
    queryFn: () => api<AssessmentListItem[]>('/assessments'),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['assessment', selectedId],
    queryFn: () => api<AssessmentDetail>(`/assessments/${selectedId}`),
    enabled: selectedId != null,
  });

  const generateMutation = useMutation({
    mutationFn: async (assessment: AssessmentDetail) => {
      const childId = assessment.child_id;
      return api(`/children/${childId}/recommendations/generate`, {
        method: 'POST',
        body: { assessment_id: assessment.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      queryClient.invalidateQueries({ queryKey: ['assessment', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      setSelectedId(null);
      Alert.alert(
        'Recommendation created',
        'The AI draft is ready for your review.',
        [{ text: 'Review now', onPress: () => router.push('/(app)/(teacher)/ai-review') }, { text: 'Later' }]
      );
    },
    onError: (err: Error) => {
      Alert.alert('Could not generate', err.message || 'Please try again.');
    },
  });

  const assessments = useMemo(() => {
    const raw = Array.isArray(data) ? data : [];
    return raw.filter((a) => (a.status || 'finalized') === 'finalized');
  }, [data]);

  const active = detail || assessments.find((a) => a.id === selectedId);
  const canGenerate = active?.ai_generation_status === 'none';

  return (
    <Screen>
      <ScreenHeader title="Assessments" />
      <Text style={styles.screenSubtitle}>Submitted results for your assigned children</Text>
      {isLoading ? (
        <View style={styles.pad}>
          <SkeletonCard height={88} />
          <SkeletonCard height={88} />
        </View>
      ) : (
        <FlatList
          data={assessments}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const name = childName(item.child);
            const title = item.checklist?.title || 'Assessment';
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => setSelectedId(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open assessment for ${name}`}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{title}</Text>
                  <Badge
                    label={aiStatusLabel(item.ai_generation_status)}
                    tone={aiStatusTone(item.ai_generation_status)}
                  />
                </View>
                <Text style={styles.cardChild}>{name}</Text>
                <Text style={styles.cardMeta}>
                  {formatDate(item.created_at, 'medium')}
                  {item.psychometrician?.name ? ` · ${item.psychometrician.name}` : ''}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No assessments yet"
              message="When a psychometrician submits an assessment for your children, it will appear here."
              icon="clipboard-outline"
            />
          }
        />
      )}

      <Modal visible={selectedId != null} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedId(null)} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.green900} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Assessment detail</Text>
            <View style={{ width: 24 }} />
          </View>

          {loadingDetail && !detail ? (
            <View style={styles.pad}>
              <SkeletonCard height={120} />
            </View>
          ) : active ? (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.detailHeading}>{active.checklist?.title || 'Assessment'}</Text>
              <Text style={styles.detailSub}>{childName(active.child)}</Text>
              <View style={styles.detailRow}>
                <Badge
                  label={aiStatusLabel(active.ai_generation_status)}
                  tone={aiStatusTone(active.ai_generation_status)}
                />
                {active.severity_level ? (
                  <Badge label={active.severity_level} tone="neutral" />
                ) : null}
              </View>
              {active.notes ? (
                <View style={styles.notesBlock}>
                  <Text style={styles.blockLabel}>Notes</Text>
                  <Text style={styles.blockBody}>{active.notes}</Text>
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>Responses</Text>
              {(detail?.responses || []).map((response) => (
                <View key={response.id} style={styles.responseCard}>
                  <Text style={styles.responsePrompt}>
                    {response.checklist_item?.prompt || 'Item'}
                  </Text>
                  {response.checklist_item?.domain ? (
                    <Text style={styles.responseDomain}>{response.checklist_item.domain}</Text>
                  ) : null}
                  <Text style={styles.responseScore}>
                    Score: {response.score?.trim() ? response.score : '—'}
                  </Text>
                  {response.comment ? (
                    <Text style={styles.responseComment}>{response.comment}</Text>
                  ) : null}
                </View>
              ))}

              {canGenerate ? (
                <Button
                  label="Generate AI recommendation"
                  onPress={() => generateMutation.mutate(active as AssessmentDetail)}
                  loading={generateMutation.isPending}
                  icon="sparkles-outline"
                />
              ) : (
                <View style={styles.lockedBox}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
                  <Text style={styles.lockedText}>
                    AI generation is unavailable while a recommendation is pending review or already
                    approved.
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
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
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.sm,
    ...shadows.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    letterSpacing: -0.15,
    color: colors.green900,
  },
  cardChild: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
  cardMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  modal: { flex: 1, backgroundColor: colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: alpha.a08,
  },
  modalTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 17,
    color: colors.green900,
  },
  modalBody: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive,
    gap: spacing.lg,
  },
  detailHeading: {
    fontFamily: fonts.heading,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.green900,
  },
  detailSub: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary },
  detailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  notesBlock: { gap: spacing.xs },
  blockLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  blockBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.green900 },
  sectionLabel: {
    fontFamily: fonts.headingSemi,
    fontSize: 15,
    color: colors.green900,
    marginTop: spacing.sm,
  },
  responseCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.xs,
  },
  responsePrompt: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.green900 },
  responseDomain: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  responseScore: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  responseComment: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.green900 },
  lockedBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: alpha.a06,
  },
  lockedText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
});
