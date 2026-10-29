import { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { api } from '../../../../lib/api';
import { childName, formatDate, initials } from '../../../../lib/format';
import { Screen } from '../../../../components/ui/Screen';
import { ScreenHeader } from '../../../../components/ui/ScreenHeader';
import { Badge } from '../../../../components/ui/Badge';
import { SegmentedControl } from '../../../../components/ui/SegmentedControl';
import { Timeline, TimelineItem } from '../../../../components/ui/Timeline';
import { SkeletonCard } from '../../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../../components/EmptyState';
import { BlurredModalBackdrop } from '../../../../components/ui/BlurredModalBackdrop';
import { SafeModalSheet } from '../../../../components/ui/SafeModalSheet';
import { LearningMaterial } from '../../../../lib/materials';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../../lib/theme';

type ChildDetail = {
  id: number;
  first_name?: string;
  last_name?: string;
  diagnosis?: string;
  age_band?: number;
  sex?: string;
  condition_notes?: string;
  birth_date?: string;
};

type ProgressRecord = {
  id: number;
  title: string;
  summary?: string;
  milestone?: string;
  recorded_on?: string;
  recorder?: { name?: string };
};

type TherapyPlan = {
  id: number;
  child_id?: number;
  title?: string;
  description?: string | null;
  sessions_per_week?: number;
  status?: string;
};

type Tab = 'progress' | 'plans' | 'materials';

function capitalize(value?: string) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function milestonesThisMonth(records: ProgressRecord[]) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return records.filter((r) => {
    if (!r.recorded_on) return false;
    const d = new Date(r.recorded_on);
    return d.getFullYear() === y && d.getMonth() === m;
  }).length;
}

