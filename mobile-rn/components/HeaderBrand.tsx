import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '../lib/theme';

export function HeaderBrand() {
  return (
    <View style={styles.wrap}>
      <Image
        source={require('../assets/logo.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="SmartCare logo"
      />
      <Text style={styles.name}>SmartCare</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginLeft: spacing.lg,
  },
  logo: {
    width: 32,
    height: 32,
  },
  name: {
    fontFamily: fonts.headingSemi,
    fontSize: 18,
    color: colors.primary,
    letterSpacing: -0.3,
  },
});
