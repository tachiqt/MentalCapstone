/**
 * Asserts therapy plan card layout tokens keep long titles from clipping badges.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const childScreen = readFileSync(join(root, 'app/(app)/(teacher)/child/[id].tsx'), 'utf8');
const layoutHelper = readFileSync(join(root, 'lib/therapy-plan-card-layout.ts'), 'utf8');
const webCss = readFileSync(join(root, '../web/css/styles.css'), 'utf8');

assert.match(childScreen, /planTitle[\s\S]*flex:\s*1/);
assert.match(childScreen, /planTitle[\s\S]*minWidth:\s*0/);
assert.match(childScreen, /numberOfLines=\{2\}/);
assert.match(childScreen, /planBadge[\s\S]*flexShrink:\s*0/);
assert.match(childScreen, /planActionBtn[\s\S]*minHeight:\s*44/);

assert.match(layoutHelper, /flex:\s*1/);
assert.match(layoutHelper, /minWidth:\s*0/);
assert.match(layoutHelper, /flexShrink:\s*0/);

assert.match(webCss, /\.profile-item__top h5\s*\{[^}]*min-width:\s*0/s);
assert.match(webCss, /\.profile-item__top h5\s*\{[^}]*flex:\s*1/s);
assert.match(webCss, /\.profile-item__top \.badge\s*\{[^}]*flex-shrink:\s*0/s);

console.log('✔ therapy plan card layout tokens look correct');
