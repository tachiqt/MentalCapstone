import { ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tabIcon as sharedTabIcon, useAppTabScreenOptions } from './tab-options';

type IconName = keyof typeof Ionicons.glyphMap;

export function tabIcon(outline: IconName, filled: IconName, focused: boolean, color: ColorValue) {
  return sharedTabIcon(outline, filled, focused, color);
}

export function useParentTabScreenOptions() {
  return useAppTabScreenOptions({ showProfileInHeader: false });
}
