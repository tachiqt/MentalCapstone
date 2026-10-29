import { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { childName } from '../../../lib/format';
import { Screen } from '../../../components/ui/Screen';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { Button } from '../../../components/ui/Button';
import { BlurredModalBackdrop } from '../../../components/ui/BlurredModalBackdrop';
import { SafeModalSheet } from '../../../components/ui/SafeModalSheet';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

type PriorityGoal = {
  goal?: string;
  timeframe?: string;
  success_indicator?: string;
  basis?: string;
};

type Activity = {
  title?: string;
  duration_minutes?: number;
  frequency?: string;
  steps?: string[];
  rationale?: string;
  evidence_basis?: string;
  material_id?: number | null;
};

type Material = {
  id: number;
  title?: string;
  type?: string;
  description?: string;
};

type Recommendation = {
  id: number;
  title?: string;
  description?: string;
  content?: string;
  clinical_basis?: string;
  focus_areas?: string[];
  priority_goals?: PriorityGoal[];
  suggested_activities?: Activity[];
  intervention_suggestions?: string[];
  attached_materials?: Material[];
  learning_material_ids?: number[];
  openai_response_json?: {
    developmental_summary?: string;
    clinical_basis?: string;
    focus_areas?: string[];
    priority_goals?: PriorityGoal[];
    suggested_activities?: Activity[];
    intervention_suggestions?: string[];
    attached_materials?: Material[];
    learning_material_ids?: number[];
    caution?: string;
  };
  child?: { first_name?: string; last_name?: string };
  child_name?: string;
};

type EditDraft = {
  developmental_summary: string;
  clinical_basis: string;
  focus_areas: string;
  intervention_suggestions: string;
  teacher_notes: string;
  materialIds: number[];
};

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : ''))
    .filter(Boolean);
}

function payloadOf(item: Recommendation) {
  return item.openai_response_json || {};
}

function draftFrom(item: Recommendation): EditDraft {
  const payload = payloadOf(item);
  const materials = item.attached_materials || payload.attached_materials || [];
  const fromIds = [
    ...(item.learning_material_ids || []),
    ...(payload.learning_material_ids || []),
    ...materials.map((m) => m.id).filter(Boolean),
    ...(item.suggested_activities || payload.suggested_activities || [])
      .map((a) => a?.material_id)
      .filter(Boolean),
  ];
  const ids = [...new Set(fromIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))];

  return {
    developmental_summary:
      item.description || item.content || payload.developmental_summary || '',
    clinical_basis: item.clinical_basis || payload.clinical_basis || '',
    focus_areas: (item.focus_areas || payload.focus_areas || [])
      .filter((f) => typeof f === 'string')
      .join(', '),
    intervention_suggestions: asList(
      item.intervention_suggestions || payload.intervention_suggestions
    ).join('\n'),
    teacher_notes: '',
    materialIds: ids,
  };
}

