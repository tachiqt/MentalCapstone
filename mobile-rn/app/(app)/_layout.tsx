import { Redirect, Slot } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '../../lib/theme';
import { BlurTargetProvider } from '../../components/ui/BlurTargetProvider';

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <BlurTargetProvider>
      <Slot />
    </BlurTargetProvider>
  );
}
