import { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { colors, fonts, spacing, radii, shadows } from '../../../lib/theme';

export default function FeedbackScreen() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['parent-feedback'],
    queryFn: () => api('/parent-feedback'),
  });

  const submitMutation = useMutation({
    mutationFn: (body: { message: string }) =>
      api('/parent-feedback', { method: 'POST', body }),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['parent-feedback'] });
    },
  });

  const feedbacks = data?.data || data || [];

  return (
    <View style={styles.container}>
      <View style={styles.form}>
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
            submitMutation.mutate({ message });
          }}
        >
          <Text style={styles.btnSubmitText}>Submit</Text>
        </TouchableOpacity>
      </View>

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
