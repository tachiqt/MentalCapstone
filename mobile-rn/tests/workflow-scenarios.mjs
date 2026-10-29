#!/usr/bin/env node
/**
 * SmartCare — workflow scenario tests (not single-endpoint unit checks).
 *
 * Walks real multi-step situations for each enhanced module:
 *   1. Therapy scheduling (separate date + time → scheduled_at)
 *   2. Therapy plans on assigned children → schedule with bound plan
 *   3. Medication edit + deactivate (active disappears from caretaker Today)
 *   4. Parent feedback → staff acknowledge/respond → parent sees reply
 *   5. Diagnosis update after assessment (authorized roles + history)
 *
 *   npm run test:scenarios:local
 *   npm run test:scenarios:prod
 *
 * Optional for diagnosis scenarios:
 *   SMARTCARE_HD_USERNAME / SMARTCARE_HD_PASSWORD
 *   or SMARTCARE_PSYCHO_USERNAME / SMARTCARE_PSYCHO_PASSWORD (default: psycho)
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

const PASSWORD = process.env.SMARTCARE_TEST_PASSWORD || 'password';

const ACCOUNTS = {
  teacher: {
    username: process.env.SMARTCARE_TEACHER_USERNAME || 'mobile_teacher',
    password: process.env.SMARTCARE_TEACHER_PASSWORD || PASSWORD,
  },
  caretaker: {
    username: process.env.SMARTCARE_CARETAKER_USERNAME || 'mobile_caretaker',
    password: process.env.SMARTCARE_CARETAKER_PASSWORD || PASSWORD,
  },
  parent: {
    username: process.env.SMARTCARE_PARENT_USERNAME || 'mobile_parent',
    password: process.env.SMARTCARE_PARENT_PASSWORD || PASSWORD,
  },
};

const CLINICAL = {
  username:
    process.env.SMARTCARE_HD_USERNAME ||
    process.env.SMARTCARE_PSYCHO_USERNAME ||
    'psycho',
  password:
    process.env.SMARTCARE_HD_PASSWORD ||
    process.env.SMARTCARE_PSYCHO_PASSWORD ||
    PASSWORD,
};

const state = {
  tokens: {},
  users: {},
  childId: null,
  planId: null,
  sessionId: null,
  scheduleId: null,
  feedbackId: null,
};

function suffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function login({ username, password }) {
  return api('/login', { method: 'POST', body: { username, password, client: 'mobile' } });
}

function as(role) {
  const token = state.tokens[role];
  if (!token) skip(`no ${role} session`);
  return withToken(token);
}

function requireChild() {
  if (!state.childId) skip('no shared child');
  return state.childId;
}

/** Combine date + time the same way the mobile schedule form does. */
function combineDateTime(date, time) {
  const d = new Date(`${date}T${time}`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date/time: ${date} ${time}`);
  return d.toISOString();
}

function facilitySlotDateTime(daysFromNow = 2, time = '10:00') {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { date, time, scheduled_at: combineDateTime(date, time) };
}

async function signIn() {
  await suite('Scenario setup — sign in and pick a shared child', async () => {
    for (const [role, account] of Object.entries(ACCOUNTS)) {
      await test(`${role} signs in`, async () => {
        let result;
        try {
          result = await login(account);
        } catch (err) {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            skip(`account "${account.username}" unavailable (${err.status})`);
          }
          throw err;
        }
        assertHasKeys(result, ['token', 'user'], `${role} login`);
        state.tokens[role] = result.token;
        state.users[role] = result.user;
      });
    }

    await test('optional clinical account (psycho/head) for diagnosis scenarios', async () => {
      try {
        const result = await login(CLINICAL);
        assertHasKeys(result, ['token', 'user']);
        state.tokens.clinical = result.token;
        state.users.clinical = result.user;
        info(`clinical actor: ${result.user.role} (${CLINICAL.username})`);
      } catch (err) {
        if (err instanceof ApiError) {
          skip(`clinical account "${CLINICAL.username}" unavailable — diagnosis scenarios will skip`);
        }
        throw err;
      }
    });

    await test('pick a child the teacher can manage (prefer fully shared)', async () => {
      const lists = {};
      for (const role of Object.keys(ACCOUNTS)) {
        if (!state.tokens[role]) continue;
        lists[role] = unwrapList(await as(role)('/children')).map((c) => c.id);
      }
      const teacherKids = lists.teacher || [];
      if (!teacherKids.length) skip('teacher has no assigned children');

      const fullyShared = teacherKids.filter(
        (id) => (lists.caretaker || []).includes(id) && (lists.parent || []).includes(id),
      );
      const withCaretaker = teacherKids.filter((id) => (lists.caretaker || []).includes(id));
      const withParent = teacherKids.filter((id) => (lists.parent || []).includes(id));

      state.childId = fullyShared[0] || withCaretaker[0] || withParent[0] || teacherKids[0];
      state.childSharedWith = {
        caretaker: (lists.caretaker || []).includes(state.childId),
        parent: (lists.parent || []).includes(state.childId),
      };
      info(
        `using child #${state.childId} (caretaker=${state.childSharedWith.caretaker}, parent=${state.childSharedWith.parent})`,
      );
    });
  });
}

