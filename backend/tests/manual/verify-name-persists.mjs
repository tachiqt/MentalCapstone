/**
 * Reproduces the "profile name reverts on reload" bug against a live deployment.
 *
 * The bug was that docker/entrypoint.sh runs smartcare:ensure-head-doctor on
 * every container start, which used to overwrite the head doctor's name. So a
 * meaningful check has to survive a container restart, not just a round trip.
 *
 * Run the restart yourself between the two phases:
 *   node verify-name-persists.mjs set    # signs in and renames
 *   <force a new Cloud Run revision>
 *   node verify-name-persists.mjs check  # asserts the rename survived
 */
const BASE = process.env.SMARTCARE_API ?? 'https://smartcare-i3gelz4h6a-as.a.run.app/api/v1';
const EMAIL = process.env.SC_EMAIL ?? 'smartcare102030@gmail.com';
const PASSWORD = process.env.SC_PASSWORD ?? 'Smartcare123';
const MARKER_FILE = new URL('./.verify-name.json', import.meta.url);

const phase = process.argv[2];
if (!['set', 'check'].includes(phase)) {
  console.error('usage: node verify-name-persists.mjs <set|check>');
  process.exit(1);
}

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      accept: 'application/json',
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}\n${JSON.stringify(json, null, 2)}`);
  }
  return json;
}

async function login() {
  // The endpoint takes `username`, but matches it against username OR email.
  const out = await call('/login', {
    method: 'POST',
    body: { username: EMAIL, password: PASSWORD, client: 'web' },
  });
  const token = out.token ?? out.access_token;
  if (!token) throw new Error(`No token in login response: ${JSON.stringify(out).slice(0, 300)}`);
  return { token, user: out.user ?? out };
}

const { readFile, writeFile } = await import('node:fs/promises');

if (phase === 'set') {
  const { token, user } = await login();
  // The name rule allows letters, spaces, dots, apostrophes and hyphens only,
  // so the unique marker has to be spelled out rather than a timestamp.
  const suffix = Array.from(
    { length: 6 },
    () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]
  ).join('');
  const expected = `Persistence Probe ${suffix}`;

  await call('/me', {
    method: 'PUT',
    token,
    body: {
      name: expected,
      username: user.username,
      email: user.email,
      phone: user.phone ?? null,
    },
  });

  await writeFile(MARKER_FILE, JSON.stringify({ expected, previous: user.name }, null, 2));
  console.log(`was:      ${user.name}`);
  console.log(`renamed:  ${expected}`);
  console.log('\nNow force a new Cloud Run revision, then run: node verify-name-persists.mjs check');
} else {
  const { expected, previous } = JSON.parse(await readFile(MARKER_FILE, 'utf8'));
  const { user } = await login();

  console.log(`expected: ${expected}`);
  console.log(`actual:   ${user.name}`);

  if (user.name === expected) {
    console.log('\nPASS: the rename survived the container restart.');
  } else {
    console.log(`\nFAIL: reverted to "${user.name}" (pre-test value was "${previous}").`);
    process.exitCode = 1;
  }
}
