/**
 * Ensures progress photos open a full-screen lightbox for every role that uses AuthImage.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const authImage = readFileSync(join(root, 'components/AuthImage.tsx'), 'utf8');
const photoGrid = readFileSync(join(root, 'components/ProgressPhotoGrid.tsx'), 'utf8');

assert.match(authImage, /<Modal\b/);
assert.match(authImage, /View photo full screen/);
assert.match(authImage, /Close photo/);
assert.match(authImage, /setOpen\(true\)/);
assert.match(authImage, /resizeMode="contain"/);

assert.match(photoGrid, /AuthImage/);
assert.match(photoGrid, /download_path/);

for (const screen of [
  'app/(app)/(teacher)/child/[id].tsx',
  'app/(app)/(parent)/child/[id].tsx',
  'app/(app)/(parent)/progress.tsx',
  'app/(app)/(parent)/feedback.tsx',
]) {
  const source = readFileSync(join(root, screen), 'utf8');
  assert.match(source, /ProgressPhotoGrid/, `${screen} should render ProgressPhotoGrid`);
}

console.log('✔ auth image lightbox covers progress photos for all mobile roles');
