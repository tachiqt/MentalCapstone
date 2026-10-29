/**
 * Minimal test harness for the SmartCare mobile API integration suite.
 * No dependencies: plain Node ESM.
 */

const useColor = process.env.NO_COLOR ? false : true;

const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
const green = (t) => paint('32', t);
const red = (t) => paint('31', t);
const yellow = (t) => paint('33', t);
const dim = (t) => paint('2', t);
const bold = (t) => paint('1', t);
const cyan = (t) => paint('36', t);

const results = { passed: 0, failed: 0, skipped: 0 };
const failures = [];
let currentSuite = 'root';

export class SkipTest extends Error {}

export function skip(reason) {
  throw new SkipTest(reason || 'skipped');
}

export async function suite(name, fn) {
  currentSuite = name;
  console.log('');
  console.log(bold(cyan(`── ${name} `.padEnd(72, '─'))));
  try {
    await fn();
  } catch (err) {
    if (err instanceof SkipTest) {
      results.skipped += 1;
      console.log(`  ${yellow('○')} suite skipped ${dim(`— ${err.message}`)}`);
      return;
    }
    results.failed += 1;
    failures.push({ suite: name, test: '(suite setup)', message: err.message });
    console.log(`  ${red('✖')} suite aborted ${dim(`— ${err.message}`)}`);
  }
}

export async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    const ms = Date.now() - started;
    results.passed += 1;
    console.log(`  ${green('✔')} ${name} ${dim(`(${ms}ms)`)}`);
  } catch (err) {
    if (err instanceof SkipTest) {
      results.skipped += 1;
      console.log(`  ${yellow('○')} ${name} ${dim(`— ${err.message}`)}`);
      return;
    }
    results.failed += 1;
    failures.push({ suite: currentSuite, test: name, message: err.message });
    console.log(`  ${red('✖')} ${name}`);
    console.log(`      ${red(err.message)}`);
  }
}

export function info(message) {
  console.log(`  ${dim('·')} ${dim(message)}`);
}

export function heading(message) {
  console.log('');
  console.log(bold(message));
}

/* ---------------------------------------------------------------- asserts */

export function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertTruthy(value, message) {
  if (!value) throw new Error(message || `Expected a truthy value, got ${JSON.stringify(value)}`);
}

export function assertType(value, type, message) {
  if (typeof value !== type) {
    throw new Error(message || `Expected type ${type}, got ${typeof value} (${JSON.stringify(value)})`);
  }
}

export function assertArray(value, message) {
  if (!Array.isArray(value)) {
    throw new Error(message || `Expected an array, got ${typeof value}: ${JSON.stringify(value)?.slice(0, 120)}`);
  }
}

/**
 * Asserts a rejected request carried the given HTTP status.
 * Works with ApiError thrown by client.mjs.
 */
export async function assertStatus(promise, expected, message) {
  try {
    const value = await promise;
    throw new Error(
      message || `Expected HTTP ${expected} but request succeeded with: ${JSON.stringify(value)?.slice(0, 160)}`
    );
  } catch (err) {
    if (err?.name !== 'ApiError') throw err;
    if (err.status !== expected) {
      throw new Error(message || `Expected HTTP ${expected}, got ${err.status} (${err.message})`);
    }
    return err;
  }
}

/** Asserts every named key is present on the object. */
export function assertHasKeys(obj, keys, label = 'object') {
  assert(obj && typeof obj === 'object', `${label} is not an object: ${JSON.stringify(obj)}`);
  const missing = keys.filter((k) => !(k in obj));
  if (missing.length) {
    throw new Error(`${label} is missing key(s): ${missing.join(', ')}. Got: ${Object.keys(obj).join(', ')}`);
  }
}

/* ----------------------------------------------------------------- report */

export function summary() {
  const total = results.passed + results.failed + results.skipped;
  console.log('');
  console.log(bold('─'.repeat(72)));

  if (failures.length) {
    console.log(bold(red(`${failures.length} failure(s):`)));
    failures.forEach((f, i) => {
      console.log(`  ${red(`${i + 1}.`)} ${bold(f.suite)} › ${f.test}`);
      console.log(`     ${dim(f.message)}`);
    });
    console.log('');
  }

  console.log(
    [
      bold(`${total} checks`),
      green(`${results.passed} passed`),
      results.failed ? red(`${results.failed} failed`) : dim('0 failed'),
      results.skipped ? yellow(`${results.skipped} skipped`) : dim('0 skipped'),
    ].join('  ·  ')
  );
  console.log('');

  return results.failed === 0;
}

export function exitWithSummary() {
  const ok = summary();
  process.exit(ok ? 0 : 1);
}
