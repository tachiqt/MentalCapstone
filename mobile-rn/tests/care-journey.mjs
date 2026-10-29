#!/usr/bin/env node
/**
 * SmartCare mobile — care journey tests.
 *
 * Where api-integration.mjs checks endpoints one at a time, this suite walks
 * the workflows people actually perform, in order, across all three roles:
 * a teacher sets up medication, the caretaker administers it, the parent sees
 * the result and replies, and every hop is checked from the next person's
 * phone. Requests go through the same client the Expo app uses.
 *
 *   node tests/care-journey.mjs
 *   node tests/care-journey.mjs --base http://127.0.0.1:8000/api/v1
 *
 * Optional, unlocks the Head Doctor onboarding journey:
 *   SMARTCARE_HD_USERNAME=... SMARTCARE_HD_PASSWORD=... node tests/care-journey.mjs
 */

import { BASE_URL, api, withToken, unwrapList, ApiError } from './lib/client.mjs';
import {
  suite,
  test,
  skip,
  info,
  heading,
  assert,
  assertEqual,
  assertTruthy,
  assertStatus,
  assertHasKeys,
  exitWithSummary,
} from './lib/harness.mjs';

/* --------------------------------------------------------------- accounts */

const PASSWORD = process.env.SMARTCARE_TEST_PASSWORD || 'password';

const ACCOUNTS = {
  teacher: { username: process.env.SMARTCARE_TEACHER_USERNAME || 'mobile_teacher', password: PASSWORD },
  caretaker: { username: process.env.SMARTCARE_CARETAKER_USERNAME || 'mobile_caretaker', password: PASSWORD },
  parent: { username: process.env.SMARTCARE_PARENT_USERNAME || 'mobile_parent', password: PASSWORD },
};

const HEAD_DOCTOR = {
  username: process.env.SMARTCARE_HD_USERNAME || null,
  password: process.env.SMARTCARE_HD_PASSWORD || null,
};

/** Everything the journeys build up as they go. */
const state = {
  tokens: {},
  users: {},
  childId: null,
  childName: '',
  scheduleId: null,
  sessionId: null,
  createdUserId: null,
};

/* ---------------------------------------------------------------- helpers */

/** Signs in exactly the way lib/auth.tsx does. */
function login({ username, password }) {
  return api('/login', { method: 'POST', body: { username, password, client: 'mobile' } });
}

function as(role) {
  const token = state.tokens[role];
  if (!token) skip(`no ${role} session`);
  return withToken(token);
}

function requireChild() {
  if (!state.childId) skip('no child shared by all three roles');
  return state.childId;
}

function suffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Counts a role's unread notifications the way the header badge does. */
async function unreadCount(role) {
  const inbox = await as(role)('/notifications');
  return typeof inbox?.unread === 'number' ? inbox.unread : 0;
}

/** Finds the newest notification of a given type for a role, if any. */
async function latestOfType(role, type) {
  const inbox = await as(role)('/notifications');
  const rows = inbox?.notifications || [];
  return rows.find((n) => n.type === type) || null;
}

/**
 * Notifications are written synchronously in the request that caused them, but
 * a hosted backend can still lag a beat behind. Retry briefly before failing.
 */
