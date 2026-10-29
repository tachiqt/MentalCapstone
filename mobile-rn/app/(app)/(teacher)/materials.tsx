import { useMemo, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  TextInput,
  Modal,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { api } from '../../../lib/api';
import { LearningMaterial } from '../../../lib/materials';
import { childName } from '../../../lib/format';
import { Screen } from '../../../components/ui/Screen';
import { SkeletonCard } from '../../../components/ui/SkeletonCard';
import { EmptyState } from '../../../components/EmptyState';
import { MaterialCard } from '../../../components/MaterialCard';
import { MaterialViewerModal } from '../../../components/MaterialViewerModal';
import { SectionHeader } from '../../../components/ui/SectionHeader';
import { AvatarChip } from '../../../components/parent/AvatarChip';
import { BlurredModalBackdrop } from '../../../components/ui/BlurredModalBackdrop';
import { SafeModalSheet } from '../../../components/ui/SafeModalSheet';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../../lib/theme';

const MATERIAL_TYPES = ['worksheet', 'visual', 'video', 'audio', 'activity', 'guide'];

type Child = {
  id: number;
  first_name?: string;
  last_name?: string;
};

export default function MaterialsScreen() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<LearningMaterial | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | 'all'>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('guide');
  const [childId, setChildId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['learning-materials'],
    queryFn: () => api<LearningMaterial[]>('/learning-materials'),
  });

  const { data: childrenData } = useQuery({
    queryKey: ['children'],
    queryFn: () => api<Child[] | { data: Child[] }>('/children'),
  });

  const createMutation = useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      type?: string;
      child_id?: number | null;
    }) => api('/learning-materials', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['learning-materials'] });
      if (childId) {
        queryClient.invalidateQueries({ queryKey: ['child-materials', childId] });
      }
      setComposerOpen(false);
      setTitle('');
      setDescription('');
      setType('guide');
      setChildId(null);
    },
    onError: (err: Error) => Alert.alert('Could not save material', err.message),
  });

  const materials: LearningMaterial[] = Array.isArray(data) ? data : [];
  const children = useMemo(() => {
    const raw = (childrenData as { data?: Child[] })?.data || childrenData || [];
    return (Array.isArray(raw) ? raw : []) as Child[];
  }, [childrenData]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    materials.forEach((m) => {
      if (m.type) set.add(m.type);
    });
    return Array.from(set);
  }, [materials]);

  const filtered = materials.filter((m) => {
    if (category !== 'all' && m.type !== category) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      m.title?.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q) ||
      m.type?.toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <Screen>
        <View style={styles.pad}>
          <SkeletonCard height={60} />
          <SkeletonCard height={100} />
          <SkeletonCard height={100} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <SectionHeader
              title="Learning materials"
              subtitle={`${materials.length} resources · PDFs, videos, visuals, and guides`}
            />
            <TextInput
              style={styles.search}
              placeholder="Search materials"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
            />
            {categories.length > 0 ? (
              <FlatList
                horizontal
                data={['all', ...categories]}
                keyExtractor={(item) => item}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                renderItem={({ item }) => (
                  <AvatarChip
                    label={item === 'all' ? 'All' : item}
                    active={category === item}
                    onPress={() => setCategory(item)}
                  />
                )}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <MaterialCard material={item} onPress={() => setSelected(item)} />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No materials found"
            message="Tap + to add a learning material, or try a different search."
            icon="book-outline"
          />
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setComposerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Add learning material"
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.white} />
      </TouchableOpacity>

      <MaterialViewerModal
        material={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
      />

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.modalRoot}>
          <BlurredModalBackdrop onPress={() => setComposerOpen(false)} />
          <SafeModalSheet style={styles.sheetOverride}>
            <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={24}>
              <Text style={styles.modalTitle}>Add learning material</Text>
              <Text style={styles.modalSubtitle}>
                Optional: assign to one patient so it appears on their profile.
              </Text>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Material title"
                placeholderTextColor={colors.textMuted}
              />
              <Text style={styles.fieldLabel}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {MATERIAL_TYPES.map((t) => (
                  <AvatarChip key={t} label={t} active={type === t} onPress={() => setType(t)} />
                ))}
              </ScrollView>
              <Text style={styles.fieldLabel}>Assign to child (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <AvatarChip
                  label="Facility library"
                  active={childId == null}
                  onPress={() => setChildId(null)}
                />
                {children.map((c) => (
                  <AvatarChip
                    key={c.id}
                    label={childName(c)}
                    active={childId === c.id}
                    onPress={() => setChildId(c.id)}
                  />
                ))}
              </ScrollView>
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                placeholder="How teachers/parents should use this"
                placeholderTextColor={colors.textMuted}
                multiline
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setComposerOpen(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSave, (!title.trim() || createMutation.isPending) && styles.modalSaveDisabled]}
                  disabled={!title.trim() || createMutation.isPending}
                  onPress={() =>
                    createMutation.mutate({
                      title: title.trim(),
                      description: description.trim() || undefined,
                      type,
                      child_id: childId,
                    })
                  }
                >
                  <Text style={styles.modalSaveText}>
                    {createMutation.isPending ? 'Saving…' : 'Save material'}
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

const styles = StyleSheet.create({
  pad: { padding: layout.screenPadding, gap: spacing.md },
  list: {
    padding: layout.screenPadding,
    paddingBottom: spacing.massive + 72,
    gap: spacing.md,
    flexGrow: 1,
  },
  headerBlock: { gap: spacing.md, marginBottom: spacing.sm },
  fab: {
    position: 'absolute',
    right: layout.screenPadding,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    ...shadows.lg,
  },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    minHeight: 48,
  },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetOverride: {
    maxHeight: '88%',
  },
  modalTitle: { fontFamily: fonts.headingSemi, fontSize: 20, color: colors.green900 },
  modalSubtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: 4,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
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
  modalActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.lg },
  modalCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: alpha.a22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textSecondary },
  modalSave: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveDisabled: { opacity: 0.5 },
  modalSaveText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.white },
});
