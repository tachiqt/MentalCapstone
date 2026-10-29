import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChildAvatar } from './ui/ChildAvatar';
import { alpha, colors, fonts, spacing, radii, shadows } from '../lib/theme';

type Props = {
  name: string;
  diagnosis?: string;
  ageBand?: number;
  latestTitle?: string;
  latestDate?: string;
  latestMilestone?: string;
  milestoneCount?: number;
  onPress: () => void;
};

export function ParentChildCard({
  name,
  diagnosis,
  ageBand,
  latestTitle,
  latestDate,
  latestMilestone,
  milestoneCount = 0,
  onPress,
}: Props) {
  const hasLatest = Boolean(latestTitle?.trim());

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <View style={styles.topRow}>
        <ChildAvatar name={name} size={48} />
        <View style={styles.headerCopy}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {ageBand != null ? <Text style={styles.meta}>Age {ageBand}</Text> : null}
        </View>
        <View style={styles.countChip}>
          <Text style={styles.countValue}>{milestoneCount}</Text>
          <Text style={styles.countLabel}>
            {milestoneCount === 1 ? 'milestone' : 'milestones'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>

      {diagnosis?.trim() ? (
        <View style={styles.diagnosisWrap}>
          <Text style={styles.diagnosisText}>{diagnosis.trim()}</Text>
        </View>
      ) : null}

      {hasLatest ? (
        <View style={styles.latestBox}>
          <View style={styles.latestRail} />
          <View style={styles.latestCopy}>
            <Text style={styles.latestLabel}>Latest progress</Text>
            <Text style={styles.latestTitle} numberOfLines={2}>
              {latestTitle!.trim()}
            </Text>
            {(latestMilestone?.trim() || latestDate) ? (
              <View style={styles.latestFooter}>
                {latestMilestone?.trim() ? (
                  <Text style={styles.latestMilestone} numberOfLines={1}>
                    {latestMilestone.trim()}
                  </Text>
                ) : (
                  <View style={styles.footerSpacer} />
                )}
                {latestDate ? <Text style={styles.latestDate}>{latestDate}</Text> : null}
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <Text style={styles.noProgress}>No progress recorded yet</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: alpha.a08,
    gap: spacing.sm,
    ...shadows.sm,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontFamily: fonts.headingSemi, fontSize: 16, color: colors.green900 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  countChip: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: alpha.a12,
    minWidth: 48,
  },
  countValue: { fontFamily: fonts.heading, fontSize: 16, color: colors.primary },
  countLabel: { fontFamily: fonts.body, fontSize: 9, color: colors.textMuted, textAlign: 'center' },
  diagnosisWrap: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    maxWidth: '100%',
  },
  diagnosisText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
  },
  latestBox: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  latestRail: {
    width: 4,
    backgroundColor: colors.primary,
  },
  latestCopy: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  latestLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  latestTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  latestFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  footerSpacer: { flex: 1 },
  latestMilestone: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.primary, flex: 1 },
  latestDate: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  noProgress: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
