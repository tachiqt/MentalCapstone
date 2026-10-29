/** SmartCare dashboard — therapy sessions */
(function (SC) {
  const isHeadDoctor = SC.isHeadDoctor;
  const childName = SC.childName;
  const initialsFromName = SC.initialsFromName;
  const openModal = SC.openModal;
  const closeModal = SC.closeModal;
  const escapeHtml = SC.escapeHtml;
  const formatDate = SC.formatDate;
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;
  const formatSessionTime = (...args) => SC.formatSessionTime(...args);

  const ICONS = {
    form: 'https://api.iconify.design/lucide/calendar-plus.svg?color=%230F3D30',
    view: 'https://api.iconify.design/lucide/clipboard-list.svg?color=%230F3D30',
    complete: 'https://api.iconify.design/lucide/check-circle.svg?color=%230F3D30',
    cancel: 'https://api.iconify.design/lucide/calendar-x.svg?color=%23B42318',
    delete: 'https://api.iconify.design/lucide/trash-2.svg?color=%23B42318',
    suggest: 'https://api.iconify.design/lucide/sparkles.svg?color=%230F3D30',
  };

  let sessionCache = [];
  let teacherCache = [];
  let planCache = [];
  let suggestedSlots = [];
  let activeSessionId = null;
  let calendarCursor = new Date();
  let calendarView = 'month';
  let agendaCollapsed = false;

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function startOfDay(date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function dayKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function isSameDay(a, b) {
    return dayKey(a) === dayKey(b);
  }

  function planTitle(session) {
    return session?.therapy_plan?.title || '';
  }

  function typeKey(session) {
    const title = planTitle(session).toLowerCase();
    if (!title) return 'unlinked';
    if (/(speech|language|communication)/.test(title)) return 'speech';
    return 'motor';
  }

  function typeLabel(session) {
    return session?.intervention_notes || planTitle(session) || 'Unlinked session';
  }

  function statusOf(session) {
    return String(session?.status || 'scheduled').toLowerCase();
  }

  function prettyStatus(status) {
    return String(status || 'scheduled').replace(/_/g, ' ');
  }

  function formatWhenParts(iso) {
    if (!iso) return { date: '—', time: '' };
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return { date: String(iso), time: '' };
    return {
      date: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    };
  }

  function statusClass(status) {
    if (status === 'cancelled') return 'badge-status--inactive';
    if (status === 'scheduled') return 'badge-status--scheduled';
    return '';
  }

  function setTherapyFace(action, session) {
    const avatar = SC.$('#modal-therapy-avatar');
    const iconWrap = SC.$('#modal-therapy-icon-wrap');
    const icon = SC.$('#modal-therapy-icon');
    const showAvatar = action === 'view' && session;
    if (avatar) {
      avatar.hidden = !showAvatar;
      if (showAvatar) avatar.textContent = initialsFromName(session.child ? childName(session.child) : 'Session');
    }
    if (iconWrap) iconWrap.hidden = showAvatar;
    if (icon && !showAvatar) icon.src = ICONS[action] || ICONS.form;
  }

  function findSession(id) {
    return sessionCache.find((s) => String(s.id) === String(id));
  }

  function roleOf(user) {
    const role = user?.role;
    if (!role) return '';
    return typeof role === 'object' ? role.value || '' : String(role);
  }

  function toDateTimeLocal(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function toDateInput(iso) {
    const local = toDateTimeLocal(iso);
    return local ? local.slice(0, 10) : '';
  }

  function toTimeInput(iso) {
    const local = toDateTimeLocal(iso);
    return local ? local.slice(11, 16) : '';
  }

  function combineDateAndTime(dateValue, timeValue) {
    const date = String(dateValue || '').trim();
    const time = String(timeValue || '').trim() || '10:00';
    if (!date) return '';
    return `${date}T${time}`;
  }

  function errorMessage(err) {
    const errors = err?.data?.errors;
    if (errors && typeof errors === 'object') return Object.values(errors).flat().join(' ');
    return err.message || 'Request failed.';
  }

  function setPanel(name) {
    SC.$$('.therapy-modal-panel').forEach((panel) => {
      panel.hidden = panel.id !== `therapy-panel-${name}`;
    });
  }

  function setFooter(html) {
    const actions = SC.$('#therapy-modal-actions');
    if (actions) actions.innerHTML = html;
  }

  function fillSelect(sel, items, placeholder, selected) {
    const el = SC.$(sel);
    if (!el) return;
    el.innerHTML = `<option value="">${placeholder}</option>${items.join('')}`;
    if (selected) el.value = String(selected);
  }

  function childOptions() {
    return (SC.state.childrenCache || []).map(
      (c) => `<option value="${c.id}">${escapeHtml(childName(c))}</option>`
    );
  }

  function teacherOptions() {
    return teacherCache.map(
      (t) => `<option value="${t.id}">${escapeHtml(t.name || t.username || 'Teacher')}</option>`
    );
  }

  function planOptions(childId) {
    return planCache
      .filter((p) => !childId || String(p.child_id) === String(childId))
      .map((p) => `<option value="${p.id}">${escapeHtml(p.title || 'Therapy plan')}</option>`);
  }

  function populateLookups(selected = {}) {
    const filters = {
      filterChild: SC.$('#therapy-filter-child')?.value,
      filterTeacher: SC.$('#therapy-filter-teacher')?.value,
      filterType: SC.$('#therapy-filter-type')?.value,
      ...selected,
    };
    fillSelect('#therapy-filter-child', childOptions(), 'All children', filters.filterChild);
    fillSelect('#therapy-filter-teacher', teacherOptions(), 'All teachers', filters.filterTeacher);
    fillSelect(
      '#therapy-filter-type',
      [
        '<option value="motor">Motor / OT</option>',
        '<option value="speech">Speech</option>',
        '<option value="unlinked">Unlinked</option>',
      ],
      'All therapy types',
      filters.filterType
    );
    fillSelect('#therapy-session-child', childOptions(), 'Select a child…', selected.childId);
    fillSelect('#therapy-suggest-child', childOptions(), 'Select a child…', selected.suggestChild);
    fillSelect('#therapy-session-teacher', teacherOptions(), 'Select a teacher…', selected.teacherId);
    fillSelect('#therapy-suggest-teacher', teacherOptions(), 'Select a teacher…', selected.suggestTeacher);
    fillSelect('#therapy-session-plan', planOptions(selected.childId), 'No linked plan', selected.planId);
  }

  async function ensureLookups() {
    if (!SC.state.childrenCache.length && SC.loadChildren) await SC.loadChildren();
    if (!teacherCache.length) {
      try {
        const payload = await SmartCareAPI.get('/users');
        const users = Array.isArray(payload) ? payload : payload.users || [];
        teacherCache = users.filter((u) => roleOf(u) === 'teacher');
      } catch {
        teacherCache = [];
      }
    }
    if (!planCache.length) {
      try {
        const plans = await SmartCareAPI.get('/therapy-plans');
        planCache = Array.isArray(plans) ? plans : plans.data || [];
      } catch {
        planCache = [];
      }
    }
    populateLookups();
  }

  function filteredSessions() {
    const query = (SC.$('#therapy-search')?.value || '').trim().toLowerCase();
    const childId = SC.$('#therapy-filter-child')?.value || '';
    const teacherId = SC.$('#therapy-filter-teacher')?.value || '';
    const type = SC.$('#therapy-filter-type')?.value || '';
    return sessionCache.filter((s) => {
      if (childId && String(s.child_id) !== String(childId) && String(s.child?.id) !== String(childId)) return false;
      if (teacherId && String(s.teacher_id) !== String(teacherId) && String(s.teacher?.id) !== String(teacherId)) return false;
      if (type && typeKey(s) !== type) return false;
      if (query) {
        const hay = `${s.child ? childName(s.child) : ''} ${s.teacher?.name || ''} ${planTitle(s)}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }

  function sessionChip(s) {
    const child = s.child ? childName(s.child) : 'Session';
    const status = statusOf(s);
    const when = formatWhenParts(s.scheduled_at);
    const tone = typeKey(s);
    return `
      <button type="button" class="therapy-chip therapy-chip--${tone} therapy-chip--${status}" data-therapy-action="view" data-session-id="${s.id}" title="${escapeHtml(`${child} · ${when.time} · ${typeLabel(s)}`)}">
        <span class="therapy-chip__avatar">${escapeHtml(initialsFromName(child))}</span>
        <span class="therapy-chip__body">
          <strong>${escapeHtml(when.time)}</strong>
          <span>${escapeHtml(child)}</span>
          <small>${escapeHtml(typeLabel(s))}</small>
        </span>
      </button>`;
  }

  function parseDayKey(key) {
    const [y, m, d] = String(key || '').split('-').map(Number);
    if (!y || !m || !d) return startOfDay(new Date());
    return new Date(y, m - 1, d);
  }

  function shiftCalendar(dir) {
    const next = new Date(calendarCursor);
    if (calendarView === 'day') next.setDate(next.getDate() + dir);
    else if (calendarView === 'week') next.setDate(next.getDate() + 7 * dir);
    else next.setMonth(next.getMonth() + dir);
    calendarCursor = next;
    renderCalendar();
  }

  function goToDay(key) {
    calendarCursor = parseDayKey(key);
    calendarView = 'day';
    renderCalendar();
  }

  function scheduleOnDay(key) {
    goToDay(key);
  }

  function handleDayIntent(key) {
    goToDay(key);
  }

  function monthGridDays(cursor) {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfDay(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }

  function weekDays(cursor) {
    const start = startOfDay(cursor);
    start.setDate(cursor.getDate() - cursor.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }

  function sessionsByDay(rows) {
    const map = {};
    rows.forEach((s) => {
      const key = dayKey(s.scheduled_at);
      if (!key) return;
      (map[key] ||= []).push(s);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)));
    return map;
  }

  function setCalendarTitle() {
    const title = SC.$('#therapy-cal-title');
    if (!title) return;
    if (calendarView === 'day') {
      title.textContent = calendarCursor.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      return;
    }
    if (calendarView === 'week') {
      const days = weekDays(calendarCursor);
      const start = days[0];
      const end = days[6];
      title.textContent = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      return;
    }
    title.textContent = calendarCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function renderCalendar() {
    const root = SC.$('#therapy-calendar');
    const legend = SC.$('#therapy-legend');
    if (!root) return;
    const rows = filteredSessions();
    const grouped = sessionsByDay(rows);
    const today = startOfDay(new Date());
    setCalendarTitle();
    SC.$$('[data-therapy-view]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.therapyView === calendarView);
    });

    if (calendarView === 'day') {
      const key = dayKey(calendarCursor);
      const items = grouped[key] || [];
      root.className = 'therapy-calendar therapy-calendar--day';
      root.innerHTML = `
        <div class="therapy-day-list">
          ${
            items.length
              ? items.map((s) => sessionChip(s)).join('')
              : `<p class="form-hint">No sessions on this day. Teachers schedule from the mobile app.</p>`
          }
        </div>`;
      if (legend) legend.hidden = false;
      return;
    }

    const days = calendarView === 'week' ? weekDays(calendarCursor) : monthGridDays(calendarCursor);
    const maxChips = calendarView === 'week' ? 6 : 3;
    root.className = `therapy-calendar therapy-calendar--${calendarView}`;
    root.innerHTML = `
      <div class="therapy-cal-weekdays">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="therapy-cal-grid">
        ${days
          .map((day) => {
            const key = dayKey(day);
            const items = grouped[key] || [];
            const extra = items.length - maxChips;
            const inMonth = day.getMonth() === calendarCursor.getMonth() || calendarView === 'week';
            return `
              <div class="therapy-cal-cell ${inMonth ? '' : 'is-outside'} ${isSameDay(day, today) ? 'is-today' : ''}" data-day="${key}">
                <button type="button" class="therapy-cal-date" data-therapy-day="${key}" aria-label="Schedule on ${key}">${day.getDate()}</button>
                <div class="therapy-cal-events">
                  ${items.slice(0, maxChips).map((s) => sessionChip(s)).join('')}
                  ${extra > 0 ? `<button type="button" class="therapy-cal-more" data-therapy-day="${key}">+${extra} more</button>` : ''}
                </div>
              </div>`;
          })
          .join('')}
      </div>`;
    if (legend) legend.hidden = false;
  }

  function upcomingRows(rows) {
    const start = startOfDay(new Date()).getTime();
    return rows
      .filter((s) => statusOf(s) !== 'cancelled' && new Date(s.scheduled_at).getTime() >= start)
      .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  }

  function groupLabel(iso) {
    const date = startOfDay(new Date(iso));
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const stamp = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    if (isSameDay(date, today)) return `Today • ${stamp}`;
    if (isSameDay(date, tomorrow)) return `Tomorrow • ${stamp}`;
    return stamp;
  }

  function setAgendaCollapsed(collapsed) {
    agendaCollapsed = Boolean(collapsed);
    const workspace = SC.$('.therapy-workspace');
    const btn = SC.$('#therapy-agenda-toggle');
    workspace?.classList.toggle('is-agenda-collapsed', agendaCollapsed);
    if (!btn) return;
    btn.setAttribute('aria-expanded', String(!agendaCollapsed));
    btn.setAttribute('aria-label', agendaCollapsed ? 'Expand upcoming sessions' : 'Collapse upcoming sessions');
    const img = btn.querySelector('img');
    if (img) {
      img.src = agendaCollapsed
        ? 'https://api.iconify.design/lucide/chevrons-left.svg?color=%230F4C4A'
        : 'https://api.iconify.design/lucide/chevrons-right.svg?color=%230F4C4A';
    }
  }

  function renderAgenda() {
    const list = SC.$('#therapy-agenda-list');
    if (!list) return;
    setAgendaCollapsed(agendaCollapsed);
    const upcoming = upcomingRows(filteredSessions());
    if (!upcoming.length) {
      list.innerHTML = '<p class="form-hint">No upcoming sessions in this view.</p>';
      return;
    }
    const groups = [];
    upcoming.forEach((s) => {
      const label = groupLabel(s.scheduled_at);
      const last = groups[groups.length - 1];
      if (!last || last.label !== label) groups.push({ label, items: [s] });
      else last.items.push(s);
    });
    list.innerHTML = groups
      .map(
        (group) => `
        <section class="therapy-agenda-group">
          <h4>${escapeHtml(group.label)}</h4>
          ${group.items
            .map((s) => {
              const child = s.child ? childName(s.child) : 'Session';
              const when = formatWhenParts(s.scheduled_at);
              return `
                <article class="therapy-agenda-card">
                  <span class="staff-avatar" aria-hidden="true">${escapeHtml(initialsFromName(child))}</span>
                  <div class="therapy-agenda-card__body">
                    <strong>${escapeHtml(child)}</strong>
                    <span>${escapeHtml(when.time)} · ${escapeHtml(String(s.duration_minutes || 60))} min</span>
                    <small>${escapeHtml(typeLabel(s))}</small>
                  </div>
                  <div class="row-actions">
                    <button type="button" class="icon-btn icon-btn--sm" data-therapy-action="view" data-session-id="${s.id}" title="View" aria-label="View session">
                      <img src="https://api.iconify.design/lucide/eye.svg?color=%230F4C4A" alt="" width="16" height="16">
                    </button>
                  </div>
                </article>`;
            })
            .join('')}
        </section>`
      )
      .join('');
  }

  function renderSessions() {
    const empty = SC.$('#therapy-empty');
    const calendar = SC.$('#therapy-calendar');
    if (!empty || !calendar) return;
    if (!isHeadDoctor()) return;
    empty.hidden = true;
    calendar.hidden = false;
    renderCalendar();
    renderAgenda();
  }

  function fillDetails(session) {
    const hero = SC.$('#therapy-view-hero');
    const list = SC.$('#therapy-detail-list');
    const notes = SC.$('#therapy-view-notes');
    if (!list) return;
    const status = statusOf(session);
    const when = formatWhenParts(session.scheduled_at);
    if (hero) {
      hero.innerHTML = `
        <div class="therapy-hero__when">
          <strong>${escapeHtml(when.date)}</strong>
          <span>${escapeHtml(when.time)}</span>
        </div>
        <div class="therapy-hero__meta">
          <span class="badge-status ${statusClass(status)}">${escapeHtml(prettyStatus(status))}</span>
          <span class="therapy-hero__dur">${escapeHtml(String(session.duration_minutes || 60))} minutes</span>
        </div>`;
    }
    const facts = [
      ['Child', session.child ? childName(session.child) : '—'],
      ['Teacher', session.teacher?.name || session.teacher?.username || '—'],
      ['Plan', session.therapy_plan?.title || 'None'],
      ['Intervention', session.intervention_notes || 'Not assigned'],
      ['Participation', session.participation || 'Not recorded'],
    ];
    list.innerHTML = facts
      .map(
        ([label, value]) => `
        <div class="staff-fact-cell">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>`
      )
      .join('');
    const noteItems = [
      ['Observations', session.observations],
      ['Outcomes', session.outcomes],
      ['Intervention notes', session.intervention_notes],
    ];
    if (notes) {
      notes.innerHTML = noteItems
        .map(([label, value]) => {
          const empty = !value;
          return `
            <article class="therapy-note">
              <span>${escapeHtml(label)}</span>
              <p class="${empty ? 'is-empty' : ''}">${escapeHtml(value || 'Not recorded')}</p>
            </article>`;
        })
        .join('');
    }
  }

  function setParticipation(value) {
    const radios = SC.$$('input[name="therapy-participation"]');
    let matched = false;
    radios.forEach((el) => {
      el.checked = el.value === (value || '');
      if (el.checked) matched = true;
    });
    if (!matched && radios[0]) radios[0].checked = true;
  }

  function participationValue() {
    return SC.$('input[name="therapy-participation"]:checked')?.value || '';
  }

  function fillCompleteChip(session) {
    const chip = SC.$('#therapy-complete-chip');
    if (!chip || !session) return;
    chip.innerHTML = `<strong>${escapeHtml(session.child ? childName(session.child) : 'Session')}</strong>
      <span>${escapeHtml(formatSessionTime(session.scheduled_at))}</span>
      <span>${escapeHtml(String(session.duration_minutes || 60))} min</span>`;
  }

  function openTherapyModal(action, sessionId, presetWhen) {
    // Head Doctor web is oversight-only; teachers schedule on mobile.
    if (action !== 'view') {
      if (sessionId) action = 'view';
      else return;
    }
    const alertEl = SC.$('#therapy-modal-alert');
    hideAlert(alertEl);
    const title = SC.$('#modal-therapy-title');
    const subtitle = SC.$('#modal-therapy-subtitle');
    const dismiss = SC.$('#therapy-modal-dismiss');
    const session = sessionId ? findSession(sessionId) : null;
    activeSessionId = session?.id || null;
    const modal = SC.$('#modal-therapy');
    if (modal) modal.dataset.therapyMode = action;
    setTherapyFace(action, session);
    if (dismiss) dismiss.textContent = 'Close';
    const results = SC.$('#therapy-suggest-results');
    if (results) results.hidden = true;

    if (action === 'view' && session) {
      if (title) title.textContent = session.child ? childName(session.child) : 'Session details';
      if (subtitle) subtitle.textContent = `${formatSessionTime(session.scheduled_at)} · ${prettyStatus(statusOf(session))}`;
      fillDetails(session);
      setPanel('view');
      setFooter('');
      openModal('modal-therapy');
    }
  }

  async function saveSession(e) {
    e.preventDefault();
    const alertEl = SC.$('#therapy-modal-alert');
    const id = SC.$('#therapy-session-id')?.value;
    const payload = {
      child_id: Number(SC.$('#therapy-session-child').value),
      teacher_id: Number(SC.$('#therapy-session-teacher').value),
      scheduled_at: combineDateAndTime(
        SC.$('#therapy-session-date')?.value,
        SC.$('#therapy-session-time')?.value,
      ),
      duration_minutes: Number(SC.$('#therapy-session-duration').value || 60),
      therapy_plan_id: SC.$('#therapy-session-plan').value || null,
    };
    try {
      await SC.withBusy({ button: e.submitter, busyLabel: 'Saving…' }, async () => {
        if (id) await SmartCareAPI.put(`/therapy-sessions/${id}`, payload);
        else await SmartCareAPI.post('/therapy-sessions', payload);
        closeModal('modal-therapy');
        await loadTherapySessions();
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function completeSession(e) {
    e.preventDefault();
    const session = findSession(activeSessionId);
    const alertEl = SC.$('#therapy-modal-alert');
    if (!session) return;
    try {
      await SC.withBusy({ button: e.submitter, busyLabel: 'Saving…' }, async () => {
        await SmartCareAPI.put(`/therapy-sessions/${session.id}`, {
          status: 'completed',
          participation: participationValue() || null,
          observations: SC.$('#therapy-observations').value.trim() || null,
          outcomes: SC.$('#therapy-outcomes').value.trim() || null,
          intervention_notes: SC.$('#therapy-intervention').value.trim() || null,
        });
        closeModal('modal-therapy');
        await loadTherapySessions();
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function generateSuggestions(e) {
    e.preventDefault();
    const alertEl = SC.$('#therapy-modal-alert');
    hideAlert(alertEl);
    const days = [...SC.$$('#therapy-suggest-days input:checked')].map((el) => Number(el.value));
    const preferredStart = SC.$('#therapy-suggest-preferred-time')?.value?.trim() || '';
    try {
      const body = {
        child_id: Number(SC.$('#therapy-suggest-child').value),
        teacher_id: Number(SC.$('#therapy-suggest-teacher').value),
        start_date: SC.$('#therapy-suggest-start').value,
        sessions_per_week: Number(SC.$('#therapy-suggest-freq').value || 2),
        duration_minutes: Number(SC.$('#therapy-suggest-duration').value || 60),
        days: days.length ? days : [1, 2, 3, 4, 5],
      };
      if (preferredStart) body.preferred_start_time = preferredStart;
      const payload = await SmartCareAPI.post('/therapy-sessions/suggest', body);
      suggestedSlots = payload.suggested_slots || [];
      const preferredMsg =
        payload.message ||
        (payload.preferred_time_applied === false ? payload.basis?.preferred_time_message : null);
      if (preferredMsg) {
        showAlert(alertEl, preferredMsg, 'info');
      }
      const wrap = SC.$('#therapy-suggest-results');
      const list = SC.$('#therapy-suggest-slots');
      if (wrap) wrap.hidden = !suggestedSlots.length;
      if (!suggestedSlots.length) {
        showAlert(alertEl, 'No slots could be generated for those days.', 'error');
        return;
      }
      list.innerHTML = suggestedSlots
        .map((slot, index) => {
          const when = formatWhenParts(slot.scheduled_at);
          const activity = slot.planned_activity || slot.intervention_notes || '';
          return `
          <label class="therapy-slot">
            <input type="checkbox" class="therapy-slot-check" data-slot-index="${index}" checked>
            <span class="therapy-slot__when">
              <strong>${escapeHtml(when.date)}</strong>
              <small>${escapeHtml(when.time)}</small>
              ${activity ? `<em class="therapy-slot__activity">${escapeHtml(activity)}</em>` : ''}
            </span>
            <span class="therapy-slot__dur">${escapeHtml(String(slot.duration_minutes || 60))} min</span>
          </label>`;
        })
        .join('');
      const toggle = SC.$('#therapy-suggest-toggle');
      if (toggle) toggle.textContent = 'Deselect all';
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function acceptSlots(button) {
    const alertEl = SC.$('#therapy-modal-alert');
    const selected = [...SC.$$('.therapy-slot-check:checked')].map((el) => suggestedSlots[Number(el.dataset.slotIndex)]).filter(Boolean);
    if (!selected.length) {
      showAlert(alertEl, 'Select at least one suggested slot.', 'error');
      return;
    }
    const childId = Number(SC.$('#therapy-suggest-child').value);
    const teacherId = Number(SC.$('#therapy-suggest-teacher').value);
    try {
      await SC.withBusy({ button, busyLabel: 'Scheduling…' }, async () => {
        for (const slot of selected) {
          await SmartCareAPI.post('/therapy-sessions', {
            child_id: childId,
            teacher_id: teacherId,
            therapy_plan_id: slot.therapy_plan_id || null,
            scheduled_at: slot.scheduled_at,
            duration_minutes: slot.duration_minutes || 60,
            intervention_notes: slot.intervention_notes || slot.planned_activity || null,
          });
        }
        closeModal('modal-therapy');
        await loadTherapySessions();
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function commitTherapy(kind, button) {
    const session = findSession(activeSessionId);
    const alertEl = SC.$('#therapy-modal-alert');
    if (kind === 'accept-slots') {
      await acceptSlots(button);
      return;
    }
    if (!session) return;
    try {
      await SC.withBusy({
        button,
        busyLabel: kind === 'cancel' ? 'Cancelling…' : 'Deleting…',
      }, async () => {
        if (kind === 'cancel') {
          await SmartCareAPI.put(`/therapy-sessions/${session.id}`, { status: 'cancelled' });
        } else if (kind === 'delete') {
          await SmartCareAPI.delete(`/therapy-sessions/${session.id}`);
        }
        closeModal('modal-therapy');
        await loadTherapySessions();
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function loadTherapySessions() {
    const loading = SC.$('#therapy-loading');
    const empty = SC.$('#therapy-empty');
    const calendar = SC.$('#therapy-calendar');
    const legend = SC.$('#therapy-legend');
    if (!loading) return;
    if (!isHeadDoctor()) {
      loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.querySelector('h3').textContent = 'Restricted';
        empty.querySelector('p').textContent = 'Therapy oversight is available to Head Doctors on web.';
      }
      if (calendar) calendar.hidden = true;
      if (legend) legend.hidden = true;
      return;
    }

    ['#open-therapy-schedule', '#open-therapy-suggest', '#empty-open-therapy'].forEach((sel) => {
      const el = SC.$(sel);
      if (el) el.hidden = true;
    });

    if (empty) empty.hidden = true;
    if (calendar) calendar.hidden = true;
    if (legend) legend.hidden = true;

    try {
      await SC.withBusy({ section: loading }, async () => {
        await ensureLookups();
        const sessions = await SmartCareAPI.get('/therapy-sessions');
        sessionCache = Array.isArray(sessions) ? sessions : sessions.data || [];
        loading.hidden = true;
        if (!sessionCache.length) {
          if (empty) {
            empty.hidden = false;
            empty.querySelector('h3').textContent = 'No sessions yet';
            empty.querySelector('p').textContent =
              'Teachers schedule therapy sessions from the mobile app. This calendar is for oversight.';
          }
          return;
        }
        renderSessions();
      });
    } catch (err) {
      loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.querySelector('h3').textContent = 'Unable to load sessions';
        empty.querySelector('p').textContent = err.message || 'Request failed.';
      }
    }
  }

  function initTherapy() {
    SC.$('#open-therapy-schedule')?.addEventListener('click', () => openTherapyModal('form'));
    SC.$('#empty-open-therapy')?.addEventListener('click', () => openTherapyModal('form'));
    SC.$('#open-therapy-suggest')?.addEventListener('click', () => openTherapyModal('suggest'));
    SC.$('#therapy-search')?.addEventListener('input', renderSessions);
    SC.$('#therapy-filter-child')?.addEventListener('change', renderSessions);
    SC.$('#therapy-filter-teacher')?.addEventListener('change', renderSessions);
    SC.$('#therapy-filter-type')?.addEventListener('change', renderSessions);
    SC.$('#therapy-cal-prev')?.addEventListener('click', () => shiftCalendar(-1));
    SC.$('#therapy-cal-next')?.addEventListener('click', () => shiftCalendar(1));
    SC.$('#therapy-cal-today')?.addEventListener('click', () => {
      calendarCursor = new Date();
      renderCalendar();
    });
    SC.$$('[data-therapy-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calendarView = btn.dataset.therapyView || 'month';
        renderCalendar();
      });
    });
    SC.$('#therapy-agenda-toggle')?.addEventListener('click', () => {
      setAgendaCollapsed(!agendaCollapsed);
    });
    SC.$('#therapy-session-child')?.addEventListener('change', () => {
      fillSelect('#therapy-session-plan', planOptions(SC.$('#therapy-session-child').value), 'No linked plan');
    });
    SC.$('.therapy-workspace')?.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-therapy-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.therapyAction;
        openTherapyModal(action === 'edit' ? 'edit' : action, actionBtn.dataset.sessionId);
        return;
      }
      const more = e.target.closest('.therapy-cal-more');
      if (more?.dataset.therapyDay) {
        goToDay(more.dataset.therapyDay);
        return;
      }
      const scheduleDay = e.target.closest('[data-therapy-schedule-day]');
      if (scheduleDay?.dataset.therapyScheduleDay) {
        scheduleOnDay(scheduleDay.dataset.therapyScheduleDay);
        return;
      }
      const cell = e.target.closest('.therapy-cal-cell');
      if (cell?.dataset.day) handleDayIntent(cell.dataset.day);
    });
    SC.$('#therapy-panel-form')?.addEventListener('submit', saveSession);
    SC.$('#therapy-panel-complete')?.addEventListener('submit', completeSession);
    SC.$('#therapy-panel-suggest')?.addEventListener('submit', generateSuggestions);
    SC.$('#therapy-suggest-toggle')?.addEventListener('click', () => {
      const boxes = [...SC.$$('.therapy-slot-check')];
      if (!boxes.length) return;
      const allOn = boxes.every((el) => el.checked);
      boxes.forEach((el) => {
        el.checked = !allOn;
      });
      const toggle = SC.$('#therapy-suggest-toggle');
      if (toggle) toggle.textContent = allOn ? 'Select all' : 'Deselect all';
    });
    SC.$('#therapy-modal-actions')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-therapy-commit]');
      if (!btn) return;
      commitTherapy(btn.dataset.therapyCommit, btn);
    });
  }

  SC.loadTherapySessions = loadTherapySessions;
  SC.initTherapy = initTherapy;
  SC.populateTherapySelects = populateLookups;
  SC.openTherapyModal = openTherapyModal;
})(window.SmartCareApp);
