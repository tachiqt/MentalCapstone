import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from './ui/Badge';
import { alpha, colors, fonts, spacing, radii } from '../lib/theme';

type Props = {
  name: string;
  diagnosis?: string;
  age?: number;
};

export function ChildCard({ name, diagnosis, age }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={18} color={colors.primary} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.name}>{name}</Text>
        {diagnosis ? <Badge label={diagnosis} tone="accent" /> : null}
        {age ? <Text style={styles.metaText}>Age {age}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: alpha.a08,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, gap: 4 },
  name: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.green900 },
  metaText: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
});
