/**
 * Generates the app icon set from assets/logo.png.
 *
 * Expo derives every launcher density from these masters, so we only need:
 *   icon.png                     opaque 1024 square (iOS forbids alpha)
 *   android-icon-foreground.png  transparent, logo kept inside the adaptive
 *                                safe zone so round/squircle masks never clip it
 *   android-icon-monochrome.png  flat silhouette for themed icons
 *   splash-icon.png              transparent logo for the launch screen
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const source = join(assets, 'logo.png');

const SIZE = 1024;
/** Android only guarantees the middle 66% of the adaptive foreground is visible. */
const FOREGROUND_SCALE = 0.6;
const ICON_SCALE = 0.78;
const SPLASH_SCALE = 0.85;

const meta = await sharp(source).metadata();
console.log(`source: ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`);

/**
 * The logo ships with generous whitespace baked in. Trimming to the ink first
 * means our own padding maths actually controls the optical size.
 */
async function inkOnly() {
  const flattened = meta.hasAlpha
    ? await sharp(source).flatten({ background: '#ffffff' }).png().toBuffer()
    : await sharp(source).png().toBuffer();

  const trimmed = await sharp(flattened).trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
  console.log(`trimmed to: ${trimmed.info.width}x${trimmed.info.height}`);

  // Re-cut the trimmed box out of the original so transparency survives.
  const { width, height } = trimmed.info;
  const left = -(trimmed.info.trimOffsetLeft ?? 0);
  const top = -(trimmed.info.trimOffsetTop ?? 0);
  return sharp(source).extract({ left, top, width, height }).png().toBuffer();
}

const ink = await inkOnly();

/** Fits the logo into a `scale` fraction of a SIZE square, centred. */
async function centred(scale) {
  const box = Math.round(SIZE * scale);
  const resized = await sharp(ink)
    .resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function write(name, buffer) {
  await sharp(buffer).png({ compressionLevel: 9 }).toFile(join(assets, name));
  console.log(`wrote ${name}`);
}

// Opaque master icon on white; the mark is mid-green and needs a light ground.
await write(
  'icon.png',
  await sharp(await centred(ICON_SCALE)).flatten({ background: '#ffffff' }).png().toBuffer()
);

const foreground = await centred(FOREGROUND_SCALE);
await write('android-icon-foreground.png', foreground);

// Themed icons are recoloured by the system, so only the silhouette carries
// information: paint the mark's own alpha channel solid black.
const silhouette = await sharp(foreground).extractChannel('alpha').toBuffer();
await write(
  'android-icon-monochrome.png',
  await sharp({
    create: { width: SIZE, height: SIZE, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .joinChannel(silhouette)
    .png()
    .toBuffer()
);

await write('splash-icon.png', await centred(SPLASH_SCALE));
await write('favicon.png', await sharp(await centred(0.9)).resize(48, 48).png().toBuffer());
