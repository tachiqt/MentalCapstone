import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { getRoleHomePath } from '../../lib/navigation';
import { GoogleSignInCancelled, getGoogleIdToken } from '../../lib/google-auth';
import { TextField } from '../../components/auth/AuthShell';
import { PasswordInput } from '../../components/PasswordInput';
import { VerifyEmailNotice } from '../../components/auth/VerifyEmailNotice';
import { Button } from '../../components/ui/Button';
import { alpha, colors, fonts, spacing, radii, shadows, layout } from '../../lib/theme';

/** The backend flags an account that exists but has not opened its invite link. */
function unverifiedEmail(error: any): string | null {
  const payload = error?.payload;
  if (error?.status === 403 && payload?.reason === 'email_unverified') {
    return payload.email || null;
  }
  return null;
}

export default function LoginScreen() {
  const { user, login, googleLogin } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  /** Set when a sign-in attempt is refused for an unverified email. */
  const [noticeEmail, setNoticeEmail] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role) router.replace(getRoleHomePath(user.role) as any);
  }, [user, router]);

  const handleLogin = async () => {
    const trimmed = username.trim();
    if (!trimmed || !password) {
      return Alert.alert('Missing fields', 'Enter your username or email and password.');
    }
    setLoading(true);
    try {
      const loggedIn = await login(trimmed, password);
      router.replace(getRoleHomePath(loggedIn.role) as any);
    } catch (e: any) {
      const email = unverifiedEmail(e);
      if (email) {
        setNoticeEmail(email);
        return;
      }
      Alert.alert('Sign in failed', e.message || 'Unable to sign in. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const idToken = await getGoogleIdToken();
      const loggedIn = await googleLogin(idToken);
      router.replace(getRoleHomePath(loggedIn.role) as any);
    } catch (e: any) {
      if (e instanceof GoogleSignInCancelled) return;

      const email = unverifiedEmail(e);
      if (email) {
        setNoticeEmail(email);
        return;
      }
      Alert.alert('Google sign-in failed', e.message || 'Unable to sign in with Google.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.green900} />

      {/* A single deep-green field falling into the app's own ground, so the
          sign-in screen reads as the front door of the same building. */}
      <LinearGradient
        colors={[colors.green900, colors.green800, colors.green700]}
        style={styles.bg}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={styles.logoRing}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={styles.logoImg}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.brand}>SmartCare</Text>
              <Text style={styles.title}>Welcome back</Text>
              <Text style={styles.subtitle}>Sign in to continue coordinating care.</Text>
            </View>


            <View style={styles.formCard}>
              <TextField
                label="Username or email"
                icon="person-outline"
                placeholder="Enter username or email"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="username"
                returnKeyType="next"
              />
              <View style={styles.passwordWrap}>
                <Text style={styles.fieldLabel}>Password</Text>
                <PasswordInput
                  icon="lock-closed-outline"
                  placeholder="Enter password"
                  value={password}
                  onChangeText={setPassword}
                  onSubmitEditing={handleLogin}
                  returnKeyType="done"
                />
              </View>

              <Button label="Sign In" onPress={handleLogin} loading={loading} style={styles.signInBtn} />
            </View>

            {/* Below the form container: the alternative way in. */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              label="Continue with Google"
              variant="secondary"
              onPress={handleGoogle}
              loading={googleLoading}
              disabled={googleLoading || loading}
              icon="logo-google"
              style={styles.googleBtn}
            />

            <View style={styles.infoBox}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              </View>
              <Text style={styles.infoText}>
                Your Head Doctor creates your account, then you verify your email before either
                sign-in method works.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <VerifyEmailNotice
        visible={noticeEmail !== null}
        email={noticeEmail || ''}
        onClose={() => setNoticeEmail(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  /**
   * A fixed band rather than a full-screen gradient. The header is reversed out
   * on the green and the card's top edge lifts off it, while everything below
   * the card is guaranteed to sit on the light ground where dark text reads.
   */
  bg: { position: 'absolute', top: 0, right: 0, left: 0, height: 300 },
  safe: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
    ...shadows.lg,
  },
  logoImg: { width: 48, height: 48 },
  // Set on the deep green field, so the brand lockup is reversed out.
  brand: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.72)',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.8,
    color: colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255, 255, 255, 0.82)',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xxl,
    padding: spacing.xxl,
    ...shadows.lg,
  },
  passwordWrap: { marginTop: spacing.lg },
  fieldLabel: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.green900,
    marginBottom: spacing.sm,
  },
  signInBtn: { marginTop: spacing.xxl },
  // On the light ground below the card, so the rules and label are green-tinted.
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: alpha.a12 },
  dividerText: {
    fontFamily: fonts.bodySemi,
    color: colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  googleBtn: {},
  infoBox: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: alpha.a10,
    ...shadows.sm,
  },
  infoIconWrap: { paddingTop: 1 },
  infoText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
});
