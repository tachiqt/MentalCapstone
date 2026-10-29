import { Stack } from 'expo-router';
import { BlurTargetProvider } from '../../components/ui/BlurTargetProvider';

export default function AuthLayout() {
  return (
    <BlurTargetProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </BlurTargetProvider>
  );
}
