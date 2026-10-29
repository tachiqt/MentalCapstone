import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { colors, fonts, spacing } from '../lib/theme';

export function AppHeader() {
  const { user } = useAuth();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.push('/(app)/profile')}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.push('/(app)/notifications')}>
        <Text style={styles.bell}>🔔</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontFamily: fonts.headingSemi, fontSize: 14, color: colors.white },
  bell: { fontSize: 22 },
});
