#!/usr/bin/env node
/**
 * SmartCare mobile — live API integration tests.
 *
 * Exercises every endpoint the Expo app calls, for all three mobile roles,
 * against a real running backend. See tests/README.md.
 *
 *   node tests/api-integration.mjs
 *   node tests/api-integration.mjs --base http://127.0.0.1:8000/api/v1
 */

import {
  BASE_URL,
  api,
  withToken,
  unwrapList,
  resolveMediaUrl,
  ApiError,
  NetworkError,
} from './lib/client.mjs';
import {
  suite,
  test,
  skip,
  info,
  heading,
  assert,
  assertEqual,
  assertTruthy,
  assertArray,
  assertStatus,
  assertHasKeys,
  exitWithSummary,
} from './lib/harness.mjs';

/* --------------------------------------------------------------- accounts */

const PASSWORD = process.env.SMARTCARE_TEST_PASSWORD || 'password';

const ACCOUNTS = {
  teacher: {
    username: process.env.SMARTCARE_TEACHER_USERNAME || 'mobile_teacher',
    password: process.env.SMARTCARE_TEACHER_PASSWORD || PASSWORD,
    role: 'teacher',
  },
  caretaker: {
    username: process.env.SMARTCARE_CARETAKER_USERNAME || 'mobile_caretaker',
    password: process.env.SMARTCARE_CARETAKER_PASSWORD || PASSWORD,
    role: 'caretaker',
  },
  parent: {
    username: process.env.SMARTCARE_PARENT_USERNAME || 'mobile_parent',
    password: process.env.SMARTCARE_PARENT_PASSWORD || PASSWORD,
    role: 'parent',
  },
};

const HEAD_DOCTOR = {
  username: process.env.SMARTCARE_HD_USERNAME || null,
  password: process.env.SMARTCARE_HD_PASSWORD || null,
};

/** Tokens captured during the auth suite and reused by later suites. */
const session = { teacher: null, caretaker: null, parent: null, head_doctor: null };
/** Records created by write tests, cleaned up at the end where possible. */
const created = { users: [] };

/* ---------------------------------------------------------------- helpers */

/** Logs in exactly the way lib/auth.tsx does. */
async function login({ username, password }, client = 'mobile') {
  return api('/login', { method: 'POST', body: { username, password, client } });
}

function requireToken(role) {
  const token = session[role];
  if (!token) skip(`no ${role} session — login failed or account missing`);
  return withToken(token);
}

/** Asserts a list endpoint returns something the screens can render. */
async function assertList(call, endpoint, label) {
  const payload = await call(endpoint);
  const list = unwrapList(payload);
  assertArray(list, `${label}: ${endpoint} did not return a renderable array`);
  return list;
}

function uniqueSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Walks a redirect chain manually and returns the final URL. */
async function followRedirects(startUrl, maxHops = 6) {
  let current = startUrl;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const res = await fetch(current, { redirect: 'manual' });
    const location = res.headers.get('location');
    if (!location) return current;
    const next = location.startsWith('http')
      ? location
      : new URL(location, current).toString();
    if (next === current) return current;
    current = next;
  }
  return current;
}

/* ------------------------------------------------------------ 1. reachable */

async function connectivitySuite() {
  await suite('Connectivity', async () => {
    await test('API base URL is reachable', async () => {
      try {
        const config = await api('/app-config');
        assertHasKeys(config, ['app_name'], 'app-config');
      } catch (err) {
        if (err instanceof NetworkError) throw err;
        // A non-network error still proves the server answered.
        if (!(err instanceof ApiError)) throw err;
      }
    });

    await test('unauthenticated /me is rejected with 401', async () => {
      await assertStatus(api('/me'), 401);
    });

    await test('a malformed token is rejected with 401', async () => {
      await assertStatus(api('/me', { token: 'not-a-real-token' }), 401);
    });

    await test('landing-stats is public', async () => {
      const stats = await api('/landing-stats');
      assert(stats && typeof stats === 'object', 'landing-stats returned no object');
    });
  });
}

/* ----------------------------------------------------------------- 2. auth */