async function therapySchedulingScenario() {
  await suite('Scenario — therapy scheduling with separate date and time', async () => {
    const childId = requireChild();
    const slot = facilitySlotDateTime(3, '10:30');

    await test('teacher schedules a session by combining date + time fields', async () => {
      const session = await as('teacher')('/therapy-sessions', {
        method: 'POST',
        body: {
          child_id: childId,
          teacher_id: state.users.teacher.id,
          scheduled_at: slot.scheduled_at,
          duration_minutes: 45,
        },
      });
      assertTruthy(session?.id, 'session create returned no id');
      assertEqual(session.status, 'scheduled');
      state.sessionId = session.id;
      info(`scheduled ${slot.date} ${slot.time} → ${session.scheduled_at}`);
    });

    await test('parent sees the new session on their schedule', async () => {
      if (!state.sessionId) skip('no session');
      if (!state.childSharedWith?.parent) skip('child is not linked to parent on this environment');
      const list = unwrapList(await as('parent')('/therapy-sessions'));
      assertTruthy(
        list.some((s) => s.id === state.sessionId),
        'parent cannot see the scheduled session',
      );
    });

    await test('rescheduling with a different date/time updates scheduled_at', async () => {
      if (!state.sessionId) skip('no session');
      const next = facilitySlotDateTime(4, '14:00');
      const updated = await as('teacher')(`/therapy-sessions/${state.sessionId}`, {
        method: 'PUT',
        body: { scheduled_at: next.scheduled_at, duration_minutes: 60 },
      });
      assertTruthy(updated?.scheduled_at, 'update returned no scheduled_at');
      const when = new Date(updated.scheduled_at);
      assert(!Number.isNaN(when.getTime()), 'scheduled_at is not a valid datetime');
    });

    await test('outside operating hours is rejected (edge situation)', async () => {
      const bad = facilitySlotDateTime(3, '22:00');
      await assertStatus(
        as('teacher')('/therapy-sessions', {
          method: 'POST',
          body: {
            child_id: childId,
            teacher_id: state.users.teacher.id,
            scheduled_at: bad.scheduled_at,
            duration_minutes: 30,
          },
        }),
        422,
      );
    });
  });
}

