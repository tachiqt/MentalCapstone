import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/auth';
import { getRoleHomePath } from '../lib/navigation';
import { colors } from '../lib/theme';

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    (async () => {
      if (user) {
        router.replace(getRoleHomePath(user.role) as any);
      } else {
        const seen = await AsyncStorage.getItem('onboarding_done');
        router.replace(seen ? '/(auth)/login' : '/(onboarding)');
      }
    })();
  }, [loading, user]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