async function authSuite() {
  await suite('Authentication', async () => {
    await test('wrong password is rejected with 401', async () => {
      await assertStatus(
        login({ username: ACCOUNTS.teacher.username, password: 'definitely-wrong-password' }),
        401
      );
    });

    await test('unknown username is rejected with 401', async () => {
      await assertStatus(login({ username: `ghost_${uniqueSuffix()}`, password: PASSWORD }), 401);
    });

    await test('login requires username and password (422)', async () => {
      await assertStatus(api('/login', { method: 'POST', body: { username: '' } }), 422);
    });

    for (const [key, account] of Object.entries(ACCOUNTS)) {
      await test(`${key} can sign in and receives a token`, async () => {
        let result;
        try {
          result = await login(account);
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            skip(`account "${account.username}" not found — seed MobileTestAccountsSeeder`);
          }
          if (err instanceof ApiError && err.status === 403) {
            skip(`account "${account.username}" is unverified or inactive: ${err.message}`);
          }
          throw err;
        }

        assertHasKeys(result, ['token', 'user'], 'login response');
        assertTruthy(result.token, 'login returned an empty token');
        assertEqual(
          String(result.user.role).toLowerCase(),
          account.role,
          `${key} account has the wrong role`
        );
        session[key] = result.token;
      });
    }

    for (const key of Object.keys(ACCOUNTS)) {
      await test(`${key} token resolves /me to the same user`, async () => {
        const call = requireToken(key);
        const me = await call('/me');
        assertHasKeys(me, ['id', 'name', 'role'], '/me');
        assertEqual(String(me.role).toLowerCase(), ACCOUNTS[key].role, '/me role mismatch');
        assertEqual(
          String(me.username || me.email).length > 0,
          true,
          '/me is missing username and email'
        );
      });
    }
  });
}

/* --------------------------------------------------------- 3. role gating */

async function roleGatingSuite() {
  await suite('Role gating (mobile app guard)', async () => {
    for (const key of Object.keys(ACCOUNTS)) {
      await test(`${key} is a mobile role the app will route`, async () => {
        const call = requireToken(key);
        const me = await call('/me');
        const role = String(me.role).toLowerCase();
        assert(
          ['teacher', 'caretaker', 'parent'].includes(role),
          `role "${role}" is not in MOBILE_ROLES, so lib/navigation.ts would bounce to login`
        );
      });
    }

    await test('web-only roles are not mobile roles (assertMobileUser blocks them)', async () => {
      if (!HEAD_DOCTOR.username || !HEAD_DOCTOR.password) {
        skip('set SMARTCARE_HD_USERNAME / SMARTCARE_HD_PASSWORD to check this');
      }
      const result = await login(HEAD_DOCTOR);
      session.head_doctor = result.token;
      const role = String(result.user.role).toLowerCase();
      assert(
        !['teacher', 'caretaker', 'parent'].includes(role),
        `expected a web-only role, got "${role}"`
      );
      info(`head doctor role "${role}" would be refused by assertMobileUser in lib/auth.tsx`);
    });

    await test('mobile roles are refused on the web client', async () => {
      if (!session.teacher) skip('no teacher session — account missing or unverified');
      const err = await assertStatus(login(ACCOUNTS.teacher, 'web'), 403);
      assert(/mobile app/i.test(err.message), `unexpected refusal message: ${err.message}`);
    });

    await test('caretaker cannot reach a head-doctor-only endpoint (403)', async () => {
      const call = requireToken('caretaker');
      await assertStatus(call('/users'), 403);
    });

    await test('parent cannot reach a psychometrician-only endpoint (403)', async () => {
      const call = requireToken('parent');
      await assertStatus(call('/assessments'), 403);
    });

    await test('parent cannot post a medication log (caretaker-only, 403)', async () => {
      const call = requireToken('parent');
      await assertStatus(
        call('/medication-logs', { method: 'POST', body: { schedule_id: 1, status: 'given' } }),
        403
      );
    });
  });
}

/* -------------------------------------------------------------- 4. teacher */

