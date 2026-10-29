/**
 * Verifies the theme's text/surface pairs against WCAG AA.
 * The craft floor asks for computed values, not intentions.
 *
 *   node scripts/contrast.mjs
 */

const hex = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};

const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (h) => {
  const [r, g, b] = hex(h).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

const SURFACES = {
  white: '#FFFFFF',
  tint50: '#F7FBFA',
  tint200: '#EDF5F3',
  green50: '#F2F9F7',
  green100: '#DDEEEB',
};

// Candidate text ramp, tinted from the brand hue rather than neutral gray.
const TEXT = {
  text: '#0C1F1E',
  textSecondary: '#3D5453',
  textMuted: '#5A7371',
  green900: '#0B3D3B',
  green800: '#0F4C4A',
  green700: '#13635F',
  danger: '#A5271C',
  success: '#046C43',
  warning: '#8A4B06',
};

let failures = 0;

console.log('Body text needs >= 4.5:1, large/heading text >= 3:1\n');

for (const [sName, sHex] of Object.entries(SURFACES)) {
  console.log(`on ${sName} (${sHex})`);
  for (const [tName, tHex] of Object.entries(TEXT)) {
    const r = ratio(tHex, sHex);
    const body = r >= 4.5;
    const large = r >= 3;
    const mark = body ? 'AA' : large ? 'large-only' : 'FAIL';
    if (!large) failures += 1;
    console.log(`  ${tName.padEnd(16)} ${tHex}  ${r.toFixed(2).padStart(5)}:1  ${mark}`);
  }
  console.log('');
}

console.log(failures ? `${failures} pair(s) below 3:1` : 'No pair falls below 3:1');