async function therapyPlanScenario() {
  await suite('Scenario — therapy plans from assigned child → schedule', async () => {
    const childId = requireChild();
    const title = `Scenario plan ${suffix()}`;

    await test('teacher creates a therapy plan for the assigned child', async () => {
      const plan = await as('teacher')('/therapy-plans', {
        method: 'POST',
        body: {
          child_id: childId,
          title,
          description: 'Scenario-created plan for scheduling',
          sessions_per_week: 2,
        },
      });
      assertTruthy(plan?.id, 'plan create returned no id');
      assertEqual(plan.child_id, childId);
      assertEqual(plan.status, 'active');
      state.planId = plan.id;
    });

    await test('plan appears when listing plans filtered by child', async () => {
      if (!state.planId) skip('no plan');
      const list = unwrapList(await as('teacher')(`/therapy-plans?child_id=${childId}`));
      assertTruthy(
        list.some((p) => p.id === state.planId),
        'created plan missing from child filter',
      );
    });

    await test('scheduling auto-binds the child plan without a separate search', async () => {
      if (!state.planId) skip('no plan');
      const slot = facilitySlotDateTime(5, '11:00');
      const session = await as('teacher')('/therapy-sessions', {
        method: 'POST',
        body: {
          child_id: childId,
          teacher_id: state.users.teacher.id,
          therapy_plan_id: state.planId,
          scheduled_at: slot.scheduled_at,
          duration_minutes: 45,
        },
      });
      assertEqual(session.therapy_plan_id, state.planId);
    });

    await test('linking another child’s plan is rejected', async () => {
      if (!state.planId) skip('no plan');
      const children = unwrapList(await as('teacher')('/children'));
      const other = children.find((c) => c.id !== childId);
      if (!other) skip('teacher needs a second assigned child for this edge case');

      const slot = facilitySlotDateTime(6, '10:00');
      await assertStatus(
        as('teacher')('/therapy-sessions', {
          method: 'POST',
          body: {
            child_id: other.id,
            teacher_id: state.users.teacher.id,
            therapy_plan_id: state.planId,
            scheduled_at: slot.scheduled_at,
            duration_minutes: 30,
          },
        }),
        422,
      );
    });

    await test('teacher can archive the plan without deleting history', async () => {
      if (!state.planId) skip('no plan');
      const updated = await as('teacher')(`/therapy-plans/${state.planId}`, {
        method: 'PUT',
        body: { status: 'archived' },
      });
      assertEqual(updated.status, 'archived');
    });
  });
}

async function medicationScenario() {
  await suite('Scenario — medication edit and inactive status', async () => {
    const childId = requireChild();
    const medicine = `Scenario Med ${suffix()}`;

    await test('teacher creates an active medication schedule', async () => {
      const schedule = await as('teacher')('/medication-schedules', {
        method: 'POST',
        body: {
          child_id: childId,
          medicine_name: medicine,
          dosage: '5mg',
          times_of_day: ['08:00', '20:00'],
          days_of_week: [0, 1, 2, 3, 4, 5, 6],
        },
      });
      assertTruthy(schedule?.id);
      assertEqual(schedule.is_active, true);
      state.scheduleId = schedule.id;
    });

    await test('caretaker Today includes the active schedule', async () => {
      if (!state.scheduleId) skip('no schedule');
      if (!state.childSharedWith?.caretaker) skip('child is not linked to caretaker on this environment');
      const today = unwrapList(await as('caretaker')('/medication-schedules?today=1'));
      assertTruthy(
        today.some((s) => s.id === state.scheduleId),
        'active schedule missing from caretaker Today',
      );
    });

    await test('teacher edits dosage and times', async () => {
      if (!state.scheduleId) skip('no schedule');
      const updated = await as('teacher')(`/medication-schedules/${state.scheduleId}`, {
        method: 'PUT',
        body: {
          dosage: '10mg',
          times_of_day: ['09:00'],
          instructions: 'Updated during scenario',
        },
      });
      assertEqual(updated.dosage, '10mg');
    });

    await test('deactivating removes it from caretaker Today but keeps the record', async () => {
      if (!state.scheduleId) skip('no schedule');
      await as('teacher')(`/medication-schedules/${state.scheduleId}`, {
        method: 'PUT',
        body: { is_active: false },
      });

      if (state.childSharedWith?.caretaker) {
        const today = unwrapList(await as('caretaker')('/medication-schedules?today=1'));
        assert(
          !today.some((s) => s.id === state.scheduleId),
          'inactive schedule still appears on caretaker Today',
        );
      }

      const all = unwrapList(await as('teacher')('/medication-schedules'));
      const row = all.find((s) => s.id === state.scheduleId);
      assertTruthy(row, 'inactive schedule disappeared from teacher history list');
      assertEqual(row.is_active, false);
    });

    await test('reactivating restores Today visibility', async () => {
      if (!state.scheduleId) skip('no schedule');
      if (!state.childSharedWith?.caretaker) skip('child is not linked to caretaker on this environment');
      await as('teacher')(`/medication-schedules/${state.scheduleId}`, {
        method: 'PUT',
        body: { is_active: true },
      });
      const today = unwrapList(await as('caretaker')('/medication-schedules?today=1'));
      assertTruthy(
        today.some((s) => s.id === state.scheduleId),
        'reactivated schedule not back on Today',
      );
    });
  });
}