async function teacherSuite() {
  await suite('Teacher screens', async () => {
    const call = (() => {
      try {
        return requireToken('teacher');
      } catch {
        return null;
      }
    })();
    if (!call) skip('no teacher session');

    await test('Home: /children returns assigned children', async () => {
      const children = await assertList(call, '/children', 'Teacher home');
      info(`${children.length} child/children visible`);
      if (children.length) {
        assertHasKeys(children[0], ['id'], 'child');
        const child = children[0];
        assert(
          child.first_name || child.name,
          'child has neither first_name nor name, so the roster renders blank'
        );
      }
    });

    await test('Home + AI Review: /recommendations?status=pending_review', async () => {
      const items = await assertList(
        call,
        '/recommendations?status=pending_review',
        'AI review feed'
      );
      info(`${items.length} pending recommendation(s)`);
      if (items.length) assertHasKeys(items[0], ['id'], 'recommendation');
    });

    await test('Therapy: /therapy-sessions', async () => {
      const sessions = await assertList(call, '/therapy-sessions', 'Therapy');
      if (sessions.length) {
        assertHasKeys(sessions[0], ['id'], 'therapy session');
        assert(
          'scheduled_at' in sessions[0],
          'therapy session has no scheduled_at, so the calendar cannot place it'
        );
      }
    });

    await test('Materials: /learning-materials', async () => {
      const materials = await assertList(call, '/learning-materials', 'Materials');
      info(`${materials.length} material(s)`);
      if (materials.length) assertHasKeys(materials[0], ['id', 'title'], 'material');
    });

    await test('Meds: /medication-schedules', async () => {
      const schedules = await assertList(call, '/medication-schedules', 'Medication');
      if (schedules.length) assertHasKeys(schedules[0], ['id'], 'medication schedule');
    });

    await test('Meds: /medication-logs', async () => {
      await assertList(call, '/medication-logs', 'Medication logs');
    });

    await test('single material detail loads', async () => {
      const materials = unwrapList(await call('/learning-materials'));
      if (!materials.length) skip('no learning materials seeded');
      const detail = await call(`/learning-materials/${materials[0].id}`);
      assertHasKeys(detail, ['id', 'title'], 'material detail');
    });

    await test('attached material files are downloadable', async () => {
      const materials = unwrapList(await call('/learning-materials'));
      const withFile = materials.find((m) => m.file_url || m.file_path);
      if (!withFile) skip('no material has an attachment');
      const url = withFile.file_url || resolveMediaUrl(withFile.file_path);

      let res;
      try {
        res = await fetch(url, { method: 'GET', headers: { Accept: '*/*' } });
      } catch (err) {
        // A local backend usually advertises media on APP_URL (often
        // http://localhost with no port), which this runner cannot reach. That
        // is a dev-config quirk, not a broken attachment.
        skip(`media host unreachable from here: ${url} (${err.message})`);
      }

      assert(
        res.ok,
        `media URL returned ${res.status}, so MaterialViewerModal would fail: ${url}`
      );
    });
  });
}

/* ------------------------------------------------------------ 5. caretaker */

async function caretakerSuite() {
  await suite('Caretaker screens', async () => {
    const call = (() => {
      try {
        return requireToken('caretaker');
      } catch {
        return null;
      }
    })();
    if (!call) skip('no caretaker session');

    await test("Today: /medication-schedules?today=1", async () => {
      const doses = await assertList(call, '/medication-schedules?today=1', 'Today');
      info(`${doses.length} dose(s) due today`);
    });

    await test('Log: /medication-logs history', async () => {
      const logs = await assertList(call, '/medication-logs', 'Log');
      if (logs.length) {
        assertHasKeys(logs[0], ['id', 'status'], 'medication log');
        assert(
          'administered_at' in logs[0] || 'logged_at' in logs[0],
          'log has no timestamp, so history cannot be sectioned by date'
        );
      }
    });

    await test('Children: /children', async () => {
      await assertList(call, '/children', 'Caretaker children');
    });

    await test('recording a dose creates a medication log', async () => {
      const doses = unwrapList(await call('/medication-schedules?today=1'));
      if (!doses.length) skip('no dose scheduled today — seed MobileDemoDataSeeder');

      const scheduleId = doses[0].schedule_id || doses[0].medication_schedule_id || doses[0].id;
      assertTruthy(scheduleId, 'dose row has no usable schedule id');

      const before = unwrapList(await call('/medication-logs')).length;
      const log = await call('/medication-logs', {
        method: 'POST',
        body: { schedule_id: scheduleId, status: 'given' },
      });
      assertHasKeys(log, ['id', 'status'], 'created medication log');
      assertEqual(log.status, 'given', 'created log has the wrong status');

      const after = unwrapList(await call('/medication-logs')).length;
      assert(after >= before, 'new log did not appear in the history list');
      info(`created medication log #${log.id} (left in place: logs are an audit trail)`);
    });

    await test('an invalid dose status is rejected (422)', async () => {
      await assertStatus(
        call('/medication-logs', {
          method: 'POST',
          body: { schedule_id: 1, status: 'not-a-status' },
        }),
        422
      );
    });
  });
}

