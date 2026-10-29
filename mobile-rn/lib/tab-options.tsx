import { ColorValue, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, colors, fonts, layout, shadows } from './theme';
import { HeaderActions } from '../components/HeaderActions';
import { HeaderBrand } from '../components/HeaderBrand';

type IconName = keyof typeof Ionicons.glyphMap;

type Options = {
  /** Teacher/Caretaker show profile in header; Parent uses bottom tab instead. */
  showProfileInHeader?: boolean;
};

export function tabIcon(outline: IconName, filled: IconName, focused: boolean, color: ColorValue) {
  return (
    <View
      style={{
        backgroundColor: focused ? colors.green100 : 'transparent',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 44,
      }}
    >
      <Ionicons name={focused ? filled : outline} size={22} color={color as string} />
    </View>
  );
}

export function useAppTabScreenOptions({ showProfileInHeader = true }: Options = {}) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);
  const topInset = Math.max(insets.top, 0);

  return {
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textMuted,
    tabBarLabelStyle: {
      fontFamily: fonts.bodyMedium,
      fontSize: 11,
      marginTop: 2,
      marginBottom: 2,
    },
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: alpha.a10,
      borderTopWidth: 1,
      height: layout.tabBarContentHeight + bottomInset,
      paddingTop: 6,
      paddingBottom: bottomInset,
      elevation: 4,
      shadowColor: shadows.md.shadowColor,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    tabBarItemStyle: {
      paddingTop: 2,
      minHeight: layout.touchTarget,
    },
    headerStyle: {
      backgroundColor: colors.tint50,
      elevation: 0,
      shadowOpacity: 0,
      borderBottomWidth: 1,
      borderBottomColor: alpha.a10,
    },
    headerStatusBarHeight: topInset,
    headerTitle: '',
    headerShadowVisible: false,
    headerLeft: () => <HeaderBrand />,
    headerRight: () => <HeaderActions showProfile={showProfileInHeader} />,
    sceneStyle: {
      backgroundColor: colors.background,
      paddingBottom: 0,
    },
    safeAreaInsets: {
      top: topInset,
      bottom: 0,
      left: insets.left,
      right: insets.right,
    },
  };
}

/** @deprecated Prefer useAppTabScreenOptions */
export function useTabScreenOptions() {
  return useAppTabScreenOptions({ showProfileInHeader: true });
}

/** @deprecated Prefer useAppTabScreenOptions({ showProfileInHeader: false }) */
export function useParentTabScreenOptions() {
  return useAppTabScreenOptions({ showProfileInHeader: false });
}
