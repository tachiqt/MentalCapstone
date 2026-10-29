import { ReactNode } from 'react';
import { View, Text, StyleSheet, TextInput, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { alpha, colors, fonts, radii } from '../../lib/theme';

type Props = TextInputProps & {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function TextField({ label, icon, style, ...props }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.field}>
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={styles.icon} /> : null}
        <TextInput
          {...props}
          style={[styles.input, icon ? styles.inputWithIcon : undefined, style]}
          placeholderTextColor={colors.textMuted}
        />
      </View>
    </View>
  );
}

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <View style={styles.shell}>
      <View style={styles.hero}>
        <View style={styles.logoRing}>
          <Ionicons name="leaf" size={28} color={colors.primary} />
        </View>
        <Text style={styles.brand}>SmartCare</Text>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.card}>{children}</View>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  hero: {
    backgroundColor: colors.primary,
    paddingTop: 56,
    paddingBottom: 40,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  logoRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  brand: { fontFamily: fonts.headingSemi, fontSize: 14, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5 },
  heroTitle: { fontFamily: fonts.heading, fontSize: 28, color: colors.white, marginTop: 4 },
  heroSubtitle: { fontFamily: fonts.body, fontSize: 15, color: 'rgba(255,255,255,0.82)', marginTop: 6, lineHeight: 22 },
  card: {
    marginTop: -24,
    marginHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: alpha.a08,
    shadowColor: '#0F4C4A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  wrap: { marginBottom: 14 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  field: { position: 'relative' },
  icon: { position: 'absolute', left: 14, top: 15, zIndex: 1 },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  inputWithIcon: { paddingLeft: 44 },
});
