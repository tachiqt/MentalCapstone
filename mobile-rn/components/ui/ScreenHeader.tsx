import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, colors, fonts, gradients, radii, spacing } from '../../lib/theme';

type Props = {
  /** Optional centered title. Omit when the screen already shows the name below. */
  title?: string;
  /** Trailing control, e.g. a "Mark all read" action. */
  action?: ReactNode;
  /** Custom back handler. Prefer this for patient profiles. */
  onBack?: () => void;
  /** When set and onBack is omitted, navigate here instead of router.back(). */
  fallbackHref?: string;
};

export function ScreenHeader({ title, action, onBack, fallbackHref }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hasTitle = Boolean(title?.trim());

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (fallbackHref) {
      router.navigate(fallbackHref as any);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
  };

  return (
    <LinearGradient
      colors={gradients.header}
      style={[styles.header, { paddingTop: insets.top + spacing.sm }]}
    >
      <TouchableOpacity
        style={styles.backBtn}
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={styles.backIcon}>
          <Ionicons name="chevron-back" size={20} color={colors.green800} />
        </View>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
      {hasTitle ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.titleSpacer} />
      )}
      <View style={styles.trailing}>{action}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: alpha.a10,
    gap: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 72,
    paddingVertical: spacing.xs,
  },
  backIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.green50,
    borderWidth: 1,
    borderColor: alpha.a12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.green800,
  },
  title: {
    flex: 1,
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    letterSpacing: -0.2,
    color: colors.green900,
    textAlign: 'center',
  },
  titleSpacer: { flex: 1 },
  trailing: { minWidth: 72, alignItems: 'flex-end' },
});