async function parentFeedbackScenario() {
  await suite('Scenario — parent feedback and staff response', async () => {
    const childId = requireChild();
    const message = `Visit feedback ${suffix()}: child was calm after therapy.`;

    await test('parent submits residential facility feedback', async () => {
      if (!state.childSharedWith?.parent) skip('child is not linked to parent on this environment');
      const feedback = await as('parent')('/parent-feedback', {
        method: 'POST',
        body: {
          child_id: childId,
          subject: 'Parent feedback',
          message,
          category: 'visit',
        },
      });
      assertTruthy(feedback?.id);
      assertEqual(feedback.status, 'open');
      state.feedbackId = feedback.id;
    });

    await test('teacher sees the feedback on the child profile feed', async () => {
      if (!state.feedbackId) skip('no feedback');
      const list = unwrapList(await as('teacher')(`/children/${childId}/parent-feedback`));
      assertTruthy(
        list.some((f) => f.id === state.feedbackId),
        'teacher cannot see parent feedback for assigned child',
      );
    });

    await test('teacher acknowledges then responds', async () => {
      if (!state.feedbackId) skip('no feedback');
      await as('teacher')(`/parent-feedback/${state.feedbackId}`, {
        method: 'PATCH',
        body: { status: 'acknowledged' },
      });
      const responded = await as('teacher')(`/parent-feedback/${state.feedbackId}`, {
        method: 'PATCH',
        body: {
          status: 'addressed',
          staff_response: 'Thank you — noted with the care team.',
        },
      });
      assertEqual(responded.status, 'addressed');
      assertEqual(responded.staff_response, 'Thank you — noted with the care team.');
    });

    await test('parent history shows the staff response', async () => {
      if (!state.feedbackId) skip('no feedback');
      const list = unwrapList(await as('parent')('/parent-feedback'));
      const row = list.find((f) => f.id === state.feedbackId);
      assertTruthy(row, 'parent cannot see own feedback');
      assertEqual(row.staff_response, 'Thank you — noted with the care team.');
    });

    await test('parent cannot rewrite feedback status (permission edge)', async () => {
      if (!state.feedbackId) skip('no feedback');
      await assertStatus(
        as('parent')(`/parent-feedback/${state.feedbackId}`, {
          method: 'PATCH',
          body: { status: 'open' },
        }),
        403,
      );
    });
  });
}

async function diagnosisScenario() {
  await suite('Scenario — diagnosis update after assessment with history', async () => {
    if (!state.tokens.clinical) skip('no clinical account signed in');
    const childId = requireChild();
    const clinical = withToken(state.tokens.clinical);
    const label = `Scenario diagnosis ${suffix()}`;

    await test('authorized clinician updates diagnosis', async () => {
      const child = await clinical(`/children/${childId}/diagnosis`, {
        method: 'PATCH',
        body: {
          diagnosis: label,
          note: 'Updated during workflow scenario',
        },
      });
      assertEqual(child.diagnosis, label);
    });

    await test('diagnosis history records the change', async () => {
      const history = unwrapList(await clinical(`/children/${childId}/diagnosis-history`));
      assertTruthy(
        history.some((h) => h.new_diagnosis === label),
        'history missing the new diagnosis entry',
      );
    });

    await test('teacher cannot formally update diagnosis', async () => {
      await assertStatus(
        as('teacher')(`/children/${childId}/diagnosis`, {
          method: 'PATCH',
          body: { diagnosis: 'Unauthorized' },
        }),
        403,
      );
    });

    await test('child without prior diagnosis can be set then cleared safely', async () => {
      await clinical(`/children/${childId}/diagnosis`, {
        method: 'PATCH',
        body: { diagnosis: null, note: 'Cleared for re-evaluation' },
      });
      const history = unwrapList(await clinical(`/children/${childId}/diagnosis-history`));
      assertTruthy(history.length >= 2, 'expected at least two history rows after clear');
    });
  });
}

async function main() {
  heading(`SmartCare workflow scenarios → ${BASE_URL}`);

  await signIn();
  await therapySchedulingScenario();
  await therapyPlanScenario();
  await medicationScenario();
  await parentFeedbackScenario();
  await diagnosisScenario();

  exitWithSummary();
}

main().catch((err) => {
  console.error('');
  console.error('Scenario runner crashed:', err?.message || err);
  process.exit(1);
});
