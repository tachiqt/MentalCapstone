/**
 * SmartCare mobile design tokens.
 *
 * Visual world: a calm clinical companion. Deep teal-green carries the brand,
 * white cards carry the work, and a barely-there tinted ground keeps the app
 * from feeling like a stack of floating boxes. Type does the heavy lifting:
 * Figtree for anything that names something, Noto Sans for anything you read.
 *
 * Every text/surface pair below is checked by `node scripts/contrast.mjs`.
 * Secondary text is tinted from the brand hue rather than neutral gray, so it
 * reads as part of the palette instead of dust on top of it.
 */

export const colors = {
  // Brand ramp, aligned with the --teal-* scale in the web dashboard.
  green900: '#0B3D3B',
  green800: '#0F4C4A',
  green700: '#13635F',
  greenBright: '#1A7A74',
  green100: '#DDEEEB',
  green50: '#F2F9F7',

  primary: '#0F4C4A',
  primaryLight: '#1A6B68',
  primarySoft: '#F2F9F7',
  accent: '#13635F',
  accentSoft: '#DDEEEB',

  /** App ground. Cards sit on this, so it stays a whisper away from white. */
  background: '#F4F8F7',
  surface: '#FFFFFF',
  surfaceMuted: '#F7FBFA',

  // Tinted panel fills, lightest to deepest, for layering green on white.
  tint50: '#F7FBFA',
  tint100: '#F4F9F8',
  tint200: '#EDF5F3',
  tint300: '#E4F0ED',

  // Status colors, all darkened to clear 4.5:1 on white and on their own tints.
  danger: '#A5271C',
  dangerLight: '#FDECEA',
  success: '#046C43',
  successLight: '#E3F5EC',
  warning: '#8A4B06',
  warningLight: '#FDF1E3',
  info: '#13635F',
  infoLight: '#DDEEEB',

  /** Text ramp. 17.07 / 8.10 / 5.09 against white. */
  text: '#0C1F1E',
  textSecondary: '#3D5453',
  /** Never place on green100 or deeper — it drops to 4.24:1 there. */
  textMuted: '#5A7371',

  border: '#DFE9E7',
  borderLight: '#EDF3F2',
  overlay: 'rgba(12, 31, 30, 0.45)',
  white: '#FFFFFF',
};

/**
 * Green-tinted lines and washes. A neutral gray border reads as dirty against
 * a green-tinted surface, so borders are drawn from the brand hue instead.
 */
export const alpha = {
  a06: 'rgba(15, 76, 74, 0.06)',
  a08: 'rgba(15, 76, 74, 0.08)',
  a10: 'rgba(15, 76, 74, 0.10)',
  a12: 'rgba(15, 76, 74, 0.12)',
  a16: 'rgba(15, 76, 74, 0.16)',
  a18: 'rgba(15, 76, 74, 0.18)',
  a22: 'rgba(15, 76, 74, 0.22)',
};

/** Gradient stop pairs for the recurring washes. Consumed by expo-linear-gradient. */
export const gradients = {
  /** Header and section panel wash: faint green fading into white. */
  header: ['#F7FBFA', '#FFFFFF'] as const,
  /** Slightly stronger wash for hero and metric panels. */
  panel: ['#E4F0ED', '#F7FBFA'] as const,
  /** Solid brand wash for inverted surfaces. */
  brand: ['#0F4C4A', '#13635F'] as const,
};

/**
 * Real faces, loaded in app/_layout.tsx. Weight lives in the family name, so
 * styles must not also set `fontWeight` — Android would synthesize a second
 * time and smear the result.
 */
export const fonts = {
  heading: 'Figtree_700Bold',
  headingSemi: 'Figtree_600SemiBold',
  headingMedium: 'Figtree_500Medium',
  body: 'NotoSans_400Regular',
  bodyMedium: 'NotoSans_500Medium',
  bodySemi: 'NotoSans_600SemiBold',
};

/**
 * One scale, obvious steps. Tracking tightens as size grows, which is what
 * keeps large headings from looking like enlarged body copy.
 */
export const typography = {
  display: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, letterSpacing: -0.7 },
  screenTitle: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  section: { fontFamily: fonts.headingSemi, fontSize: 18, lineHeight: 24, letterSpacing: -0.25 },
  cardTitle: { fontFamily: fonts.headingSemi, fontSize: 16, lineHeight: 22, letterSpacing: -0.15 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  supporting: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  /** All-caps labels need the tracking opened back up to stay legible. */
  micro: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 15, letterSpacing: 0.4 },
  /** Figures in metric tiles: tabular-feeling, tight, confident. */
  metric: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 30, letterSpacing: -0.8 },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  massive: 48,
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 26,
  pill: 999,
};

/**
 * Depth is a tinted, offset, softly-blurred drop — never a zero-offset halo.
 * Kept shallow: this is an Operate surface, not a showcase.
 */
export const shadows = {
  sm: {
    shadowColor: '#0B3D3B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  md: {
    shadowColor: '#0B3D3B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0B3D3B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
};

export const layout = {
  tabBarHeight: 68,
  tabBarContentHeight: 56,
  headerIconSize: 22,
  headerContentHeight: 56,
  /** Android and iOS both want 44pt minimum; several roles work one-handed. */
  touchTarget: 44,
  screenPadding: 20,
  sectionGap: 28,
};

export const motion = {
  fast: 150,
  normal: 200,
  slow: 250,
};
