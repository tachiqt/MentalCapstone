import { useState, useRef } from 'react';
import {
  View,
  Text,
  ImageBackground,
  FlatList,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
  ViewToken,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { alpha, colors, fonts, spacing, radii, layout } from '../../lib/theme';

const { width, height } = Dimensions.get('window');

type Slide = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  background: number;
};

const slides: Slide[] = [
  {
    id: '1',
    title: 'Connected care',
    subtitle: "Everyone involved in a child's care, working from the same information.",
    icon: 'people-outline',
    background: require('../../assets/page1bg.png'),
  },
  {
    id: '2',
    title: 'Follow progress',
    subtitle: 'Track therapy, milestones, medication, and daily progress in one place.',
    icon: 'trending-up-outline',
    background: require('../../assets/page2bg.png'),
  },
  {
    id: '3',
    title: 'Better coordination',
    subtitle: 'Share meaningful updates and make care decisions with better context.',
    icon: 'chatbubbles-outline',
    background: require('../../assets/page3bg.png'),
  },
];

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const finish = async () => {
    await AsyncStorage.setItem('onboarding_done', '1');
    router.replace('/(auth)/login');
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) setCurrentIndex(viewableItems[0].index ?? 0);
  }).current;

  const goNext = () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      finish();
    }
  };

  return (
    <View style={styles.root}>
      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <ImageBackground
            source={item.background}
            style={[styles.slide, { width, height }]}
            resizeMode="cover"
          >
            <View style={[styles.overlay, { paddingTop: insets.top + spacing.sm }]}>
              <View style={styles.heroSpacer} />

              <View
                style={[
                  styles.content,
                  { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md },
                ]}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name={item.icon} size={28} color={colors.primary} />
                </View>

                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.subtitle}>{item.subtitle}</Text>

                <View style={styles.dots}>
                  {slides.map((s) => (
                    <View
                      key={s.id}
                      style={[styles.dot, item.id === s.id && styles.dotActive]}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={goNext}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={item.id === '3' ? 'Get Started' : 'Next'}
                >
                  <Text style={styles.nextLabel}>
                    {item.id === '3' ? 'Get Started' : 'Next'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={finish} style={styles.signInLink} hitSlop={8}>
                  <Text style={styles.signInMuted}>Already have an account? </Text>
                  <Text style={styles.signInAccent}>Sign in</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ImageBackground>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F7F2' },
  slide: { flex: 1 },
  overlay: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
  },
  heroSpacer: { flex: 1, minHeight: height * 0.32 },
  content: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
    marginBottom: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: alpha.a22,
  },
  dotActive: {
    width: 22,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  nextBtn: {
    alignSelf: 'stretch',
    minHeight: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  nextLabel: {
    fontFamily: fonts.headingSemi,
    fontSize: 16,
    color: colors.white,
  },
  signInLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    flexWrap: 'wrap',
  },
  signInMuted: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  signInAccent: {
    fontFamily: fonts.headingSemi,
    fontSize: 14,
    color: colors.primary,
  },
});