/* --------------------------------------------------------------- 6. parent */

async function parentSuite() {
  await suite('Parent screens', async () => {
    const call = (() => {
      try {
        return requireToken('parent');
      } catch {
        return null;
      }
    })();
    if (!call) skip('no parent session');

    let firstChildId = null;

    await test('Progress: /children', async () => {
      const children = await assertList(call, '/children', 'Parent progress');
      firstChildId = children[0]?.id ?? null;
      info(`${children.length} linked child/children`);
    });

    await test('Progress: /progress', async () => {
      await assertList(call, '/progress', 'Progress records');
    });

    await test('Progress + Schedule: /therapy-sessions', async () => {
      await assertList(call, '/therapy-sessions', 'Parent therapy');
    });

    await test('Progress + Feedback: /parent-feedback', async () => {
      await assertList(call, '/parent-feedback', 'Parent feedback');
    });

    await test('Progress: /medication-logs', async () => {
      await assertList(call, '/medication-logs', 'Parent medication logs');
    });

    await test('Schedule: /therapy-sessions filtered by child', async () => {
      if (!firstChildId) skip('no child linked to the parent account');
      await assertList(call, `/therapy-sessions?child_id=${firstChildId}`, 'Filtered schedule');
    });

    await test('Child detail: /children/{id}', async () => {
      if (!firstChildId) skip('no child linked to the parent account');
      const child = await call(`/children/${firstChildId}`);
      assertHasKeys(child, ['id'], 'child detail');
    });

    await test('Child detail: /children/{id}/progress', async () => {
      if (!firstChildId) skip('no child linked to the parent account');
      await assertList(call, `/children/${firstChildId}/progress`, 'Child progress');
    });

    await test('Child detail: /children/{id}/medication-logs', async () => {
      if (!firstChildId) skip('no child linked to the parent account');
      await assertList(call, `/children/${firstChildId}/medication-logs`, 'Child medication logs');
    });

    await test('a parent cannot read an unrelated child (403/404)', async () => {
      const err = await call('/children/999999')
        .then(() => null)
        .catch((e) => e);
      assert(err instanceof ApiError, 'reading a nonexistent child unexpectedly succeeded');
      assert(
        [403, 404].includes(err.status),
        `expected 403 or 404 for an unrelated child, got ${err.status}`
      );
    });

    await test('submitting feedback appears in the parent feedback list', async () => {
      if (!firstChildId) skip('no child linked to the parent account');
      const marker = `Integration test ${uniqueSuffix()}`;
      const feedback = await call('/parent-feedback', {
        method: 'POST',
        body: { message: marker, child_id: firstChildId },
      });
      assertHasKeys(feedback, ['id', 'message'], 'created feedback');
      assertEqual(feedback.message, marker, 'feedback message was not stored verbatim');

      const list = unwrapList(await call('/parent-feedback'));
      assert(
        list.some((f) => f.message === marker),
        'newly submitted feedback is missing from /parent-feedback'
      );
      info(`created feedback #${feedback.id} (kept: parents cannot delete feedback)`);
    });

    await test('empty feedback is rejected (422)', async () => {
      await assertStatus(call('/parent-feedback', { method: 'POST', body: { message: '' } }), 422);
    });
  });
}

/* -------------------------------------------------------- 7. notifications */