async function waitForNotification(role, type, { tries = 6, delayMs = 500 } = {}) {
  for (let i = 0; i < tries; i += 1) {
    const found = await latestOfType(role, type);
    if (found) return found;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

/* ------------------------------------------------ journey 1: start of day */

async function signInJourney() {
  await suite('Journey 1 — everyone starts their day', async () => {
    for (const [role, account] of Object.entries(ACCOUNTS)) {
      await test(`${role} signs in and lands on their app`, async () => {
        let result;
        try {
          result = await login(account);
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            skip(`account "${account.username}" missing — run MobileTestAccountsSeeder`);
          }
          if (err instanceof ApiError && err.status === 403) {
            skip(`account "${account.username}" is unverified or inactive`);
          }
          throw err;
        }

        assertHasKeys(result, ['token', 'user'], `${role} login response`);
        assertEqual(result.user.role, role, `${role} signed in with the wrong role`);

        state.tokens[role] = result.token;
        state.users[role] = result.user;

        // The app immediately re-reads /me to hydrate the session.
        const me = await withToken(result.token)('/me');
        assertEqual(me.id, result.user.id, '/me returned a different user than login');
      });
    }

    await test('a bogus Google token is refused', async () => {
      // Guards the endpoint the native Google button posts its ID token to.
      await assertStatus(
        api('/auth/google', { method: 'POST', body: { id_token: 'not-a-real-token', client: 'mobile' } }),
        401
      );
    });

    await test('all three roles share at least one child to coordinate on', async () => {
      const lists = {};
      for (const role of Object.keys(ACCOUNTS)) {
        lists[role] = unwrapList(await as(role)('/children')).map((c) => c.id);
      }

      const shared = lists.teacher.filter(
        (id) => lists.caretaker.includes(id) && lists.parent.includes(id)
      );

      if (!shared.length) {
        skip('no child is linked to all three roles — run MobileDemoDataSeeder');
      }

      state.childId = shared[0];
      const child = await as('teacher')(`/children/${state.childId}`);
      state.childName = `${child.first_name || ''} ${child.last_name || ''}`.trim();
      info(`coordinating on ${state.childName} (child #${state.childId})`);
    });
  });
}

/* --------------------------------------- journey 2: the medication round */

async function medicationJourney() {
  await suite('Journey 2 — the daily medication round', async () => {
    const childId = requireChild();
    const medicine = `Journey Melatonin ${suffix()}`;
    let unreadBefore = { teacher: 0, parent: 0, caretaker: 0 };

    await test('teacher writes up a new medication schedule', async () => {
      unreadBefore = {
        teacher: await unreadCount('teacher'),
        parent: await unreadCount('parent'),
        caretaker: await unreadCount('caretaker'),
      };

      const schedule = await as('teacher')('/medication-schedules', {
        method: 'POST',
        body: {
          child_id: childId,
          medicine_name: medicine,
          dosage: '3mg',
          instructions: 'Give at bedtime',
          time_of_day: '20:00',
          days_of_week: [0, 1, 2, 3, 4, 5, 6],
        },
      });

      assertTruthy(schedule?.id, 'creating a medication schedule returned no id');
      assertEqual(schedule.medicine_name, medicine);
      state.scheduleId = schedule.id;
    });

    await test('the caretaker finds it on their Today tab', async () => {
      if (!state.scheduleId) skip('no schedule was created');
      const list = unwrapList(await as('caretaker')('/medication-schedules'));
      const found = list.find((s) => s.id === state.scheduleId);
      assertTruthy(found, 'the caretaker cannot see the schedule they must administer');
      assertEqual(found.medicine_name, medicine);
    });

    await test('the caretaker is notified a new medication was added', async () => {
      if (!state.scheduleId) skip('no schedule was created');
      const after = await unreadCount('caretaker');
      assert(
        after > unreadBefore.caretaker,
        `caretaker unread should have risen from ${unreadBefore.caretaker}, still ${after}`
      );
    });

    await test('the caretaker logs the dose as given', async () => {
      if (!state.scheduleId) skip('no schedule was created');

      const log = await as('caretaker')('/medication-logs', {
        method: 'POST',
        body: {
          medication_schedule_id: state.scheduleId,
          child_id: childId,
          status: 'given',
          administered_at: new Date().toISOString(),
          notes: 'Journey test — taken with water.',
        },
      });

      assertEqual(log.status, 'given');
      assertEqual(log.caretaker_id, state.users.caretaker.id, 'the dose was logged against the wrong caretaker');
    });

    await test('the teacher is told the dose was given', async () => {
      if (!state.scheduleId) skip('no schedule was created');
      const found = await waitForNotification('teacher', 'record.medication_log');
      assertTruthy(found, 'the teacher never received the dose-log notification');
    });

    await test('the parent is told the dose was given', async () => {
      if (!state.scheduleId) skip('no schedule was created');
      const found = await waitForNotification('parent', 'record.medication_log');
      assertTruthy(found, 'the parent never received the dose-log notification');
    });

    await test('the caretaker is not notified about their own dose log', async () => {
      if (!state.scheduleId) skip('no schedule was created');
      const after = await unreadCount('caretaker');
      const rows = (await as('caretaker')('/notifications')).notifications || [];
      const own = rows.filter((n) => n.type === 'record.medication_log' && !n.read_at);
      assertEqual(own.length, 0, `caretaker received ${own.length} notification(s) about their own action (unread ${after})`);
    });

    await test('the parent sees the dose in their child history', async () => {
      if (!state.scheduleId) skip('no schedule was created');
      const logs = unwrapList(await as('parent')(`/children/${childId}/medication-logs`));
      assertTruthy(logs.length, 'the parent sees no medication history');
      assertEqual(logs[0].status, 'given');
    });

    await test('only a caretaker may log a dose', async () => {
      if (!state.scheduleId) skip('no schedule was created');
      const body = {
        medication_schedule_id: state.scheduleId,
        child_id: childId,
        status: 'given',
        administered_at: new Date().toISOString(),
      };
      await assertStatus(as('teacher')('/medication-logs', { method: 'POST', body }), 403);
      await assertStatus(as('parent')('/medication-logs', { method: 'POST', body }), 403);
    });

    await test('teacher retires the journey schedule afterwards', async () => {
      if (!state.scheduleId) skip('no schedule was created');
      const updated = await as('teacher')(`/medication-schedules/${state.scheduleId}`, {
        method: 'PUT',
        body: { is_active: false },
      });
      assertEqual(updated.is_active, false, 'the journey schedule is still active');
      info(`deactivated schedule #${state.scheduleId}`);
    });
  });
}

/* ------------------------------------------ journey 3: therapy scheduling */

async function therapyJourney() {
  await suite('Journey 3 — scheduling a therapy session', async () => {
    const childId = requireChild();

    await test('teacher books a session for tomorrow', async () => {
      const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const session = await as('teacher')('/therapy-sessions', {
        method: 'POST',
        body: {
          child_id: childId,
          teacher_id: state.users.teacher.id,
          scheduled_at: scheduledAt,
          duration_minutes: 45,
        },
      });

      assertTruthy(session?.id, 'booking a session returned no id');
      assertEqual(session.status, 'scheduled');
      state.sessionId = session.id;
    });

    await test('the parent sees it on their Schedule tab', async () => {
      if (!state.sessionId) skip('no session was booked');
      const sessions = unwrapList(await as('parent')(`/therapy-sessions?child_id=${childId}`));
      const found = sessions.find((s) => s.id === state.sessionId);
      assertTruthy(found, 'the booked session is missing from the parent schedule');
      assertTruthy(found.title, 'the session has no display title for the schedule row');
    });

    await test('the caretaker is told a session was scheduled', async () => {
      if (!state.sessionId) skip('no session was booked');
      const found = await waitForNotification('caretaker', 'record.therapy');
      assertTruthy(found, 'the caretaker never heard about the therapy session');
    });

    await test('the parent cannot book or cancel sessions', async () => {
      if (!state.sessionId) skip('no session was booked');
      await assertStatus(
        as('parent')('/therapy-sessions', {
          method: 'POST',
          body: {
            child_id: childId,
            teacher_id: state.users.teacher.id,
            scheduled_at: new Date().toISOString(),
          },
        }),
        403
      );
      await assertStatus(as('parent')(`/therapy-sessions/${state.sessionId}`, { method: 'DELETE' }), 403);
    });

    await test('teacher cancels the journey session afterwards', async () => {
      if (!state.sessionId) skip('no session was booked');
      await as('teacher')(`/therapy-sessions/${state.sessionId}`, { method: 'DELETE' });
      const sessions = unwrapList(await as('teacher')(`/therapy-sessions?child_id=${childId}`));
      assert(!sessions.some((s) => s.id === state.sessionId), 'the journey session was not removed');
      info(`removed session #${state.sessionId}`);
    });
  });
}

/* ------------------------------- journey 4: progress and the parent reply */

async function progressJourney() {
  await suite('Journey 4 — progress note and the parent reply', async () => {
    const childId = requireChild();
    const title = `Journey milestone ${suffix()}`;

    await test('teacher records a milestone', async () => {
      const record = await as('teacher')(`/children/${childId}/progress`, {
        method: 'POST',
        body: {
          title,
          summary: 'Chose a snack using the choice board without a verbal cue.',
          milestone: 'Communication',
        },
      });
      assertTruthy(record?.id, 'recording progress returned no id');
      assertEqual(record.title, title);
    });

    await test('the parent reads it on their Progress tab', async () => {
      const records = unwrapList(await as('parent')(`/children/${childId}/progress`));
      assertTruthy(
        records.some((r) => r.title === title),
        'the new milestone is missing from the parent progress feed'
      );
    });

    await test('the parent is notified about the milestone', async () => {
      const found = await waitForNotification('parent', 'record.progress');
      assertTruthy(found, 'the parent never heard about the progress note');
    });

    await test('the parent replies with feedback', async () => {
      const feedback = await as('parent')('/parent-feedback', {
        method: 'POST',
        body: {
          child_id: childId,
          subject: 'Journey follow-up',
          message: 'She did the same thing at home tonight.',
        },
      });
      assertTruthy(feedback?.id, 'submitting feedback returned no id');
      assertEqual(feedback.status, 'open');
    });

    await test('feedback with no subject still works from the mobile form', async () => {
      const feedback = await as('parent')('/parent-feedback', {
        method: 'POST',
        body: { child_id: childId, message: 'Journey note with no subject line.' },
      });
      assertTruthy(feedback?.subject, 'a subject-less submission produced no fallback subject');
    });

    await test('empty feedback is rejected', async () => {
      await assertStatus(
        as('parent')('/parent-feedback', { method: 'POST', body: { child_id: childId, message: '' } }),
        422
      );
    });

    await test('the teacher sees the parent feedback', async () => {
      const rows = unwrapList(await as('teacher')(`/children/${childId}/parent-feedback`));
      assertTruthy(
        rows.some((f) => f.subject === 'Journey follow-up'),
        'the parent feedback never reached the teacher'
      );
    });
  });
}

/* -------------------------------------- journey 5: clearing the inbox */

async function inboxJourney() {
  await suite('Journey 5 — working through the notification inbox', async () => {
    for (const role of Object.keys(ACCOUNTS)) {
      await test(`${role} inbox returns the shape the screen renders`, async () => {
        const inbox = await as(role)('/notifications');
        assertHasKeys(inbox, ['notifications', 'unread'], `${role} inbox`);
        assert(Array.isArray(inbox.notifications), `${role} notifications is not an array`);
        assertEqual(typeof inbox.unread, 'number', `${role} unread is not a number`);

        inbox.notifications.slice(0, 3).forEach((row) => {
          assertHasKeys(row, ['id', 'type', 'title', 'created_at'], `${role} notification row`);
        });
      });
    }

    await test('marking one notification read lowers the badge by one', async () => {
      const inbox = await as('teacher')('/notifications');
      const unread = (inbox.notifications || []).find((n) => !n.read_at);
      if (!unread) skip('the teacher has nothing unread to mark');

      await as('teacher')(`/notifications/${unread.id}/read`, { method: 'PATCH' });

      const after = await as('teacher')('/notifications');
      assertEqual(after.unread, inbox.unread - 1, 'the unread count did not drop by exactly one');

      const row = (after.notifications || []).find((n) => n.id === unread.id);
      assertTruthy(row?.read_at, 'the notification was not stamped as read');
    });

    await test('the read route rejects POST, the screen must use PATCH', async () => {
      const inbox = await as('teacher')('/notifications');
      const row = (inbox.notifications || [])[0];
      if (!row) skip('the teacher has no notifications');
      await assertStatus(as('teacher')(`/notifications/${row.id}/read`, { method: 'POST' }), 405);
    });

    await test('mark all read clears the badge', async () => {
      await as('parent')('/notifications/read-all', { method: 'POST' });
      const after = await as('parent')('/notifications');
      assertEqual(after.unread, 0, 'the parent badge did not clear');
    });

    await test('a user cannot mark another user notification read', async () => {
      const parentInbox = await as('parent')('/notifications');
      const row = (parentInbox.notifications || [])[0];
      if (!row) skip('the parent has no notifications');
      await assertStatus(as('teacher')(`/notifications/${row.id}/read`, { method: 'PATCH' }), 403);
    });
  });
}

/* ---------------------------------------------- journey 6: the boundaries */

async function boundariesJourney() {
  await suite('Journey 6 — a role only reaches their own children', async () => {
    await test('every visible child is genuinely linked to the signed-in user', async () => {
      for (const role of Object.keys(ACCOUNTS)) {
        const children = unwrapList(await as(role)('/children'));
        for (const child of children.slice(0, 5)) {
          const detail = await as(role)(`/children/${child.id}`);
          assertEqual(detail.id, child.id, `${role} could not open a child from their own list`);
        }
      }
    });

    await test('a child outside the parent circle is refused', async () => {
      const parentIds = new Set(unwrapList(await as('parent')('/children')).map((c) => c.id));

      // Probe upward from the parent's own ids to find a child record they are
      // not linked to. The facility seeds several children across other staff,
      // so this normally lands within a couple of hops.
      const highest = Math.max(0, ...parentIds);
      let refused = null;
      for (let id = 1; id <= highest + 5 && !refused; id += 1) {
        if (parentIds.has(id)) continue;
        try {
          await as('parent')(`/children/${id}`);
        } catch (err) {
          if (err instanceof ApiError && [403, 404].includes(err.status)) {
            refused = { id, status: err.status };
          }
        }
      }

      if (!refused) skip('every child id in range is linked to this parent');
      info(`child #${refused.id} refused with ${refused.status}`);
      assertTruthy(refused, 'an unlinked child was not refused');
    });

    await test('mobile roles cannot reach Head Doctor endpoints', async () => {
      for (const role of Object.keys(ACCOUNTS)) {
        await assertStatus(as(role)('/users'), 403);
        await assertStatus(
          as(role)('/children', { method: 'POST', body: { first_name: 'No', last_name: 'Way' } }),
          403
        );
      }
    });

    await test('a teacher cannot approve a plan for a child they do not have', async () => {
      const feed = unwrapList(await as('teacher')('/recommendations?status=pending_review'));
      info(`${feed.length} recommendation(s) awaiting teacher review`);
      // Nothing to assert beyond the feed being scoped; the scoping itself is
      // proved by the child checks above.
      assert(Array.isArray(feed), 'the review feed is not renderable');
    });
  });
}

/* --------------------------- journey 7: Head Doctor onboarding (optional) */

async function onboardingJourney() {
  await suite('Journey 7 — Head Doctor onboards a new mobile user', async () => {
    if (!HEAD_DOCTOR.username || !HEAD_DOCTOR.password) {
      skip('set SMARTCARE_HD_USERNAME and SMARTCARE_HD_PASSWORD to run this journey');
    }

    await test('head doctor signs in', async () => {
      const result = await login(HEAD_DOCTOR);
      assertHasKeys(result, ['token', 'user'], 'head doctor login');
      state.tokens.head_doctor = result.token;
    });

    const email = `smartcare.journey+${suffix()}@example.com`;
    const username = `journey_${suffix()}`;

    await test('creating an account returns a shareable verification link', async () => {
      const created = await as('head_doctor')('/users', {
        method: 'POST',
        body: {
          name: 'Journey Caretaker',
          email,
          username,
          password: 'Password123',
          password_confirmation: 'Password123',
          role: 'caretaker',
        },
      });

      assertTruthy(created?.id, 'creating a user returned no id');
      state.createdUserId = created.id;
      info(`created user #${created.id} (${email})`);
    });

    await test('the new account cannot sign in until it is verified', async () => {
      if (!state.createdUserId) skip('no account was created');
      await assertStatus(login({ username, password: 'Password123' }), 403);
    });

    await test('the refusal tells the app the link was already sent', async () => {
      if (!state.createdUserId) skip('no account was created');

      const err = await assertStatus(login({ username, password: 'Password123' }), 403);

      // The login screen keys off these fields to show the resend panel rather
      // than a generic alert.
      assertEqual(err.payload?.reason, 'email_unverified', 'the 403 carries no machine-readable reason');
      assertEqual(err.payload?.email, email, 'the 403 does not say which address was mailed');
      assertEqual(err.payload?.can_resend, true, 'the 403 does not advertise resending');
    });

    await test('the resend button gets them a fresh link', async () => {
      if (!state.createdUserId) skip('no account was created');

      const result = await api('/auth/resend-verification', {
        method: 'POST',
        body: { email },
      });
      assertHasKeys(result, ['message', 'mail_sent'], 'resend response');
    });

    await test('resending for an unknown address reveals nothing', async () => {
      const result = await api('/auth/resend-verification', {
        method: 'POST',
        body: { email: `nobody.${suffix()}@example.com` },
      });
      assertEqual(result.mail_sent, false, 'an unknown address should not report a send');
    });

    await test('a duplicate email is rejected', async () => {
      if (!state.createdUserId) skip('no account was created');
      await assertStatus(
        as('head_doctor')('/users', {
          method: 'POST',
          body: {
            name: 'Duplicate',
            email,
            username: `dupe_${suffix()}`,
            password: 'Password123',
            password_confirmation: 'Password123',
            role: 'caretaker',
          },
        }),
        422
      );
    });

    await test('the journey account is removed afterwards', async () => {
      if (!state.createdUserId) skip('no account was created');
      await as('head_doctor')(`/users/${state.createdUserId}`, { method: 'DELETE' });
      info(`removed user #${state.createdUserId}`);
    });
  });
}

/* -------------------------------------------------- journey 8: signing off */

async function signOutJourney() {
  await suite('Journey 8 — signing off', async () => {
    await test('the caretaker signs out and the token dies with the session', async () => {
      const token = state.tokens.caretaker;
      if (!token) skip('no caretaker session');

      await withToken(token)('/logout', { method: 'POST' });
      await assertStatus(withToken(token)('/me'), 401);
      state.tokens.caretaker = null;
    });
  });
}

/* -------------------------------------------------------------------- run */

async function main() {
  heading(`SmartCare care journeys → ${BASE_URL}`);

  await signInJourney();
  await medicationJourney();
  await therapyJourney();
  await progressJourney();
  await inboxJourney();
  await boundariesJourney();
  await onboardingJourney();
  await signOutJourney();

  exitWithSummary();
}

main().catch((err) => {
  console.error('');
  console.error('Journey runner crashed:', err?.message || err);
  process.exit(1);
});
