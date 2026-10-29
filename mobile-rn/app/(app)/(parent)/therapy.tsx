import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { colors, fonts, spacing, radii, shadows } from '../../../lib/theme';

export default function ParentTherapyScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['therapy-sessions'],
    queryFn: () => api('/therapy-sessions'),
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const sessions = data?.data || data || [];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Upcoming Sessions</Text>
      <FlatList
        data={sessions}
        keyExtractor={(item: any) => String(item.id)}
        contentContainerStyle={{ padding: spacing.lg }}
        renderItem={({ item }: { item: any }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title || 'Therapy Session'}</Text>
            <Text style={styles.cardMeta}>{item.scheduled_at || item.date}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No upcoming sessions.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heading: { fontFamily: fonts.heading, fontSize: 20, color: colors.text, padding: spacing.lg, paddingBottom: 0 },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, marginBottom: spacing.md, ...shadows.sm },
  cardTitle: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.green900 },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.accent, marginTop: spacing.xs },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
});
