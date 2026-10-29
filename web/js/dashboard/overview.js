/** SmartCare dashboard — overview */
(function (SC) {
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;
  const formatRole = SC.formatRole;
  const canManageChildren = SC.canManageChildren;
  const canCreateChecklists = SC.canCreateChecklists;
  const canSubmitAssessments = SC.canSubmitAssessments;
  const canReviewRecommendations = SC.canReviewRecommendations;
  const isHeadDoctor = SC.isHeadDoctor;
  const childName = SC.childName;
  const initialsFromName = SC.initialsFromName;
  const openModal = SC.openModal;
  const closeModal = SC.closeModal;
  const escapeHtml = SC.escapeHtml;
  const formatDate = SC.formatDate;
  const truncate = SC.truncate;



  /* Analytics dashboard */
  function maxVal(obj) {
    const values = Object.values(obj || {}).map(Number);
    return Math.max(1, ...values, 0);
  }

  function renderBarChart(container, data, options = {}) {
    if (!container) return;
    const entries = Object.entries(data || {});
    if (!entries.length) {
      container.innerHTML = '<p class="form-hint">No data yet.</p>';
      return;
    }
    const peak = maxVal(data);
    const fillClass = options.fillClass || '';
    container.innerHTML = entries
      .map(([key, value]) => {
        const pct = Math.round((Number(value) / peak) * 100);
        const label = options.labelFn ? options.labelFn(key) : formatRole(key);
        const tone = options.toneFn ? options.toneFn(key) : fillClass;
        return `
          <div class="bar-row">
            <span class="bar-row__label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
            <div class="bar-row__track" aria-hidden="true">
              <div class="bar-row__fill ${tone}" style="width:${pct}%"></div>
            </div>
            <span class="bar-row__value">${Number(value)}</span>
          </div>`;
      })
      .join('');
  }

  const ROLE_ORDER = ['head_doctor', 'psychometrician', 'teacher', 'caretaker', 'parent'];
  const ROLE_COLORS = {
    head_doctor: '#0F4C4A',
    psychometrician: '#3D7A76',
    teacher: '#5C6775',
    caretaker: '#8AA0A8',
    parent: '#C4894A',
  };
  const REC_SLICES = [
    { key: 'approved', label: 'Approved', color: '#0F4C4A' },
    { key: 'pending_review', label: 'Pending', color: '#94A3B8' },
    { key: 'rejected', label: 'Rejected', color: '#6D5A8D' },
    { key: 'modified', label: 'Edited', color: '#B45309' },
  ];
  const SESSION_SLICES = [
    { key: 'completed', label: 'Completed', color: '#0F4C4A' },
    { key: 'scheduled', label: 'Scheduled', color: '#3D8B86' },
    { key: 'cancelled', label: 'Cancelled', color: '#DC2626' },
  ];

  function renderMetricMix(container, slices, { emptyCopy, unit }) {
    if (!container) return;
    const rows = (slices || []).map((s) => ({
      ...s,
      value: Number(s.value || 0),
    }));
    const total = rows.reduce((sum, s) => sum + s.value, 0);
    if (!total) {
      container.innerHTML = `<p class="form-hint">${escapeHtml(emptyCopy)}</p>`;
      return;
    }

    const size = 132;
    const stroke = 13;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const drawn = rows.filter((s) => s.value > 0);
    const gap = drawn.length > 1 ? circ * 0.02 : 0;
    let offset = 0;
    const arcs = drawn
      .map((s) => {
        const raw = (s.value / total) * circ;
        const len = Math.max(raw - gap, 0.8);
        const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
          stroke="${s.color}" stroke-width="${stroke}"
          stroke-dasharray="${len} ${circ - len}"
          stroke-dashoffset="${-offset}" />`;
        offset += raw;
        return el;
      })
      .join('');

    const legend = rows
      .map(
        (s) => `
        <li class="${s.value === 0 ? 'is-muted' : ''}">
          <span class="metric-legend__swatch" style="background:${s.color}"></span>
          <span>${escapeHtml(s.label)}</span>
          <strong>${s.value}</strong>
        </li>`
      )
      .join('');

    container.innerHTML = `
      <div class="metric-mix">
        <div class="donut-modern">
          <svg class="donut-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
            <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#E8EEF2" stroke-width="${stroke}" />
            <g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>
          </svg>
          <div class="donut-center">
            <strong>${total}</strong>
            <span>${escapeHtml(unit)}</span>
          </div>
        </div>
        <ul class="metric-legend">${legend}</ul>
      </div>`;
  }

  function renderDonutChart(container, data) {
    const slices = ROLE_ORDER.map((key) => ({
      key,
      label: formatRole(key),
      value: Number((data || {})[key] || 0),
      color: ROLE_COLORS[key],
    }));
    renderMetricMix(container, slices, { emptyCopy: 'No staff data yet.', unit: 'staff' });
  }

  function renderVerticalBars(container, data) {
    const slices = REC_SLICES.map((s) => ({
      ...s,
      value: Number((data || {})[s.key] || 0),
    }));
    renderMetricMix(container, slices, { emptyCopy: 'No recommendations yet.', unit: 'reviews' });
  }

  function greetForHour(hour) {
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function greetName(user) {
    const name = String(user?.name || '').trim();
    if (!name) return '';
    const role = String(formatRole(user?.role) || '').toLowerCase();
    if (name.toLowerCase() === role || /^(head doctor|psychometrician)$/i.test(name)) return '';
    const cleaned = name.replace(/^dr\.?\s+/i, '');
    return cleaned.split(/\s+/).filter(Boolean)[0] || '';
  }

  function gotoSection(section) {
    SC.navigateToSection?.(section);
  }

  function renderHero(report) {
    const root = SC.$('#overview-hero');
    if (!root) return;
    const user = SC.state.currentUser || {};
    const now = new Date();
    const who = greetName(user);

    if (SC.isPsychometrician()) {
      const week = report.assessments_this_week ?? 0;
      const pendingAi = report.pending_ai_generation ?? 0;
      const awaiting = report.awaiting_teacher_review ?? 0;
      let lead;
      if (pendingAi > 0) {
        lead = `<strong>${pendingAi}</strong> assessment${pendingAi === 1 ? '' : 's'} ready for AI recommendation.`;
      } else if (awaiting > 0) {
        lead = `<strong>${awaiting}</strong> recommendation${awaiting === 1 ? '' : 's'} awaiting teacher review.`;
      } else if (week > 0) {
        lead = `You submitted <strong>${week}</strong> assessment${week === 1 ? '' : 's'} this week.`;
      } else {
        lead = 'Start a new assessment when a child is ready for scoring.';
      }
      root.className = 'care-hero care-hero--psycho';
      root.innerHTML = `
        <div class="care-hero__main">
          <p class="care-hero__eyebrow">Psychometrician workspace</p>
          <p class="care-hero__date">${escapeHtml(now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          <h3>${escapeHtml(greetForHour(now.getHours()))}${who ? `, ${escapeHtml(who)}` : ''}</h3>
          <p class="care-hero__lead">${lead}</p>
          <div class="care-hero__actions">
            <button type="button" class="btn btn-primary" data-goto="assessments" data-open="assessment">Start assessment</button>
            <button type="button" class="btn btn-secondary" data-goto="assessments">View submissions</button>
          </div>
        </div>
        <dl class="care-hero__stats care-hero__stats--compact">
          <div>
            <dt>This week</dt>
            <dd>${week}</dd>
          </div>
          <div class="${pendingAi > 0 ? 'is-warn' : ''}">
            <dt>Ready for AI</dt>
            <dd>${pendingAi}</dd>
          </div>
          <div>
            <dt>Awaiting review</dt>
            <dd>${awaiting}</dd>
          </div>
        </dl>`;
      return;
    }

    root.className = 'care-hero';

    const today = report.sessions_today ?? 0;
    const upcoming = report.sessions_scheduled_upcoming ?? 0;
    const pending = report.pending_recommendations ?? 0;
    let lead;
    if (today > 0 && pending > 0) {
      lead = `There are <strong>${today} scheduled session${today === 1 ? '' : 's'}</strong> today. ${pending} AI recommendation${pending === 1 ? '' : 's'} still need review.`;
    } else if (today > 0) {
      lead = `There are <strong>${today} scheduled session${today === 1 ? '' : 's'}</strong> today.`;
    } else if (upcoming > 0) {
      lead = `<strong>${upcoming} session${upcoming === 1 ? '' : 's'}</strong> are on the calendar from today onward.`;
    } else {
      lead = 'No therapy sessions are scheduled yet. Start from the calendar when you are ready.';
    }

    root.innerHTML = `
      <div class="care-hero__main">
        <p class="care-hero__date">${escapeHtml(now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
        <h3>${escapeHtml(greetForHour(now.getHours()))}${who ? `, ${escapeHtml(who)}` : ''}.</h3>
        <p class="care-hero__lead">${lead}</p>
      </div>
      <dl class="care-hero__stats">
        <div>
          <dt>Active children</dt>
          <dd>${report.children_active ?? 0}</dd>
        </div>
        <div>
          <dt>Upcoming sessions</dt>
          <dd>${upcoming}</dd>
        </div>
        <div>
          <dt>Reviews waiting</dt>
          <dd>${pending}</dd>
        </div>
      </dl>`;
  }

  function renderSessionSpark(container, data) {
    if (!container) return;
    const slices = SESSION_SLICES.map((s) => ({
      ...s,
      value: Number((data || {})[s.key] || 0),
    }));
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const live = slices.filter((s) => s.key !== 'cancelled').reduce((sum, s) => sum + s.value, 0);
    const completed = slices.find((s) => s.key === 'completed')?.value || 0;
    const pct = live ? Math.round((completed / live) * 100) : 0;
    if (!total) {
      container.innerHTML = `
        <div class="care-activity__head">
          <h3 class="panel-title">Session health</h3>
          <p class="form-hint">No session activity yet.</p>
        </div>`;
      return;
    }

    const size = 208;
    const stroke = 12;
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const drawn = slices.filter((s) => s.value > 0);
    const gap = drawn.length > 1 ? circ * 0.018 : 0;
    let offset = 0;
    const arcs = drawn
      .map((s) => {
        const raw = (s.value / total) * circ;
        const len = Math.max(raw - gap, 0.8);
        const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
          stroke="${s.color}" stroke-width="${stroke}"
          stroke-dasharray="${len} ${circ - len}"
          stroke-dashoffset="${-offset}" />`;
        offset += raw;
        return el;
      })
      .join('');
    const tiles = slices
      .map(
        (s) => `
        <li class="${s.value === 0 ? 'is-muted' : ''}">
          <span class="metric-legend__swatch" style="background:${s.color}"></span>
          <span>${escapeHtml(s.label)}</span>
          <strong>${s.value}</strong>
        </li>`
      )
      .join('');

    container.innerHTML = `
      <div class="care-activity__head">
        <h3 class="panel-title">Session health</h3>
        <p><strong>${completed}</strong> of <strong>${live || total}</strong> non-cancelled sessions are completed.</p>
      </div>
      <div class="care-activity__body">
        <div class="session-health-chart">
          <div class="donut-modern donut-modern--lg">
            <svg class="donut-svg" viewBox="0 0 ${size} ${size}" aria-hidden="true">
              <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#E8EEF2" stroke-width="${stroke}" />
              <g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>
            </svg>
            <div class="donut-center">
              <strong>${pct}%</strong>
              <span>completed</span>
            </div>
          </div>
        </div>
        <ul class="session-health-tiles">${tiles}</ul>
      </div>`;
  }

  function renderAttentionFeed(report) {
    const list = SC.$('#attention-list');
    const countEl = SC.$('#priority-count');
    const cta = SC.$('#priority-cta');
    if (!list) return;
    const pending = report.pending_recommendations ?? 0;
    const upcoming = report.sessions_scheduled_upcoming ?? 0;
    const inactive = Math.max(0, (report.children_count ?? 0) - (report.children_active ?? 0));
    const items = [];
    if (pending > 0) {
      items.push({
        tone: 'warn',
        title: `${pending} AI recommendation${pending === 1 ? '' : 's'} awaiting review`,
        meta: SC.isPsychometrician() ? 'Assessments · Awaiting teacher review' : 'Assessments · Needs review',
        section: 'assessments',
      });
    }
    if (inactive > 0) {
      items.push({
        tone: 'rose',
        title: `${inactive} inactive child profile${inactive === 1 ? '' : 's'}`,
        meta: 'Registry · Follow up',
        section: 'children',
      });
    }
    if (upcoming > 0 && !SC.isPsychometrician()) {
      items.push({
        tone: 'teal',
        title: `${upcoming} therapy session${upcoming === 1 ? '' : 's'} still scheduled`,
        meta: 'Calendar · Upcoming',
        section: 'therapy',
      });
    }
    if (countEl) {
      countEl.textContent = `${items.length} open`;
      countEl.classList.toggle('is-quiet', items.length === 0);
      countEl.classList.toggle('is-active', items.length > 0);
    }
    if (cta) {
      cta.dataset.goto = pending > 0 ? 'assessments' : items[0]?.section || 'assessments';
    }
    if (!items.length) {
      list.innerHTML = `
        <div class="priority-empty">
          <span class="priority-empty__icon" aria-hidden="true">
            <img src="https://api.iconify.design/lucide/check-circle-2.svg?color=%230F4C4A" alt="" width="22" height="22">
          </span>
          <p><strong>All clear</strong></p>
          <p class="form-hint">Nothing needs attention right now.</p>
        </div>`;
      return;
    }
    const visible = items.slice(0, 5);
    list.innerHTML = visible
      .map(
        (item) => `
        <button type="button" class="priority-item priority-item--${item.tone}" data-goto="${item.section}">
          <i class="priority-dot priority-dot--${item.tone}" aria-hidden="true"></i>
          <span>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.meta)}</small>
          </span>
          <img src="https://api.iconify.design/lucide/chevron-right.svg?color=%230F4C4A" alt="" width="16" height="16">
        </button>`
      )
      .join('');
  }

  function formatSessionTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  function formatSessionClock(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return iso;
    }
  }

  async function loadOverviewSessions(preloaded = null) {
    const loading = SC.$('#overview-sessions-loading');
    const empty = SC.$('#overview-sessions-empty');
    const wrap = SC.$('#overview-sessions-wrap');
    const tbody = SC.$('#overview-sessions-tbody');
    if (!loading || !tbody) return;

    if (SC.isPsychometrician?.()) {
      loading.hidden = true;
      if (empty) empty.hidden = true;
      if (wrap) wrap.hidden = true;
      return;
    }

    loading.hidden = false;
    empty.hidden = true;
    wrap.hidden = true;

    try {
      let upcoming = Array.isArray(preloaded) ? preloaded : null;
      if (!upcoming) {
        const rows = await SmartCareAPI.get('/therapy-sessions?upcoming=1&limit=6');
        upcoming = Array.isArray(rows) ? rows : rows.data || [];
      }

      loading.hidden = true;
      if (!upcoming.length) {
        empty.hidden = false;
        return;
      }

      wrap.hidden = false;
      tbody.innerHTML = upcoming
        .map((s) => {
          const name = s.child ? childName(s.child) : `Child #${s.child_id}`;
          const plan = s.therapy_plan?.title || s.therapyPlan?.title || prettySessionStatus(s);
          const teacher = s.teacher?.name || 'Unassigned';
          return `
            <tr data-goto="${SC.isPsychometrician() ? 'children' : 'therapy'}" ${SC.isPsychometrician() && s.child_id ? `data-child-id="${s.child_id}"` : ''}>
              <td>
                <div class="care-child">
                  <span class="staff-avatar" aria-hidden="true">${escapeHtml(initialsFromName(name))}</span>
                  <span>
                    <strong>${escapeHtml(name)}</strong>
                    <small>${escapeHtml(plan)}</small>
                  </span>
                </div>
              </td>
              <td>${escapeHtml(formatSessionClock(s.scheduled_at))}</td>
              <td>${escapeHtml(teacher)}</td>
              <td class="row-action">
                <img src="https://api.iconify.design/lucide/ellipsis.svg?color=%235C6775" alt="" width="16" height="16">
              </td>
            </tr>`;
        })
        .join('');
    } catch {
      loading.hidden = true;
      empty.hidden = false;
      empty.querySelector('p').textContent = 'Could not load therapy sessions.';
    }
  }

  function prettySessionStatus(session) {
    const status = String(session?.status || 'scheduled').replace(/_/g, ' ');
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function setOverviewLayout(mode) {
    const headLayout = SC.$('#overview-layout-head');
    const psychoLayout = SC.$('#overview-layout-psycho');
    const psycho = mode === 'psycho';
    headLayout?.classList.toggle('is-layout-hidden', psycho);
    psychoLayout?.classList.toggle('is-layout-hidden', !psycho);
    const sessionsLoading = SC.$('#overview-sessions-loading');
    if (sessionsLoading) sessionsLoading.hidden = psycho;
  }

  function psychoRecStatus(recs) {
    if (SC.recommendationStatusMeta) return SC.recommendationStatusMeta(recs);
    const list = (Array.isArray(recs) ? recs : []).filter((r) => r.status !== 'rejected');
    if (!list.length) return { label: 'Needs AI', className: 'psycho-status--pending' };
    const status = list[0].status || 'pending_review';
    const map = {
      pending_review: { label: 'Awaiting review', className: 'psycho-status--review' },
      approved: { label: 'Approved', className: 'psycho-status--approved' },
      modified: { label: 'Edited', className: 'psycho-status--modified' },
    };
    return map[status] || { label: String(status).replace(/_/g, ' '), className: 'psycho-status--neutral' };
  }

  function renderPsychoNextActions(summary) {
    const feed = SC.$('#psycho-next-actions');
    const countEl = SC.$('#psycho-next-count');
    if (!feed) return;

    const pendingAi = summary.pending_ai_generation ?? 0;
    const awaiting = summary.awaiting_teacher_review ?? 0;
    const items = [];

    if (pendingAi > 0) {
      items.push({
        tone: 'warn',
        title: `Generate AI for ${pendingAi} assessment${pendingAi === 1 ? '' : 's'}`,
        meta: 'Finalized scores ready for recommendation',
        goto: 'assessments',
      });
    }
    if (awaiting > 0) {
      items.push({
        tone: 'teal',
        title: `${awaiting} awaiting teacher review`,
        meta: 'Submitted recommendations in review queue',
        goto: 'assessments',
      });
    }
    if (!summary.assessments_submitted_total) {
      items.push({
        tone: 'rose',
        title: 'Submit your first assessment',
        meta: 'Choose a child and active checklist',
        goto: 'assessments',
        open: 'assessment',
      });
    }
    if ((summary.children_active ?? 0) > 0 && !items.length) {
      items.push({
        tone: 'teal',
        title: 'All caught up',
        meta: `${summary.children_active} active children in registry`,
        goto: 'children',
      });
    }

    if (countEl) countEl.textContent = String(Math.max(items.filter((i) => i.title !== 'All caught up').length, 0));

    if (!items.length) {
      feed.innerHTML = '<p class="form-hint">Nothing needs attention right now.</p>';
      return;
    }

    feed.innerHTML = items
      .map(
        (item) => `
        <button type="button" class="psycho-next__item" data-goto="${item.goto}"${item.open ? ` data-open="${item.open}"` : ''}>
          <i class="priority-dot priority-dot--${item.tone}" aria-hidden="true"></i>
          <span>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.meta)}</small>
          </span>
          <img src="https://api.iconify.design/lucide/chevron-right.svg?color=%235C6775" alt="" width="16" height="16">
        </button>`
      )
      .join('');
  }

  function renderPsychoRecent(summary) {
    const loading = SC.$('#psycho-recent-loading');
    const empty = SC.$('#psycho-recent-empty');
    const list = SC.$('#psycho-recent-list');
    if (!list) return;

    const rows = summary.recent_assessments || [];
    if (loading) loading.hidden = true;

    if (!rows.length) {
      if (empty) empty.hidden = false;
      list.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    list.hidden = false;
    list.innerHTML = rows
      .map((a) => {
        const child = a.child || {};
        const checklist = a.checklist || {};
        const status = psychoRecStatus(a.ai_recommendations);
        const severity = a.severity_level
          ? a.severity_level.charAt(0).toUpperCase() + a.severity_level.slice(1)
          : 'Not set';
        const name = childName(child);
        return `
        <li class="psycho-recent__item">
          <button type="button" class="psycho-recent__open" data-assessment-id="${a.id}">
            <span class="psycho-recent__avatar" aria-hidden="true">${escapeHtml(initialsFromName(name))}</span>
            <span class="psycho-recent__body">
              <strong>${escapeHtml(name)}</strong>
              <small>${escapeHtml(checklist.title || 'Checklist')} · ${escapeHtml(severity)} · ${escapeHtml(formatDate(a.created_at))}</small>
            </span>
            <span class="psycho-status ${status.className}">${escapeHtml(status.label)}</span>
          </button>
        </li>`;
      })
      .join('');
  }

  function renderPsychoAnalytics(summary) {
    const loading = SC.$('#analytics-loading');
    const root = SC.$('#analytics-root');
    const err = SC.$('#analytics-error');
    if (loading) loading.hidden = true;
    if (err) err.hidden = true;
    if (root) root.hidden = false;

    const headLayout = SC.$('#overview-layout-head');
    const psychoLayout = SC.$('#overview-layout-psycho');
    setOverviewLayout('psycho');

    renderHero(summary);
    renderPsychoNextActions(summary);
    renderPsychoRecent(summary);

    const subtitle = SC.$('#topbar-subtitle');
    if (subtitle) subtitle.textContent = 'Your assessments, AI drafts, and child records';

    const week = summary.assessments_this_week ?? 0;
    const total = summary.assessments_submitted_total ?? 0;
    const pendingAi = summary.pending_ai_generation ?? 0;
    const awaiting = summary.awaiting_teacher_review ?? 0;

    SC.$('#kpi-grid').innerHTML = `
      <article class="kpi kpi--accent">
        <span class="kpi__label">My assessments</span>
        <span class="kpi__value">${total}</span>
        <span class="kpi__meta">${week} submitted this week</span>
      </article>
      <article class="kpi ${pendingAi > 0 ? 'kpi--action' : ''}">
        <span class="kpi__label">Ready for AI</span>
        <span class="kpi__value">${pendingAi}</span>
        <span class="kpi__meta">${pendingAi ? 'Generate recommendations' : 'All drafts submitted'}</span>
      </article>
      <article class="kpi">
        <span class="kpi__label">Awaiting review</span>
        <span class="kpi__value">${awaiting}</span>
        <span class="kpi__meta">Teacher review queue</span>
      </article>
      <article class="kpi">
        <span class="kpi__label">Active children</span>
        <span class="kpi__value">${summary.children_active ?? 0}</span>
        <span class="kpi__meta">${summary.checklists_active ?? 0} active checklists</span>
      </article>`;
  }

  function renderAnalytics(report) {
    const loading = SC.$('#analytics-loading');
    const root = SC.$('#analytics-root');
    const err = SC.$('#analytics-error');
    if (loading) loading.hidden = true;
    if (err) err.hidden = true;
    if (root) root.hidden = false;

    if (SC.isPsychometrician()) {
      renderPsychoAnalytics(report);
      return;
    }

    const headLayout = SC.$('#overview-layout-head');
    const psychoLayout = SC.$('#overview-layout-psycho');
    setOverviewLayout('head');

    const subtitle = SC.$('#topbar-subtitle');
    if (subtitle) subtitle.textContent = 'Sessions, reviews, and facility status';
    const continuity = SC.$('#care-continuity-copy');
    if (continuity) {
      continuity.textContent = 'Sessions, plans, and clinical decisions stay on the same child record.';
    }

    const pending = report.pending_recommendations ?? 0;
    const children = report.children_count ?? 0;
    const activeChildren = report.children_active ?? children;
    const today = report.sessions_today ?? 0;
    const upcoming = report.sessions_scheduled_upcoming ?? 0;
    const completed = report.sessions_completed_this_month ?? 0;
    const activePct = children ? Math.round((activeChildren / children) * 100) : 0;
    const seeAll = SC.$('#overview-view-sessions');
    if (seeAll) seeAll.hidden = !isHeadDoctor();
    const emptySchedule = SC.$('#overview-empty-schedule');
    if (emptySchedule) emptySchedule.hidden = true;
    const progressCard = SC.$('#overview-progress-card');
    if (progressCard) progressCard.hidden = !isHeadDoctor();

    renderHero(report);

    SC.$('#kpi-grid').innerHTML = `
      <article class="kpi">
        <span class="kpi__label">Children in care</span>
        <span class="kpi__value">${children}</span>
        <span class="kpi__meta kpi__meta--ok">${activeChildren} active profiles</span>
      </article>
      <article class="kpi">
        <span class="kpi__label">Today's sessions</span>
        <span class="kpi__value">${today}</span>
        <span class="kpi__meta">${upcoming} upcoming overall</span>
      </article>
      <article class="kpi">
        <span class="kpi__label">Active profiles</span>
        <span class="kpi__value">${activePct}%</span>
        <span class="kpi__meta kpi__meta--ok">${activeChildren} of ${children} children</span>
      </article>
      <article class="kpi ${pending > 0 ? 'kpi--warn-card' : ''}">
        <span class="kpi__label">Items needing review</span>
        <span class="kpi__value">${pending}</span>
        <span class="kpi__meta">${completed} sessions completed this month</span>
      </article>`;

    renderSessionSpark(SC.$('#chart-sessions'), report.sessions_by_status || {});
    renderAttentionFeed(report);
    loadOverviewSessions(report.upcoming_sessions || null);
  }

  function initOverviewActions() {
    const root = SC.$('#analytics-root');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    root.addEventListener('click', (e) => {
      const recent = e.target.closest('.psycho-recent__open');
      if (recent) {
        const id = recent.dataset.assessmentId;
        if (id) {
          SC.navigateToSection?.('assessments');
          window.setTimeout(() => SC.openAssessmentView?.(id), 0);
        }
        return;
      }
      const btn = e.target.closest('[data-goto]');
      if (!btn) return;
      const childId = btn.dataset.childId;
      if (childId && btn.dataset.goto === 'children') {
        SC.navigateToSection?.('children');
        window.setTimeout(() => SC.openChildProfile?.(Number(childId)), 0);
        return;
      }
      gotoSection(btn.dataset.goto);
      if (btn.dataset.open === 'therapy-schedule') {
        window.setTimeout(() => SC.$('#open-therapy-schedule')?.click(), 0);
      }
      if (btn.dataset.open === 'assessment') {
        window.setTimeout(() => SC.$('#open-assessment-modal')?.click(), 0);
      }
    });
  }

  async function loadAnalytics() {
    const loading = SC.$('#analytics-loading');
    const err = SC.$('#analytics-error');
    const root = SC.$('#analytics-root');
    const recentLoading = SC.$('#psycho-recent-loading');
    try {
      if (SC.isPsychometrician() && recentLoading) recentLoading.hidden = false;
      const report = SC.isPsychometrician()
        ? await SmartCareAPI.get('/reports/psychometrician-summary')
        : await SmartCareAPI.get('/reports/overview');
      renderAnalytics(report);
      window.__facilityReport = report;
      if (SC.refreshReportPreview) SC.refreshReportPreview();
    } catch (e) {
      if (loading) loading.hidden = true;
      if (recentLoading) recentLoading.hidden = true;
      if (root) root.hidden = true;
      if (err) {
        err.hidden = false;
        err.textContent = e.message || 'Could not load analytics.';
      }
    }
  }

  SC.maxVal = maxVal;
  SC.renderBarChart = renderBarChart;
  SC.renderDonutChart = renderDonutChart;
  SC.renderVerticalBars = renderVerticalBars;
  SC.renderSessionSpark = renderSessionSpark;
  SC.renderAttentionFeed = renderAttentionFeed;
  SC.formatSessionTime = formatSessionTime;
  SC.loadOverviewSessions = loadOverviewSessions;
  SC.renderAnalytics = renderAnalytics;
  SC.initOverviewActions = initOverviewActions;
  SC.loadAnalytics = loadAnalytics;
})(window.SmartCareApp);