export default function AIReviewScreen() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Recommendation | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [materialQuery, setMaterialQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState<Record<number, boolean>>({});

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const { data, isLoading } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () =>
      api<Recommendation[] | { data: Recommendation[] }>(
        '/recommendations?status=pending_review'
      ),
  });

  const { data: materialsData } = useQuery({
    queryKey: ['learning-materials'],
    queryFn: () => api<Material[] | { data: Material[] }>('/learning-materials'),
  });

  const materials = useMemo(() => {
    const raw = (materialsData as { data?: Material[] })?.data || materialsData || [];
    return (Array.isArray(raw) ? raw : []) as Material[];
  }, [materialsData]);

  const filteredMaterials = useMemo(() => {
    const q = materialQuery.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) =>
      `${m.title || ''} ${m.type || ''} ${m.description || ''}`.toLowerCase().includes(q)
    );
  }, [materials, materialQuery]);

  const reviewMutation = useMutation({
    mutationFn: (body: {
      id: number;
      status: string;
      teacher_notes?: string;
      openai_response_json?: Record<string, unknown>;
      learning_material_ids?: number[];
    }) =>
      api(`/recommendations/${body.id}/review`, {
        method: 'POST',
        body: {
          status: body.status,
          teacher_notes: body.teacher_notes,
          openai_response_json: body.openai_response_json,
          learning_material_ids: body.learning_material_ids,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      setEditing(null);
      setDraft(null);
      setMaterialQuery('');
    },
    onError: (err: Error) => Alert.alert('Review failed', err.message || 'Could not save review.'),
  });

  const openEdit = (item: Recommendation) => {
    setEditing(item);
    setDraft(draftFrom(item));
    setMaterialQuery('');
  };

  const toggleMaterial = (id: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const has = prev.materialIds.includes(id);
      return {
        ...prev,
        materialIds: has
          ? prev.materialIds.filter((x) => x !== id)
          : [...prev.materialIds, id],
      };
    });
  };

  const buildPayload = (item: Recommendation, next: EditDraft) => {
    const base = { ...(payloadOf(item) || {}) };
    const focus = next.focus_areas
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const interventions = next.intervention_suggestions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      ...base,
      developmental_summary: next.developmental_summary.trim(),
      clinical_basis: next.clinical_basis.trim(),
      focus_areas: focus,
      intervention_suggestions: interventions,
    };
  };

  const submitEdited = () => {
    if (!editing || !draft) return;
    reviewMutation.mutate({
      id: editing.id,
      status: 'modified',
      teacher_notes: draft.teacher_notes.trim() || undefined,
      openai_response_json: buildPayload(editing, draft),
      learning_material_ids: draft.materialIds,
    });
  };

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.pad}>
          <SkeletonCard height={140} lines={2} />
          <SkeletonCard height={140} lines={2} />
        </View>
      </Screen>
    );
  }

  const raw = (data as { data?: Recommendation[] })?.data || data || [];
  const items = (Array.isArray(raw) ? raw : []) as Recommendation[];

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <SectionHeader
            title="AI recommendations"
            subtitle={`${items.length} awaiting your review — expand to read, edit to customize before approve`}
          />
        }
        renderItem={({ item }) => {
          const payload = payloadOf(item);
          const name = item.child_name || childName(item.child) || 'Child';
          const summary =
            item.description || item.content || payload.developmental_summary || '';
          const basis = item.clinical_basis || payload.clinical_basis || '';
          const focus = item.focus_areas || payload.focus_areas || [];
          const goals = item.priority_goals || payload.priority_goals || [];
          const activities = (
            item.suggested_activities ||
            payload.suggested_activities ||
            []
          ).slice(0, 3);
          const interventions = asList(
            item.intervention_suggestions || payload.intervention_suggestions
          ).slice(0, 3);
          const attached =
            item.attached_materials || payload.attached_materials || [];
          const caution =
            payload.caution ||
            'Generated learning-support draft — review carefully before approving.';
          const expanded = !!expandedIds[item.id];

          return (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => toggleExpanded(item.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={expanded ? 'Collapse recommendation' : 'Expand recommendation'}
              >
                <View style={styles.cardHeaderMain}>
                  <View style={styles.aiLabel}>
                    <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
                    <Text style={styles.aiLabelText}>AI learning plan</Text>
                  </View>
                  <Text style={styles.child}>{name}</Text>
                  <Text style={styles.title}>{item.title || 'Suggested care plan update'}</Text>
                  {summary ? (
                    <Text style={styles.body} numberOfLines={expanded ? undefined : 2}>
                      {summary}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color={colors.primary}
                />
              </TouchableOpacity>

              {expanded ? (
                <View style={styles.expandedBody}>
                  {basis ? (
                    <View style={styles.block}>
                      <Text style={styles.blockLabel}>Assessment basis</Text>
                      <Text style={styles.blockBody}>{basis}</Text>
                    </View>
                  ) : null}

                  {focus.length ? (
                    <View style={styles.block}>
                      <Text style={styles.blockLabel}>Focus areas</Text>
                      <Text style={styles.blockBody}>
                        {focus.filter((f) => typeof f === 'string').join(' · ')}
                      </Text>
                    </View>
                  ) : null}

                  {goals.length ? (
                    <View style={styles.block}>
                      <Text style={styles.blockLabel}>Priority goals</Text>
                      {goals.slice(0, 2).map((g, idx) => (
                        <View key={`${item.id}-goal-${idx}`} style={styles.goalRow}>
                          <Text style={styles.goalTitle}>{g.goal || 'Goal'}</Text>
                          {g.timeframe ? <Text style={styles.goalMeta}>{g.timeframe}</Text> : null}
                          {g.success_indicator ? (
                            <Text style={styles.goalMeta}>Success: {g.success_indicator}</Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {activities.length ? (
                    <View style={styles.block}>
                      <Text style={styles.blockLabel}>Suggested activities</Text>
                      {activities.map((a, idx) => (
                        <View key={`${item.id}-act-${idx}`} style={styles.goalRow}>
                          <Text style={styles.goalTitle}>{a.title || 'Activity'}</Text>
                          {a.rationale ? <Text style={styles.goalMeta}>{a.rationale}</Text> : null}
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {interventions.length ? (
                    <View style={styles.block}>
                      <Text style={styles.blockLabel}>Intervention strategies</Text>
                      {interventions.map((line, idx) => (
                        <Text key={`${item.id}-int-${idx}`} style={styles.bullet}>
                          • {line}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  {attached.length ? (
                    <View style={styles.block}>
                      <Text style={styles.blockLabel}>Attached materials</Text>
                      {attached.map((m) => (
                        <Text key={m.id} style={styles.bullet}>
                          • {m.title || `Material #${m.id}`}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  <Text style={styles.disclaimer}>{caution}</Text>
                </View>
              ) : (
                <TouchableOpacity onPress={() => toggleExpanded(item.id)} style={styles.expandHint}>
                  <Text style={styles.expandHintText}>Tap to expand full recommendation</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.editPrimary, reviewMutation.isPending && styles.disabled]}
                disabled={reviewMutation.isPending}
                onPress={() => openEdit(item)}
              >
                <Ionicons name="create-outline" size={18} color={colors.surface} />
                <Text style={styles.editPrimaryText}>Edit & customize</Text>
              </TouchableOpacity>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.approve, reviewMutation.isPending && styles.disabled]}
                  disabled={reviewMutation.isPending}
                  onPress={() =>
                    reviewMutation.mutate({ id: item.id, status: 'approved' })
                  }
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reject, reviewMutation.isPending && styles.disabled]}
                  disabled={reviewMutation.isPending}
                  onPress={() =>
                    reviewMutation.mutate({ id: item.id, status: 'rejected' })
                  }
                >
                  <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No pending reviews"
            message="When AI suggestions are ready, they will appear here for your decision."
            icon="sparkles-outline"
          />
        }
      />

      <Modal
        visible={!!editing && !!draft}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!reviewMutation.isPending) {
            setEditing(null);
            setDraft(null);
          }
        }}
      >
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop
            onPress={() => {
              if (!reviewMutation.isPending) {
                setEditing(null);
                setDraft(null);
              }
            }}
          />
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
          >
          {draft && editing ? (
            <SafeModalSheet>
              <ScrollView
                contentContainerStyle={styles.modalScroll}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalTitle}>Customize recommendation</Text>
                <Text style={styles.modalSubtitle}>
                  {editing.child_name || childName(editing.child) || 'Child'} · edits save as
                  modified and create a therapy plan
                </Text>

                <Text style={styles.fieldLabel}>Developmental summary</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  multiline
                  value={draft.developmental_summary}
                  onChangeText={(v) => setDraft({ ...draft, developmental_summary: v })}
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.fieldLabel}>Assessment basis</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  multiline
                  value={draft.clinical_basis}
                  onChangeText={(v) => setDraft({ ...draft, clinical_basis: v })}
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.fieldLabel}>Focus areas (comma-separated)</Text>
                <TextInput
                  style={styles.input}
                  value={draft.focus_areas}
                  onChangeText={(v) => setDraft({ ...draft, focus_areas: v })}
                  placeholder="communication, fine motor"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.fieldLabel}>Interventions (one per line)</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  multiline
                  value={draft.intervention_suggestions}
                  onChangeText={(v) => setDraft({ ...draft, intervention_suggestions: v })}
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.fieldLabel}>Review notes</Text>
                <TextInput
                  style={[styles.input, styles.textareaSm]}
                  multiline
                  value={draft.teacher_notes}
                  onChangeText={(v) => setDraft({ ...draft, teacher_notes: v })}
                  placeholder="Optional notes for the care team"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.fieldLabel}>Attach learning materials</Text>
                <TextInput
                  style={styles.input}
                  value={materialQuery}
                  onChangeText={setMaterialQuery}
                  placeholder="Search library…"
                  placeholderTextColor={colors.textMuted}
                />
                <View style={styles.materialList}>
                  {filteredMaterials.length === 0 ? (
                    <Text style={styles.goalMeta}>No materials match this search.</Text>
                  ) : (
                    filteredMaterials.slice(0, 40).map((m) => {
                      const selected = draft.materialIds.includes(m.id);
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[styles.materialRow, selected && styles.materialRowActive]}
                          onPress={() => toggleMaterial(m.id)}
                        >
                          <Ionicons
                            name={selected ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={selected ? colors.primary : colors.textMuted}
                          />
                          <View style={styles.materialCopy}>
                            <Text style={styles.goalTitle}>{m.title || `Material #${m.id}`}</Text>
                            {m.type ? <Text style={styles.goalMeta}>{m.type}</Text> : null}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                <View style={styles.modalActions}>
                  <Button
                    label="Cancel"
                    variant="secondary"
                    onPress={() => {
                      setEditing(null);
                      setDraft(null);
                    }}
                    disabled={reviewMutation.isPending}
                    style={styles.modalActionBtn}
                  />
                  <Button
                    label="Save & approve"
                    onPress={submitEdited}
                    loading={reviewMutation.isPending}
                    style={styles.modalActionBtn}
                  />
                </View>
              </ScrollView>
            </SafeModalSheet>
          ) : null}
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a10,
    gap: spacing.sm,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardHeaderMain: { flex: 1, gap: spacing.sm },
  expandedBody: { gap: spacing.sm },
  expandHint: { paddingVertical: 2 },
  expandHintText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.primary,
  },
  aiLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  aiLabelText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.primary },
  child: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
  title: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.primary },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  block: {
    backgroundColor: colors.tint100,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 6,
    borderWidth: 1,
    borderColor: alpha.a08,
  },
  blockLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  blockBody: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  goalRow: { gap: 2, marginTop: 4 },
  goalTitle: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  goalMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  bullet: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  disclaimer: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  editPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    minHeight: 48,
    borderRadius: radii.md,
    marginTop: spacing.xs,
  },
  editPrimaryText: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.surface },
  actions: { flexDirection: 'row', gap: 8 },
  approve: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.successLight,
    minHeight: 44,
    borderRadius: radii.md,
  },
  reject: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.dangerLight,
    minHeight: 44,
    borderRadius: radii.md,
  },
  approveText: { fontFamily: fonts.headingSemi, fontSize: 12, color: colors.success },
  rejectText: { fontFamily: fonts.headingSemi, fontSize: 12, color: colors.danger },
  disabled: { opacity: 0.5 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(8, 36, 34, 0.55)' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', zIndex: 1 },
  modalSheet: {
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    ...shadows.lg,
  },
  modalScroll: { padding: spacing.xl, gap: spacing.sm, paddingBottom: spacing.massive },
  modalTitle: { fontFamily: fonts.headingSemi, fontSize: 20, color: colors.green900 },
  modalSubtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginBottom: spacing.sm },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: alpha.a16,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.green900,
    backgroundColor: colors.tint100,
  },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  textareaSm: { minHeight: 72, textAlignVertical: 'top' },
  materialList: { gap: spacing.sm, marginTop: spacing.sm },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    backgroundColor: colors.tint100,
  },
  materialRowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  materialCopy: { flex: 1, gap: 2 },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.lg,
    width: '100%',
  },
  modalActionBtn: { flex: 1 },
});