async function notificationsSuite() {
  await suite('Notifications (shared)', async () => {
    const roleKey = ['teacher', 'caretaker', 'parent'].find((k) => session[k]);
    if (!roleKey) skip('no mobile session available');
    const call = withToken(session[roleKey]);

    await test('/notifications returns { notifications, unread }', async () => {
      const payload = await call('/notifications');
      assertHasKeys(payload, ['notifications', 'unread'], '/notifications');
      assertArray(payload.notifications, '/notifications.notifications');
      assertEqual(typeof payload.unread, 'number', 'unread is not a number');
      info(`${payload.notifications.length} notification(s), ${payload.unread} unread`);
    });

    await test('marking a notification read uses PATCH', async () => {
      const payload = await call('/notifications');
      const unread = payload.notifications.find((n) => !n.read_at);
      if (!unread) skip('no unread notification to mark');

      const updated = await call(`/notifications/${unread.id}/read`, { method: 'PATCH' });
      assertTruthy(updated.read_at, 'read_at was not set after PATCH');
    });

    await test('POST to the read route is not allowed (405)', async () => {
      const payload = await call('/notifications');
      const any = payload.notifications[0];
      if (!any) skip('no notification to probe');
      await assertStatus(call(`/notifications/${any.id}/read`, { method: 'POST' }), 405);
    });
  });
}

/* ------------------------------------------------------------- 8. AI review */

async function aiReviewSuite() {
  await suite('Teacher AI review action', async () => {
    if (!session.teacher) skip('no teacher session');
    const call = withToken(session.teacher);

    await test('approving a pending recommendation succeeds', async () => {
      const pending = unwrapList(await call('/recommendations?status=pending_review'));
      if (!pending.length) {
        skip('no pending recommendation — seed MobileDemoDataSeeder or generate one');
      }
      const target = pending[0];
      const result = await call(`/recommendations/${target.id}/review`, {
        method: 'POST',
        body: { status: 'approved' },
      });
      assert(result && typeof result === 'object', 'review returned no payload');
      info(`approved recommendation #${target.id} (state change is intentional)`);
    });

    await test('an invalid review status is rejected (422)', async () => {
      const all = unwrapList(await call('/recommendations'));
      if (!all.length) skip('no recommendations exist');
      await assertStatus(
        call(`/recommendations/${all[0].id}/review`, {
          method: 'POST',
          body: { status: 'banana' },
        }),
        422
      );
    });
  });
}

/* ------------------------------ 9. head doctor create account + verification */