export default function TeacherChildDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const childId = Number(id);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('progress');
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [milestone, setMilestone] = useState('');

  const [planComposerOpen, setPlanComposerOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [planTitle, setPlanTitle] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [planSessions, setPlanSessions] = useState('2');
  const [planStatus, setPlanStatus] = useState<'active' | 'archived'>('active');

  const [materialsEditing, setMaterialsEditing] = useState(false);
  const [draftMaterialIds, setDraftMaterialIds] = useState<number[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');

  const { data: child, isLoading: loadingChild } = useQuery({
    queryKey: ['child', childId],
    queryFn: () => api<ChildDetail>(`/children/${childId}`),
    enabled: Number.isFinite(childId),
  });

  const { data: progress, isLoading: loadingProgress } = useQuery({
    queryKey: ['child-progress', childId],
    queryFn: () => api<ProgressRecord[]>(`/children/${childId}/progress`),
    enabled: Number.isFinite(childId),
  });

  const { data: materials, isLoading: loadingMaterials } = useQuery({
    queryKey: ['child-materials', childId],
    queryFn: () => api<LearningMaterial[]>(`/learning-materials?child_id=${childId}`),
    enabled: Number.isFinite(childId),
  });

  const { data: libraryData, isLoading: loadingLibrary } = useQuery({
    queryKey: ['learning-materials'],
    queryFn: () => api<LearningMaterial[]>('/learning-materials'),
    enabled: libraryOpen,
  });

  const { data: plansData, isLoading: loadingPlans } = useQuery({
    queryKey: ['therapy-plans', childId],
    queryFn: () => api<TherapyPlan[]>(`/therapy-plans?child_id=${childId}`),
    enabled: Number.isFinite(childId),
  });

  const createProgress = useMutation({
    mutationFn: (body: { title: string; summary?: string; milestone?: string }) =>
      api(`/children/${childId}/progress`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['child-progress', childId] });
      queryClient.invalidateQueries({ queryKey: ['progress'] });
      setComposerOpen(false);
      setTitle('');
      setSummary('');
      setMilestone('');
      setTab('progress');
    },
    onError: (err: Error) => Alert.alert('Could not save', err.message),
  });

  const savePlan = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editingPlanId
        ? api(`/therapy-plans/${editingPlanId}`, { method: 'PUT', body })
        : api('/therapy-plans', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['therapy-plans', childId] });
      queryClient.invalidateQueries({ queryKey: ['therapy-plans'] });
      setPlanComposerOpen(false);
      setEditingPlanId(null);
      setPlanTitle('');
      setPlanDescription('');
      setPlanSessions('2');
      setPlanStatus('active');
      setTab('plans');
    },
    onError: (err: Error) => Alert.alert('Could not save therapy plan', err.message),
  });

  const syncMaterials = useMutation({
    mutationFn: (learning_material_ids: number[]) =>
      api<LearningMaterial[]>(`/children/${childId}/learning-materials`, {
        method: 'PUT',
        body: { learning_material_ids },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['child-materials', childId] });
      queryClient.invalidateQueries({ queryKey: ['learning-materials'] });
      queryClient.invalidateQueries({ queryKey: ['child', childId] });
      setMaterialsEditing(false);
      setLibraryOpen(false);
      setLibraryQuery('');
      setTab('materials');
    },
    onError: (err: Error) => Alert.alert('Could not save materials', err.message),
  });

  const records = useMemo(() => (Array.isArray(progress) ? progress : []), [progress]);
  const materialList = useMemo(() => (Array.isArray(materials) ? materials : []), [materials]);
  const libraryList = useMemo(
    () => (Array.isArray(libraryData) ? libraryData : []),
    [libraryData],
  );
  const plans = useMemo(() => (Array.isArray(plansData) ? plansData : []), [plansData]);
  const materialById = useMemo(() => {
    const map = new Map<number, LearningMaterial>();
    materialList.forEach((m) => map.set(m.id, m));
    libraryList.forEach((m) => map.set(m.id, m));
    return map;
  }, [materialList, libraryList]);
  const draftMaterials = useMemo(
    () =>
      draftMaterialIds
        .map((id) => materialById.get(id))
        .filter((m): m is LearningMaterial => Boolean(m)),
    [draftMaterialIds, materialById],
  );
  const libraryFiltered = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return libraryList.filter((m) => {
      if (draftMaterialIds.includes(m.id)) return false;
      if (!q) return true;
      return (
        m.title?.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        m.type?.toLowerCase().includes(q)
      );
    });
  }, [libraryList, draftMaterialIds, libraryQuery]);
  const activePlans = plans.filter((p) => (p.status || 'active') !== 'archived');
  const name = child ? childName(child) : 'Child';
  const monthCount = milestonesThisMonth(records);

  const openCreatePlan = () => {
    setEditingPlanId(null);
    setPlanTitle('');
    setPlanDescription('');
    setPlanSessions('2');
    setPlanStatus('active');
    setPlanComposerOpen(true);
  };

  const openEditPlan = (plan: TherapyPlan) => {
    setEditingPlanId(plan.id);
    setPlanTitle(plan.title || '');
    setPlanDescription(plan.description || '');
    setPlanSessions(String(plan.sessions_per_week || 2));
    setPlanStatus((plan.status || 'active') === 'archived' ? 'archived' : 'active');
    setPlanComposerOpen(true);
  };

  const submitPlan = () => {
    if (!planTitle.trim()) {
      Alert.alert('Title required', 'Give this therapy plan a short title.');
      return;
    }
    const body: Record<string, unknown> = {
      title: planTitle.trim(),
      description: planDescription.trim() || null,
      sessions_per_week: Math.max(1, Math.min(7, Number(planSessions) || 2)),
      status: planStatus,
    };
    if (!editingPlanId) body.child_id = childId;
    savePlan.mutate(body);
  };

  const scheduleWithPlan = (plan?: TherapyPlan | null) => {
    router.push({
      pathname: '/(app)/(teacher)/therapy',
      params: {
        childId: String(childId),
        ...(plan?.id ? { planId: String(plan.id) } : {}),
        compose: '1',
      },
    });
  };

  const beginMaterialsEdit = () => {
    setDraftMaterialIds(materialList.map((m) => m.id));
    setMaterialsEditing(true);
  };

  const cancelMaterialsEdit = () => {
    setMaterialsEditing(false);
    setLibraryOpen(false);
    setLibraryQuery('');
    setDraftMaterialIds([]);
  };

  const removeDraftMaterial = (id: number) => {
    setDraftMaterialIds((prev) => prev.filter((x) => x !== id));
  };

  const addDraftMaterial = (id: number) => {
    setDraftMaterialIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const saveMaterialsEdit = () => {
    syncMaterials.mutate(Array.from(new Set(draftMaterialIds)));
  };

  if (loadingChild) {
    return (
      <Screen style={styles.screen}>
        <Stack.Screen options={{ title: 'Child' }} />
        <View style={styles.pad}>
          <SkeletonCard height={72} />
          <SkeletonCard height={120} />
        </View>
      </Screen>
    );
  }

  if (!child) {
    return (
      <Screen style={styles.screen}>
        <Stack.Screen options={{ title: 'Child' }} />
        <EmptyState title="Child not found" message="This profile is not available." icon="person-outline" />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: name, headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Patient profile" />

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroName}>{name}</Text>
              {child.diagnosis ? <Badge label={child.diagnosis} tone="accent" /> : null}
              <Text style={styles.heroMeta}>
                {[
                  child.age_band != null ? `Age ${child.age_band}` : null,
                  child.sex ? capitalize(String(child.sex)) : null,
                  child.birth_date ? `Born ${formatDate(child.birth_date, 'medium')}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No clinical details yet'}
              </Text>
            </View>
          </View>
          {child.condition_notes ? (
            <View style={styles.notesBox}>
              <View style={styles.notesHeader}>
                <Ionicons name="document-text-outline" size={15} color={colors.primary} />
                <Text style={styles.notesLabel}>Care notes</Text>
              </View>
              <Text style={styles.notes}>{child.condition_notes}</Text>
            </View>
          ) : null}

          <View style={styles.snapshot}>
            <SnapshotStat icon="trending-up-outline" value={records.length} label="Updates" />
            <View style={styles.snapshotDivider} />
            <SnapshotStat icon="fitness-outline" value={activePlans.length} label="Plans" />
            <View style={styles.snapshotDivider} />
            <SnapshotStat icon="book-outline" value={materialList.length} label="Materials" />
          </View>
        </View>

        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { key: 'progress', label: 'Progress', count: records.length, icon: 'trending-up-outline' },
            { key: 'plans', label: 'Plans', count: plans.length, icon: 'fitness-outline' },
            { key: 'materials', label: 'Materials', count: materialList.length, icon: 'book-outline' },
          ]}
        />

        {tab === 'progress' ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sectionTitle}>Performance</Text>
                <Text style={styles.sectionHint}>Parents see these updates on their Progress tab.</Text>
              </View>
              <TouchableOpacity
                onPress={() => setComposerOpen(true)}
                style={styles.addBtn}
                accessibilityRole="button"
                accessibilityLabel="Add performance update"
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={styles.addBtnText}>Update</Text>
              </TouchableOpacity>
            </View>

            {loadingProgress ? (
              <SkeletonCard height={120} />
            ) : records.length === 0 ? (
              <View style={styles.emptyCard}>
                <EmptyState
                  title="No performance updates yet"
                  message="Record a milestone or observation. Parents will see it on Progress."
                  icon="trending-up-outline"
                />
                <TouchableOpacity style={styles.emptyCta} onPress={() => setComposerOpen(true)}>
                  <Ionicons name="create-outline" size={18} color={colors.white} />
                  <Text style={styles.emptyCtaText}>Write first update</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Timeline>
                {records.map((item, index) => (
                  <TimelineItem
                    key={item.id}
                    title={item.title}
                    body={item.summary}
                    meta={[
                      item.recorded_on ? formatDate(item.recorded_on, 'medium') : null,
                      item.recorder?.name ? `By ${item.recorder.name}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    isFirst={index === 0}
                    isLast={index === records.length - 1}
                    badge={item.milestone ? <Badge label={item.milestone} tone="accent" /> : undefined}
                  />
                ))}
              </Timeline>
            )}
          </View>
        ) : null}

        {tab === 'plans' ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sectionTitle}>Therapy plans</Text>
                <Text style={styles.sectionHint}>
                  Manage plans here, then schedule sessions from the linked plan.
                </Text>
              </View>
              <TouchableOpacity
                onPress={openCreatePlan}
                style={styles.addBtn}
                accessibilityRole="button"
                accessibilityLabel="Create therapy plan"
              >
                <Ionicons name="add" size={18} color={colors.white} />
                <Text style={styles.addBtnText}>Plan</Text>
              </TouchableOpacity>
            </View>

            {loadingPlans ? (
              <SkeletonCard height={120} />
            ) : plans.length === 0 ? (
              <View style={styles.emptyCard}>
                <EmptyState
                  title="No therapy plan yet"
                  message="Create a therapy plan for this child, then schedule sessions against it."
                  icon="fitness-outline"
                />
                <TouchableOpacity style={styles.emptyCta} onPress={openCreatePlan}>
                  <Ionicons name="add-circle-outline" size={18} color={colors.white} />
                  <Text style={styles.emptyCtaText}>Create Therapy Plan</Text>
                </TouchableOpacity>
              </View>
            ) : (
              plans.map((plan) => {
                const archived = (plan.status || 'active') === 'archived';
                return (
                  <View key={plan.id} style={styles.card}>
                    <View style={styles.planHead}>
                      <Text style={styles.cardTitle}>{plan.title || `Plan #${plan.id}`}</Text>
                      <Badge label={archived ? 'Archived' : 'Active'} tone={archived ? 'neutral' : 'success'} />
                    </View>
                    {plan.description ? <Text style={styles.cardBody}>{plan.description}</Text> : null}
                    <Text style={styles.planMeta}>
                      {plan.sessions_per_week || 2} session{(plan.sessions_per_week || 2) === 1 ? '' : 's'}/week
                    </Text>
                    <View style={styles.planActions}>
                      <TouchableOpacity style={styles.planActionBtn} onPress={() => openEditPlan(plan)}>
                        <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                        <Text style={styles.planActionText}>Edit</Text>
                      </TouchableOpacity>
                      {!archived ? (
                        <TouchableOpacity style={styles.planActionBtn} onPress={() => scheduleWithPlan(plan)}>
                          <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                          <Text style={styles.planActionText}>Schedule</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : null}

        {tab === 'materials' ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sectionTitle}>Assigned learning materials</Text>
                <Text style={styles.sectionHint}>
                  {materialsEditing
                    ? 'Add from the library or remove items for this child only. The main library is unchanged.'
                    : 'Customize materials for this child’s needs without changing the shared library.'}
                </Text>
              </View>
              {!materialsEditing ? (
                <TouchableOpacity
                  onPress={beginMaterialsEdit}
                  style={styles.addBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Edit assigned learning materials"
                >
                  <Ionicons name="pencil-outline" size={16} color={colors.white} />
                  <Text style={styles.addBtnText}>Edit</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {materialsEditing ? (
              <View style={styles.editBar}>
                <TouchableOpacity
                  style={styles.libraryBtn}
                  onPress={() => setLibraryOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add from library"
                >
                  <Ionicons name="library-outline" size={18} color={colors.primary} />
                  <Text style={styles.libraryBtnText}>Add from Library</Text>
                </TouchableOpacity>
                <View style={styles.editActions}>
                  <TouchableOpacity style={styles.modalCancel} onPress={cancelMaterialsEdit}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSave, syncMaterials.isPending && styles.modalSaveDisabled]}
                    disabled={syncMaterials.isPending}
                    onPress={saveMaterialsEdit}
                  >
                    <Text style={styles.modalSaveText}>
                      {syncMaterials.isPending ? 'Saving…' : 'Save changes'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {loadingMaterials ? (
              <SkeletonCard height={100} />
            ) : (materialsEditing ? draftMaterials : materialList).length === 0 ? (
              <View style={styles.emptyCard}>
                <EmptyState
                  title="No materials for this child"
                  message={
                    materialsEditing
                      ? 'Tap Add from Library to assign existing materials to this child.'
                      : 'Materials from AI review or teacher assignment appear here.'
                  }
                  icon="book-outline"
                />
                {!materialsEditing ? (
                  <TouchableOpacity style={styles.emptyCta} onPress={beginMaterialsEdit}>
                    <Ionicons name="library-outline" size={18} color={colors.white} />
                    <Text style={styles.emptyCtaText}>Assign materials</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.emptyCta} onPress={() => setLibraryOpen(true)}>
                    <Ionicons name="add-circle-outline" size={18} color={colors.white} />
                    <Text style={styles.emptyCtaText}>Add from Library</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              (materialsEditing ? draftMaterials : materialList).map((item) => (
                <View key={item.id} style={styles.card}>
                  <View style={styles.materialHead}>
                    <View style={{ flex: 1, minWidth: 0, gap: spacing.sm }}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      {item.type ? <Badge label={item.type} tone="neutral" /> : null}
                    </View>
                    {materialsEditing ? (
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => removeDraftMaterial(item.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.title}`}
                      >
                        <Ionicons name="close-circle" size={22} color={colors.danger} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {item.description ? <Text style={styles.cardBody}>{item.description}</Text> : null}
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop onPress={() => setComposerOpen(false)} />
          <SafeModalSheet>
            <View style={styles.sheetHandle} />
            <KeyboardAwareScrollView
              keyboardShouldPersistTaps="handled"
              bottomOffset={24}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>Update performance</Text>
              <Text style={styles.modalSubtitle}>Parents will see this on their Progress tab.</Text>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Used the choice board unprompted"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.fieldLabel}>Milestone (optional)</Text>
              <TextInput
                style={styles.input}
                value={milestone}
                onChangeText={setMilestone}
                placeholder="e.g. Communication"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.fieldLabel}>Summary</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={summary}
                onChangeText={setSummary}
                placeholder="What changed and what to watch next"
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setComposerOpen(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSave, (!title.trim() || createProgress.isPending) && styles.modalSaveDisabled]}
                  disabled={!title.trim() || createProgress.isPending}
                  onPress={() =>
                    createProgress.mutate({
                      title: title.trim(),
                      summary: summary.trim() || undefined,
                      milestone: milestone.trim() || undefined,
                    })
                  }
                >
                  <Text style={styles.modalSaveText}>
                    {createProgress.isPending ? 'Saving…' : 'Save update'}
                  </Text>
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollView>
          </SafeModalSheet>
        </View>
      </Modal>

      <Modal
        visible={libraryOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLibraryOpen(false)}
      >
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop onPress={() => setLibraryOpen(false)} />
          <SafeModalSheet style={styles.librarySheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Add from Library</Text>
            <Text style={styles.modalSubtitle}>
              Select materials to assign to {name}. Already assigned items are hidden to prevent duplicates.
            </Text>
            <TextInput
              style={styles.input}
              value={libraryQuery}
              onChangeText={setLibraryQuery}
              placeholder="Search library…"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
            />
            <ScrollView
              style={styles.libraryList}
              contentContainerStyle={styles.libraryListContent}
              keyboardShouldPersistTaps="handled"
            >
              {loadingLibrary ? (
                <SkeletonCard height={80} />
              ) : libraryFiltered.length === 0 ? (
                <EmptyState
                  title={libraryQuery.trim() ? 'No matches' : 'Nothing left to add'}
                  message={
                    libraryQuery.trim()
                      ? 'Try a different search.'
                      : 'Every library material is already assigned to this child, or the library is empty.'
                  }
                  icon="library-outline"
                />
              ) : (
                libraryFiltered.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.libraryRow}
                    onPress={() => {
                      addDraftMaterial(item.id);
                      setLibraryOpen(false);
                      setLibraryQuery('');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${item.title}`}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={styles.cardBody} numberOfLines={2}>
                        {[item.type, item.description].filter(Boolean).join(' · ') || 'Library material'}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color={colors.primary} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setLibraryOpen(false)}>
              <Text style={styles.modalCancelText}>Done</Text>
            </TouchableOpacity>
          </SafeModalSheet>
        </View>
      </Modal>

      <Modal
        visible={planComposerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPlanComposerOpen(false)}
      >
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop onPress={() => setPlanComposerOpen(false)} />
          <SafeModalSheet>
            <View style={styles.sheetHandle} />
            <KeyboardAwareScrollView
              keyboardShouldPersistTaps="handled"
              bottomOffset={24}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>
                {editingPlanId ? 'Edit therapy plan' : 'Create therapy plan'}
              </Text>
              <Text style={styles.modalSubtitle}>
                Plans stay linked to {name}. Scheduling will use this plan automatically when possible.
              </Text>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.input}
                value={planTitle}
                onChangeText={setPlanTitle}
                placeholder="e.g. Communication focus plan"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.fieldLabel}>Sessions per week</Text>
              <TextInput
                style={styles.input}
                value={planSessions}
                onChangeText={setPlanSessions}
                keyboardType="number-pad"
                placeholder="2"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={planDescription}
                onChangeText={setPlanDescription}
                placeholder="Goals, focus areas, and session structure"
                placeholderTextColor={colors.textMuted}
                multiline
              />
              {editingPlanId ? (
                <>
                  <Text style={styles.fieldLabel}>Status</Text>
                  <View style={styles.statusRow}>
                    {(['active', 'archived'] as const).map((status) => (
                      <TouchableOpacity
                        key={status}
                        style={[styles.statusChip, planStatus === status && styles.statusChipActive]}
                        onPress={() => setPlanStatus(status)}
                      >
                        <Text
                          style={[
                            styles.statusChipText,
                            planStatus === status && styles.statusChipTextActive,
                          ]}
                        >
                          {status === 'active' ? 'Active' : 'Archived'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setPlanComposerOpen(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSave, savePlan.isPending && styles.modalSaveDisabled]}
                  disabled={savePlan.isPending}
                  onPress={submitPlan}
                >
                  <Text style={styles.modalSaveText}>
                    {savePlan.isPending ? 'Saving…' : editingPlanId ? 'Save changes' : 'Create plan'}
                  </Text>
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollView>
          </SafeModalSheet>
        </View>
      </Modal>
    </Screen>
  );
}

function SnapshotStat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.snapshotStat}>
      <View style={styles.snapshotIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={styles.snapshotValue}>{value}</Text>
      <Text style={styles.snapshotLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.tint200 },
  pad: { padding: layout.screenPadding, gap: spacing.md },
  scroll: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive,
    gap: spacing.lg,
  },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.green100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: alpha.a10,
  },
  avatarText: { fontFamily: fonts.heading, fontSize: 20, color: colors.primary },
  heroCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  heroName: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.green900,
    letterSpacing: -0.3,
  },
  heroMeta: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  notesBox: {
    backgroundColor: colors.tint100,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: alpha.a08,
  },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notesLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary },
  notes: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 21 },
  snapshot: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: alpha.a08,
  },
  snapshotStat: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: spacing.sm },
  snapshotIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotValue: { fontFamily: fonts.heading, fontSize: 20, color: colors.green900, letterSpacing: -0.4 },
  snapshotLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  snapshotDivider: { width: 1, backgroundColor: alpha.a08, marginVertical: spacing.sm },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { fontFamily: fonts.headingSemi, fontSize: 18, color: colors.green900 },
  sectionHint: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    flexShrink: 0,
  },
  addBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.white },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.md,
    ...shadows.sm,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  emptyCtaText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.white },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: alpha.a08,
    ...shadows.sm,
  },
  cardTitle: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.green900 },
  cardBody: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  planHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  planMeta: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
  planActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  planActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planActionText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.primary },
  editBar: { gap: spacing.md },
  libraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.green50,
  },
  libraryBtnText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.primary },
  editActions: { flexDirection: 'row', gap: spacing.md },
  materialHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  removeBtn: { padding: 2, marginTop: 2 },
  librarySheet: { gap: spacing.sm },
  libraryList: { maxHeight: 360, marginTop: spacing.sm },
  libraryListContent: { gap: spacing.sm, paddingBottom: spacing.md },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.tint100,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
  },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: alpha.a12,
    backgroundColor: colors.tint100,
  },
  statusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  statusChipTextActive: { color: colors.white },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadows.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: alpha.a16,
    marginBottom: spacing.sm,
  },
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
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  modalCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: alpha.a22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textSecondary },
  modalSave: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveDisabled: { opacity: 0.5 },
  modalSaveText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.white },
});
