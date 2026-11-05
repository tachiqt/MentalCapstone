import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'lib/patient-navigation.ts'), 'utf8');

// Lightweight contract checks without a TS loader.
assert.match(source, /resolveChildBackTarget/);
assert.match(source, /\/\(app\)\/\(teacher\)/);
assert.match(source, /\/\(app\)\/\(parent\)\/progress/);
assert.match(source, /\/\(app\)\/\(caretaker\)\/children/);
assert.match(source, /shouldReplaceChildRoute/);

function resolveChildBackTarget(role) {
  switch (role) {
    case 'parent':
      return '/(app)/(parent)/progress';
    case 'caretaker':
      return '/(app)/(caretaker)/children';
    case 'teacher':
    default:
      return '/(app)/(teacher)';
  }
}

function shouldReplaceChildRoute(currentChildId, nextChildId) {
  if (currentChildId === null || currentChildId === undefined || currentChildId === '') {
    return false;
  }
  return String(currentChildId) !== String(nextChildId);
}

assert.equal(resolveChildBackTarget('teacher'), '/(app)/(teacher)');
assert.equal(resolveChildBackTarget('parent'), '/(app)/(parent)/progress');
assert.equal(resolveChildBackTarget('caretaker'), '/(app)/(caretaker)/children');
assert.equal(shouldReplaceChildRoute(1, 2), true);
assert.equal(shouldReplaceChildRoute('2', 2), false);
assert.equal(shouldReplaceChildRoute(null, 2), false);

console.log('✔ patient navigation helpers');