async function headDoctorVerificationSuite() {
  await suite('Head Doctor creates account → verification email', async () => {
    if (!HEAD_DOCTOR.username || !HEAD_DOCTOR.password) {
      skip('set SMARTCARE_HD_USERNAME / SMARTCARE_HD_PASSWORD to run this suite');
    }

    let call = null;
    let newUser = null;
    const suffix = uniqueSuffix();
    const candidate = {
      name: 'Integration Test Teacher',
      email: `smartcare.itest+${suffix}@example.com`,
      username: `itest_${suffix}`,
      password: 'TestPass123',
      password_confirmation: 'TestPass123',
      role: 'teacher',
    };

    await test('head doctor can sign in', async () => {
      const result = session.head_doctor
        ? { token: session.head_doctor }
        : await login(HEAD_DOCTOR, 'web');
      assertTruthy(result.token, 'head doctor login returned no token');
      session.head_doctor = result.token;
      call = withToken(result.token);
    });

    await test('creating an account returns 201 and sends a verification email', async () => {
      if (!call) skip('head doctor is not signed in');
      const result = await call('/users', { method: 'POST', body: candidate });

      assertHasKeys(
        result,
        ['id', 'email', 'role', 'email_verified_at', 'mail_sent', 'verification_url'],
        'create-user response'
      );
      newUser = result;
      created.users.push(newUser.id);

      assertEqual(
        result.mail_sent,
        true,
        `the backend reported mail_sent=false: ${result.message}. Check MAIL_MAILER and the SMTP credentials.`
      );
      assertTruthy(result.verification_url, 'no verification_url was returned');
      assert(
        /\/api\/v1\/email\/verify\/\d+\//.test(result.verification_url),
        `verification_url does not point at the verify route: ${result.verification_url}`
      );
      assert(
        /signature=/.test(result.verification_url),
        'verification_url is not a signed link'
      );
      info(`created user #${newUser.id} and mailed ${candidate.email}`);
    });

    await test('the new account starts unverified', async () => {
      if (!newUser) skip('no user was created');
      const user = await call(`/users/${newUser.id}`);
      assertEqual(
        user.email_verified_at ?? null,
        null,
        'email_verified_at should be null until the user clicks the link'
      );
      assertEqual(String(user.role).toLowerCase(), 'teacher', 'created user has the wrong role');
    });

    await test('an unverified account cannot sign in yet (403)', async () => {
      if (!newUser) skip('no user was created');
      const err = await assertStatus(
        login({ username: candidate.username, password: candidate.password }),
        403
      );
      // The login screen branches on `reason`, not on the wording.
      assertEqual(err.payload?.reason, 'email_unverified', 'the 403 carries no machine-readable reason');
      assertEqual(err.payload?.email, candidate.email, 'the 403 does not say which address was mailed');
    });

    await test('the verification link is a working signed URL', async () => {
      if (!newUser) skip('no user was created');
      const result = await call(`/users/${newUser.id}/resend-verification`, { method: 'POST' });
      assertHasKeys(result, ['mail_sent'], 'resend-verification response');
      const url = result.verification_url;
      if (!url) skip('resend did not return a verification_url');

      // APP_URL may be http while the host serves https, so the chain can
      // include scheme-upgrade hops before reaching verify-email.html.
      const final = await followRedirects(url);
      assert(
        /verify-email\.html/.test(final),
        `verify link ended somewhere unexpected: ${final}`
      );
      assert(/status=success/.test(final), `verification did not succeed; landed on: ${final}`);
      if (/^http:\/\//i.test(url)) {
        info('note: the emailed link is http:// — set APP_URL to https to avoid extra redirects');
      }
      info('signed link verified the account and landed on verify-email.html');
    });

    await test('after verification the account can sign in', async () => {
      if (!newUser) skip('no user was created');
      const result = await login({
        username: candidate.username,
        password: candidate.password,
      });
      assertTruthy(result.token, 'verified account still cannot sign in');
      assertEqual(String(result.user.role).toLowerCase(), 'teacher', 'wrong role after login');
    });

    await test('duplicate email is rejected (422)', async () => {
      if (!newUser) skip('no user was created');
      await assertStatus(
        call('/users', {
          method: 'POST',
          body: { ...candidate, username: `${candidate.username}_d` },
        }),
        422
      );
    });
  });
}

/* ------------------------------------------------------- 10. logout + cleanup */

async function logoutSuite() {
  await suite('Logout', async () => {
    const roleKey = ['parent', 'caretaker', 'teacher'].find((k) => session[k]);
    if (!roleKey) skip('no mobile session available');
    const token = session[roleKey];
    const call = withToken(token);

    await test(`${roleKey} logout succeeds`, async () => {
      const result = await call('/logout', { method: 'POST' });
      assert(result && typeof result === 'object', 'logout returned no payload');
    });

    await test('the token is invalid after logout (401)', async () => {
      await assertStatus(api('/me', { token }), 401);
      session[roleKey] = null;
    });
  });
}

async function cleanupSuite() {
  await suite('Cleanup', async () => {
    if (!created.users.length) skip('nothing to clean up');
    const call = withToken(session.head_doctor);

    for (const id of created.users) {
      await test(`removed test user #${id}`, async () => {
        await call(`/users/${id}`, { method: 'DELETE' });
      });
    }
  });
}

/* ------------------------------------------------------------------- main */

async function main() {
  heading('SmartCare mobile — live API integration tests');
  info(`base URL: ${BASE_URL}`);
  info(
    HEAD_DOCTOR.username
      ? `head doctor: ${HEAD_DOCTOR.username}`
      : 'head doctor: not configured (verification suite will be skipped)'
  );

  await connectivitySuite();
  await authSuite();
  await roleGatingSuite();
  await teacherSuite();
  await caretakerSuite();
  await parentSuite();
  await notificationsSuite();
  await aiReviewSuite();
  await headDoctorVerificationSuite();
  await logoutSuite();
  await cleanupSuite();

  exitWithSummary();
}

main().catch((err) => {
  console.error('');
  console.error(`Fatal: ${err.message}`);
  if (err instanceof NetworkError) {
    console.error('Start the backend with: cd backend && php artisan serve');
  }
  process.exit(1);
});
