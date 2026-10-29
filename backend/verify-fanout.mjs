const BASE = 'http://127.0.0.1:8000/api/v1';

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function login(username) {
  const out = await call('/login', { method: 'POST', body: { username, password: 'password' } });
  return out.token || out.access_token;
}

const caretaker = await login('mobile_caretaker');
const teacher = await login('mobile_teacher');
const parent = await login('mobile_parent');

const schedules = await call('/medication-schedules', { token: caretaker });
const schedule = (Array.isArray(schedules) ? schedules : schedules.data)[0];
console.log('schedule', schedule.id, schedule.medicine_name, 'child', schedule.child_id);

await call('/medication-logs', {
  method: 'POST',
  token: caretaker,
  body: {
    medication_schedule_id: schedule.id,
    child_id: schedule.child_id,
    status: 'given',
    administered_at: new Date().toISOString(),
    notes: 'Fan-out verification',
  },
});
console.log('caretaker logged a dose');

for (const [role, token] of [['teacher', teacher], ['parent', parent], ['caretaker', caretaker]]) {
  const out = await call('/notifications', { token });
  const logs = out.notifications.filter((n) => n.type === 'record.medication_log');
  console.log(`${role}: unread=${out.unread}, medication_log rows=${logs.length}`);
  if (logs[0]) console.log(`   "${logs[0].title}" — ${logs[0].body}`);
}
