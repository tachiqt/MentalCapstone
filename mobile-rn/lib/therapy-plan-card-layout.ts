/**
 * Shared layout tokens for therapy plan card headers so long titles
 * cannot push the status badge outside the card.
 */
export const therapyPlanCardLayout = {
  planHead: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
  },
  planTitle: {
    flex: 1,
    minWidth: 0,
  },
  planBadge: {
    flexShrink: 0,
  },
  planActionBtn: {
    minHeight: 44,
  },
};
