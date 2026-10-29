/**
 * SmartCare dashboard — Head Doctor / Psychometrician operate mode.
 */
(function () {
  if (!SmartCareAuth.requireAuth('login.html')) return;

  let currentUser = null;
  let childrenCache = [];
  let checklistsCache = [];
  let assessmentsCache = [];
  let lastAssessmentChildId = null;
  let lastAssessmentId = null;
  let viewingAssessmentId = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function showAlert(el, message, type) {
    el.textContent = message;
    el.className = `alert alert-${type || 'info'}`;
    el.hidden = false;
  }

  function hideAlert(el) {
    el.hidden = true;
  }

  function formatRole(role) {
    return SmartCareAuth.formatRole(typeof role === 'object' ? role.value || role : role);
  }

  function canManageChildren() {
    return SmartCareAuth.hasRole(currentUser, 'head_doctor', 'psychometrician');
  }

  function canCreateChecklists() {
    return SmartCareAuth.hasRole(currentUser, 'head_doctor');
  }

  function canSubmitAssessments() {
    return SmartCareAuth.hasRole(currentUser, 'head_doctor', 'psychometrician');
  }

  function canReviewRecommendations() {
    return SmartCareAuth.hasRole(currentUser, 'head_doctor', 'teacher');
  }

  function isHeadDoctor() {
    return SmartCareAuth.hasRole(currentUser, 'head_doctor');
  }

  function childName(child) {
    return `${child.first_name} ${child.last_name}`;
  }

  /* Navigation */
  const sectionMeta = {
    dashboard: {
      title: 'Overview',
      subtitle: 'System status and operational metrics',
    },
    children: {
      title: 'Children Registry',
      subtitle: 'Manage active and inactive patient records',
    },
    checklists: {
      title: 'Checklists Library',
      subtitle: 'Manage and access clinical assessment checklists',
    },
    assessments: {
      title: 'Assessments Hub',
      subtitle: 'Encoding, severity & AI suggestions',
    },
    reports: {
      title: 'Reports',
      subtitle: 'Facility and child summaries',
    },
    staff: {
      title: 'Staff Directory',
      subtitle: 'Accounts, roles, and facility access',
    },
    therapy: {
      title: 'Therapy Sessions',
      subtitle: 'Schedule and session status',
    },
    medication: {
      title: 'Medication Schedules',
      subtitle: 'Plans and administration readiness',
    },
    materials: {
      title: 'Resource Library',
      subtitle: 'Learning materials for therapy support',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Workspace preferences',
    },
  };

  function initialsFromName(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return 'SC';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  function initNav() {
    $$('.nav-link[data-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.dataset.section;
        $$('.nav-link[data-section]').forEach((b) => b.classList.toggle('is-active', b === btn));
        $$('.section-panel').forEach((panel) => {
          panel.classList.toggle('is-visible', panel.id === `section-${section}`);
        });
        const meta = sectionMeta[section] || { title: 'SmartCare', subtitle: '' };
        const title = $('#topbar-title');
        const subtitle = $('#topbar-subtitle');
        if (title) title.textContent = meta.title;
        if (subtitle) subtitle.textContent = meta.subtitle;

        if (section === 'dashboard') {
          if (!window.__facilityReport) loadAnalytics();
          else {
            renderAnalytics(window.__facilityReport);
          }
        }
        if (section === 'children' && !childrenCache.length) loadChildren();
        if (section === 'checklists' && !checklistsCache.length) loadChecklists();
        if (section === 'assessments') loadSubmittedAssessments();
        if (section === 'reports') loadFacilityReport();
        if (section === 'staff') loadStaff();
        if (section === 'therapy') loadTherapySessions();
        if (section === 'medication') loadMedicationSchedules();
        if (section === 'materials') loadMaterials();
      });
    });

    const helpBtn = $('#nav-help');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        window.alert('SmartCare Operate help: use Children, Checklists, and Assessments for clinical workflows. AI recommendations require human review.');
      });
    }

    $('#logout-btn').addEventListener('click', () => SmartCareAuth.logout());
  }

  /* User */
  async function loadMe() {
    try {
      currentUser = await SmartCareAuth.fetchMe();
    } catch {
      currentUser = SmartCareAuth.getStoredUser();
      if (!currentUser) {
        SmartCareAuth.logout();
        return;
      }
    }

    $('#user-badge').innerHTML = `
      <span class="user-avatar" aria-hidden="true">${escapeHtml(initialsFromName(currentUser.name))}</span>
      <span class="user-badge__meta">
        <strong>${escapeHtml(currentUser.name)}</strong>
        <span>${escapeHtml(formatRole(currentUser.role))}</span>
      </span>
    `;
    applyRoleRestrictions();
  }

  function applyRoleRestrictions() {
    const childRestricted = $('#create-child-restricted');
    if (!canManageChildren()) {
      childRestricted.hidden = false;
      ['#open-child-modal', '#empty-open-child'].forEach((sel) => {
        const el = $(sel);
        if (el) {
          el.disabled = true;
          el.hidden = true;
        }
      });
      const childForm = $('#create-child-form');
      if (childForm) childForm.querySelector('button[type=submit]').disabled = true;
    }

    const checklistRestricted = $('#create-checklist-restricted');
    if (!canCreateChecklists()) {
      checklistRestricted.hidden = false;
      ['#open-checklist-modal', '#empty-open-checklist'].forEach((sel) => {
        const el = $(sel);
        if (el) {
          el.disabled = true;
          el.hidden = true;
        }
      });
      const checklistForm = $('#create-checklist-form');
      if (checklistForm) checklistForm.querySelector('button[type=submit]').disabled = true;
      const addBtn = $('#add-checklist-item-btn');
      if (addBtn) addBtn.disabled = true;
    }

    const assessmentRestricted = $('#submit-assessment-restricted');
    if (!canSubmitAssessments()) {
      assessmentRestricted.hidden = false;
      ['#open-assessment-modal', '#overview-new-assessment'].forEach((sel) => {
        const openBtn = $(sel);
        if (openBtn) {
          openBtn.disabled = true;
          openBtn.hidden = true;
        }
      });
      const assessmentForm = $('#submit-assessment-form');
      if (assessmentForm) assessmentForm.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    } else {
      const overviewBtn = $('#overview-new-assessment');
      if (overviewBtn) {
        overviewBtn.disabled = false;
        overviewBtn.hidden = false;
      }
    }

    const facilityRestricted = $('#facility-report-restricted');
    if (facilityRestricted) {
      facilityRestricted.hidden = true;
    }

    $$('.nav-link[data-role="head_doctor"]').forEach((el) => {
      el.hidden = !isHeadDoctor();
    });
  }

  /* Modals */
  function openModal(id) {
    const d = $(`#${id}`);
    if (d?.showModal) d.showModal();
  }

  function closeModal(id) {
    const d = $(`#${id}`);
    if (d?.open) d.close();
  }

  function initModals() {
    $$('[data-open-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.id === 'open-child-modal' || btn.id === 'empty-open-child') {
          if (!canManageChildren()) return;
        }
        if (btn.id === 'open-checklist-modal' || btn.id === 'empty-open-checklist') {
          if (!canCreateChecklists()) return;
        }
        if (btn.id === 'open-assessment-modal') {
          if (!canSubmitAssessments()) return;
        }
        openModal(btn.getAttribute('data-open-modal'));
      });
    });
    $$('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('dialog')?.close());
    });
    $$('dialog.modal').forEach((d) => {
      d.addEventListener('click', (e) => {
        if (e.target === d) d.close();
      });
    });
  }

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

  function renderDonutChart(container, data) {
    if (!container) return;
    const entries = Object.entries(data || {}).filter(([, v]) => Number(v) > 0);
    const total = entries.reduce((sum, [, v]) => sum + Number(v), 0);
    if (!total) {
      container.innerHTML = '<p class="form-hint">No staff data yet.</p>';
      return;
    }

    const colors = ['#0F4C4A', '#7C3AED', '#94A3B8', '#0F766E', '#F59E0B'];
    const size = 140;
    const stroke = 18;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    let offset = 0;

    const arcs = entries
      .map(([key, value], i) => {
        const frac = Number(value) / total;
        const len = frac * c;
        const dash = `${len} ${c - len}`;
        const el = `<circle class="donut-arc" cx="${size / 2}" cy="${size / 2}" r="${r}"
          stroke="${colors[i % colors.length]}" stroke-width="${stroke}" fill="none"
          stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" stroke-linecap="round" />`;
        offset += len;
        return el;
      })
      .join('');

    const legend = entries
      .map(
        ([key, value], i) => `
        <li>
          <span class="donut-legend__swatch" style="background:${colors[i % colors.length]}"></span>
          <span>${escapeHtml(formatRole(key))}</span>
          <strong>${Number(value)}</strong>
        </li>`
      )
      .join('');

    container.innerHTML = `
      <div class="donut-modern">
        <svg class="donut-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#E8EEF2" stroke-width="${stroke}" />
          <g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>
        </svg>
        <div class="donut-center">
          <span>100%</span>
          <small>${total} staff</small>
        </div>
      </div>
      <ul class="donut-legend">${legend}</ul>`;
  }

  function renderVerticalBars(container, data) {
    if (!container) return;
    const order = ['approved', 'pending_review', 'rejected', 'modified'];
    const labels = {
      approved: 'Approved',
      pending_review: 'Pending',
      rejected: 'Rejected',
      modified: 'Modified',
    };
    const tones = {
      approved: 'bar-simple--teal',
      pending_review: 'bar-simple--slate',
      rejected: 'bar-simple--violet',
      modified: 'bar-simple--amber',
    };
    const entries = order
      .filter((k) => data && Object.prototype.hasOwnProperty.call(data, k))
      .map((k) => [k, Number(data[k] || 0)]);
    if (!entries.length) {
      container.innerHTML = '<p class="form-hint">No recommendations yet.</p>';
      return;
    }
    const peak = Math.max(1, ...entries.map(([, v]) => v));
    container.innerHTML = `
      <div class="bar-simple">
        ${entries
          .map(([key, value]) => {
            const pct = Math.round((value / peak) * 100);
            return `
              <div class="bar-simple__row">
                <span class="bar-simple__label">${escapeHtml(labels[key] || key)}</span>
                <div class="bar-simple__track">
                  <div class="bar-simple__fill ${tones[key] || ''}" style="width:${pct}%"></div>
                </div>
                <span class="bar-simple__value">${value}</span>
              </div>`;
          })
          .join('')}
      </div>`;
  }

  function renderSessionSpark(container, data) {
    if (!container) return;
    const scheduled = Number(data?.scheduled || 0);
    const completed = Number(data?.completed || 0);
    const cancelled = Number(data?.cancelled || 0);
    const total = scheduled + completed + cancelled;

    if (!total) {
      container.innerHTML = '<p class="form-hint">No session activity yet.</p>';
      return;
    }

    const completion = Math.round((completed / total) * 100);
    const cancelledPct = Math.round((cancelled / total) * 100);
    const scheduledPct = Math.max(0, 100 - completion - cancelledPct);

    // Smooth area path across status mix (scheduled → completed → cancelled as health curve)
    const values = [Math.max(scheduled, 1), Math.max(completed, 1), Math.max(completed * 0.85 + scheduled * 0.15, 1), Math.max(completed, 1)];
    const peak = Math.max(...values);
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 78 - (v / peak) * 58;
      return [x, y];
    });
    const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
    const area = `0,82 ${line} 100,82`;

    const ringSize = 96;
    const stroke = 10;
    const r = (ringSize - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const ringLen = (completion / 100) * circ;

    container.innerHTML = `
      <div class="session-health">
        <div class="session-health__top">
          <div class="session-ring-wrap">
            <svg class="session-ring" viewBox="0 0 ${ringSize} ${ringSize}" width="${ringSize}" height="${ringSize}" aria-hidden="true">
              <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${r}" fill="none" stroke="#E8EEF2" stroke-width="${stroke}" />
              <circle cx="${ringSize / 2}" cy="${ringSize / 2}" r="${r}" fill="none"
                stroke="url(#sessionGrad)" stroke-width="${stroke}" stroke-linecap="round"
                stroke-dasharray="${ringLen} ${circ - ringLen}"
                transform="rotate(-90 ${ringSize / 2} ${ringSize / 2})" />
              <defs>
                <linearGradient id="sessionGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#0F4C4A"/>
                  <stop offset="100%" stop-color="#14B8A6"/>
                </linearGradient>
              </defs>
            </svg>
            <div class="session-ring__center">
              <strong>${completion}%</strong>
              <span>complete</span>
            </div>
          </div>
          <div class="session-health__summary">
            <p class="session-health__total"><strong>${total}</strong> total sessions</p>
            <div class="session-stack" aria-hidden="true">
              <span class="session-stack__seg session-stack__seg--done" style="width:${completion}%"></span>
              <span class="session-stack__seg session-stack__seg--live" style="width:${scheduledPct}%"></span>
              <span class="session-stack__seg session-stack__seg--cancel" style="width:${cancelledPct}%"></span>
            </div>
            <ul class="session-stats">
              <li><span class="dot dot--teal"></span>Completed <strong>${completed}</strong></li>
              <li><span class="dot dot--slate"></span>Scheduled <strong>${scheduled}</strong></li>
              <li><span class="dot dot--rose"></span>Cancelled <strong>${cancelled}</strong></li>
            </ul>
          </div>
        </div>
        <div class="session-trend">
          <svg class="session-trend__svg" viewBox="0 0 100 82" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="sessionArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#0F4C4A" stop-opacity="0.22"/>
                <stop offset="100%" stop-color="#0F4C4A" stop-opacity="0.02"/>
              </linearGradient>
            </defs>
            <polygon fill="url(#sessionArea)" points="${area}" />
            <polyline fill="none" stroke="#0F4C4A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${line}" />
            ${pts
              .map(
                ([x, y]) =>
                  `<circle cx="${x}" cy="${y}" r="2.8" fill="#fff" stroke="#0F4C4A" stroke-width="2" />`
              )
              .join('')}
          </svg>
        </div>
      </div>`;
  }

  function renderAttentionFeed(report) {
    const list = $('#attention-list');
    if (!list) return;
    const pending = report.pending_recommendations ?? 0;
    const upcoming = report.sessions_scheduled_upcoming ?? 0;
    const inactive = Math.max(0, (report.children_count ?? 0) - (report.children_active ?? 0));

    const cards = [];
    if (pending > 0) {
      cards.push({
        tag: 'AI Insight',
        tone: 'violet',
        time: 'Needs review',
        title: 'Pending AI recommendations',
        body: `${pending} suggestion${pending === 1 ? '' : 's'} waiting for teacher or Head Doctor review.`,
        meta: 'Requires Review',
        action: 'Review',
        actionSection: 'assessments',
      });
    }
    if (upcoming > 0) {
      cards.push({
        tag: 'Recommendation',
        tone: 'teal',
        time: 'Upcoming',
        title: 'Therapy sessions scheduled',
        body: `${upcoming} session${upcoming === 1 ? '' : 's'} on the calendar from today onward.`,
        meta: 'Schedule',
        action: 'Open',
        actionSection: 'therapy',
      });
    }
    if (inactive > 0) {
      cards.push({
        tag: 'Alert',
        tone: 'rose',
        time: 'Profiles',
        title: 'Inactive child profiles',
        body: `${inactive} child profile${inactive === 1 ? '' : 's'} marked inactive in the registry.`,
        meta: 'Follow up',
        action: 'Resolve',
        actionSection: 'children',
      });
    }
    if (!cards.length) {
      cards.push({
        tag: 'Status',
        tone: 'teal',
        time: 'Now',
        title: 'No urgent attention items',
        body: 'Facility metrics look clear. New assessments and reviews will appear here.',
        meta: 'All clear',
        action: 'Assess',
        actionSection: 'assessments',
      });
    }

    list.innerHTML = cards
      .map(
        (c) => `
      <article class="attention-card attention-card--${c.tone}">
        <div class="attention-card__top">
          <span class="attention-chip attention-chip--${c.tone}">${escapeHtml(c.tag)}</span>
          <span class="attention-card__time">${escapeHtml(c.time)}</span>
        </div>
        <h4>${escapeHtml(c.title)}</h4>
        <p>${escapeHtml(c.body)}</p>
        <div class="attention-card__foot">
          <span>${escapeHtml(c.meta)}</span>
          <button type="button" class="btn btn-sm attention-card__btn" data-goto="${c.actionSection}">${escapeHtml(c.action)}</button>
        </div>
      </article>`
      )
      .join('');

    list.querySelectorAll('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-goto');
        const nav = $(`.nav-link[data-section="${target}"]`);
        if (nav) nav.click();
      });
    });
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

  async function loadOverviewSessions(preloaded = null) {
    const loading = $('#overview-sessions-loading');
    const empty = $('#overview-sessions-empty');
    const wrap = $('#overview-sessions-wrap');
    const tbody = $('#overview-sessions-tbody');
    if (!loading || !tbody) return;

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
          const needsReview = s.status === 'scheduled' && !s.outcomes && !s.observations;
          const typeLabel = s.status === 'completed' ? 'Completed' : needsReview ? 'Review Needed' : 'Therapy';
          return `
            <tr class="${needsReview ? 'row-alert' : ''}">
              <td>${escapeHtml(s.child ? childName(s.child) : `Child #${s.child_id}`)}</td>
              <td>${escapeHtml(formatSessionTime(s.scheduled_at))}</td>
              <td>${escapeHtml(s.teacher?.name || '—')}</td>
              <td>
                <span class="${needsReview ? 'type-alert' : 'type-ok'}">${escapeHtml(typeLabel)}</span>
              </td>
              <td class="row-action">›</td>
            </tr>`;
        })
        .join('');
    } catch {
      loading.hidden = true;
      empty.hidden = false;
      empty.querySelector('p').textContent = 'Could not load therapy sessions.';
    }
  }

  function renderAnalytics(report) {
    const loading = $('#analytics-loading');
    const root = $('#analytics-root');
    const err = $('#analytics-error');
    if (loading) loading.hidden = true;
    if (err) err.hidden = true;
    if (root) root.hidden = false;

    const pending = report.pending_recommendations ?? 0;
    const children = report.children_count ?? 0;
    const activeChildren = report.children_active ?? children;
    const assessments = report.assessments_total ?? 0;
    const upcoming = report.sessions_scheduled_upcoming ?? 0;
    const staff = report.staff_total ?? 0;

    $('#kpi-grid').innerHTML = `
      <article class="kpi">
        <span class="kpi__label">Total Children</span>
        <span class="kpi__value">${children}</span>
        <span class="kpi__meta">${activeChildren} active profiles</span>
      </article>
      <article class="kpi">
        <span class="kpi__label">Active Assessments</span>
        <span class="kpi__value">${assessments}</span>
        <span class="kpi__meta">${report.checklists_total ?? 0} checklists in use</span>
      </article>
      <article class="kpi kpi--action">
        <div class="kpi__top">
          <span class="kpi__label">Pending AI Reviews</span>
          ${pending > 0 ? '<span class="kpi__badge">Action Req</span>' : ''}
        </div>
        <span class="kpi__value">${pending}</span>
        <span class="kpi__meta">Human review required</span>
      </article>
      <article class="kpi">
        <span class="kpi__label">Therapy Sessions</span>
        <span class="kpi__value">${upcoming}</span>
        <span class="kpi__meta">${report.sessions_completed_this_month ?? 0} completed this month</span>
      </article>
      <article class="kpi">
        <span class="kpi__label">Staff Active</span>
        <span class="kpi__value">${staff}</span>
        <span class="kpi__meta">Across all roles</span>
      </article>`;

    renderDonutChart($('#chart-roles'), report.users_by_role || {});
    renderVerticalBars($('#chart-recs'), report.recommendations_by_status || {});
    renderSessionSpark($('#chart-sessions'), report.sessions_by_status || {});
    renderAttentionFeed(report);
    loadOverviewSessions(report.upcoming_sessions || null);
  }

  function initOverviewActions() {
    const exportBtn = $('#export-report-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const nav = $('.nav-link[data-section="reports"]');
        if (nav) nav.click();
      });
    }
    const viewSessions = $('#overview-view-sessions');
    if (viewSessions) {
      viewSessions.addEventListener('click', () => {
        const nav = $('.nav-link[data-section="therapy"]');
        if (nav) nav.click();
      });
    }
  }

  async function loadAnalytics() {
    const loading = $('#analytics-loading');
    const err = $('#analytics-error');
    const root = $('#analytics-root');
    try {
      const report = await SmartCareAPI.get('/reports/overview');
      renderAnalytics(report);
      window.__facilityReport = report;
      syncFacilityReportPanel(report);
    } catch (e) {
      if (loading) loading.hidden = true;
      if (root) root.hidden = true;
      if (err) {
        err.hidden = false;
        err.textContent = e.message || 'Could not load analytics.';
      }
    }
  }

  function syncFacilityReportPanel(report) {
    const loading = $('#facility-report-loading');
    const content = $('#facility-report-content');
    if (!loading || !content) return;
    loading.hidden = true;
    content.hidden = false;

    $('#facility-stats').innerHTML = `
      <div class="stat-card">
        <span class="stat-value">${report.children_count}</span>
        <span class="stat-label">Children</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${report.pending_recommendations}</span>
        <span class="stat-label">Pending recs</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${report.sessions_completed_this_month}</span>
        <span class="stat-label">Sessions this month</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${report.assessments_total ?? 0}</span>
        <span class="stat-label">Assessments</span>
      </div>`;

    const roles = report.users_by_role || {};
    $('#facility-roles-tbody').innerHTML = Object.entries(roles)
      .map(
        ([role, count]) => `
        <tr>
          <td>${escapeHtml(formatRole(role))}</td>
          <td>${count}</td>
        </tr>`
      )
      .join('');
  }

  /* Children */
  let childrenPage = 1;
  const CHILDREN_PAGE_SIZE = 8;
  let childrenFiltered = [];

  function patientId(child) {
    return `PT-${String(child.id).padStart(4, '0')}`;
  }

  function ageBandLabel(age) {
    const n = Number(age);
    if (Number.isNaN(n) || age == null || age === '') return '—';
    if (n <= 3) return '0-3';
    if (n <= 6) return '4-6';
    if (n <= 12) return '7-12';
    return '13-18';
  }

  function ageBandValueFromLabel(label) {
    const map = { '0-3': 2, '4-6': 5, '7-12': 9, '13-18': 15 };
    return map[label] ?? '';
  }

  function parseCaretakerFromNotes(notes) {
    if (!notes) return null;
    const match = String(notes).match(/^Primary caretaker:\s*(.+?)(?:\s*\(([^)]+)\))?\s*(?:\n|$)/i);
    if (!match) return null;
    return { name: match[1].trim(), relation: (match[2] || '').trim() };
  }

  function stripCaretakerFromNotes(notes) {
    if (!notes) return '';
    return String(notes).replace(/^Primary caretaker:.*?(?:\n|$)/i, '').trim();
  }

  function buildConditionNotes(caretakerName, caretakerRelation, notes) {
    const cleanNotes = (notes || '').trim();
    if (!caretakerName) return cleanNotes || null;
    const rel = caretakerRelation ? ` (${caretakerRelation})` : '';
    const line = `Primary caretaker: ${caretakerName}${rel}`;
    return cleanNotes ? `${line}\n${cleanNotes}` : line;
  }

  function primaryCaretaker(child) {
    const users = child.users || [];
    const preferred = users.find((u) => {
      const rel = String(u.pivot?.relation || u.role || '').toLowerCase();
      return ['caretaker', 'parent', 'mother', 'father', 'guardian'].includes(rel);
    }) || users[0];
    if (preferred) {
      const rel = preferred.pivot?.relation || preferred.role || '';
      return rel ? `${preferred.name} (${formatRole(rel)})` : preferred.name;
    }
    const parsed = parseCaretakerFromNotes(child.condition_notes);
    if (parsed) {
      return parsed.relation ? `${parsed.name} (${parsed.relation})` : parsed.name;
    }
    return '—';
  }

  function diagnosisNeedsAttention(diagnosis) {
    const d = String(diagnosis || '').toLowerCase();
    return d.includes('level 3') || d.includes('severe');
  }

  function getChildrenFilters() {
    return {
      query: ($('#children-search')?.value || '').trim().toLowerCase(),
      diagnosis: $('#children-filter-diagnosis')?.value || '',
      age: $('#children-filter-age')?.value || '',
    };
  }

  function filterChildrenList() {
    const { query, diagnosis, age } = getChildrenFilters();
    return childrenCache.filter((c) => {
      const pid = patientId(c).toLowerCase();
      const name = childName(c).toLowerCase();
      const diag = (c.diagnosis || '').toLowerCase();
      const matchQuery = !query || name.includes(query) || pid.includes(query) || diag.includes(query) || String(c.id).includes(query);
      const matchDiag = !diagnosis || (c.diagnosis || '') === diagnosis;
      const matchAge = !age || ageBandLabel(c.age_band) === age;
      return matchQuery && matchDiag && matchAge;
    });
  }

  function refreshDiagnosisFilterOptions() {
    const select = $('#children-filter-diagnosis');
    if (!select) return;
    const current = select.value;
    const diagnoses = [...new Set(childrenCache.map((c) => c.diagnosis).filter(Boolean))].sort();
    select.innerHTML = `<option value="">All Diagnoses</option>${diagnoses
      .map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`)
      .join('')}`;
    if (current && diagnoses.includes(current)) select.value = current;
  }

  function renderChildrenTable() {
    const empty = $('#children-empty');
    const wrap = $('#children-table-wrap');
    const tbody = $('#children-tbody');
    const pageInfo = $('#children-page-info');
    const prevBtn = $('#children-page-prev');
    const nextBtn = $('#children-page-next');

    childrenFiltered = filterChildrenList();
    const total = childrenFiltered.length;
    const pages = Math.max(1, Math.ceil(total / CHILDREN_PAGE_SIZE));
    if (childrenPage > pages) childrenPage = pages;
    if (childrenPage < 1) childrenPage = 1;

    if (!childrenCache.length) {
      empty.hidden = false;
      wrap.hidden = true;
      if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 records';
      return;
    }

    empty.hidden = true;
    wrap.hidden = false;

    if (!total) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="form-hint" style="text-align:center;padding:2rem">No children match your filters.</td>
        </tr>`;
      if (pageInfo) pageInfo.textContent = `Showing 0 of ${childrenCache.length} records`;
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const start = (childrenPage - 1) * CHILDREN_PAGE_SIZE;
    const pageItems = childrenFiltered.slice(start, start + CHILDREN_PAGE_SIZE);
    const showingFrom = start + 1;
    const showingTo = start + pageItems.length;

    tbody.innerHTML = pageItems
      .map((c) => {
        const active = c.is_active !== false;
        const warn = diagnosisNeedsAttention(c.diagnosis);
        return `
        <tr>
          <td class="mono-id">${escapeHtml(patientId(c))}</td>
          <td><strong>${escapeHtml(childName(c))}</strong></td>
          <td>
            <span class="diag-cell${warn ? ' diag-cell--warn' : ''}">
              ${warn ? '<span class="diag-warn" aria-hidden="true">⚠</span>' : ''}
              ${escapeHtml(c.diagnosis || '—')}
            </span>
          </td>
          <td>${escapeHtml(ageBandLabel(c.age_band))}</td>
          <td>${escapeHtml(primaryCaretaker(c))}</td>
          <td><span class="status-pill ${active ? 'status-pill--active' : 'status-pill--inactive'}">${active ? 'Active' : 'Inactive'}</span></td>
          <td>
            <div class="row-actions">
              <button type="button" class="icon-btn icon-btn--sm" data-profile-child="${c.id}" title="Open profile" aria-label="Open profile for ${escapeHtml(childName(c))}">
                <img src="https://api.iconify.design/lucide/eye.svg?color=%235C6775" alt="" width="16" height="16">
              </button>
              <button type="button" class="icon-btn icon-btn--sm" data-edit-child="${c.id}" title="Edit" aria-label="Edit ${escapeHtml(childName(c))}" ${canManageChildren() ? '' : 'disabled'}>
                <img src="https://api.iconify.design/lucide/pencil.svg?color=%235C6775" alt="" width="16" height="16">
              </button>
            </div>
          </td>
        </tr>`;
      })
      .join('');

    if (pageInfo) {
      pageInfo.textContent = `Showing ${showingFrom}–${showingTo} of ${total} record${total === 1 ? '' : 's'}`;
    }
    if (prevBtn) prevBtn.disabled = childrenPage <= 1;
    if (nextBtn) nextBtn.disabled = childrenPage >= pages;

    tbody.querySelectorAll('[data-profile-child]').forEach((btn) => {
      btn.addEventListener('click', () => openChildProfile(Number(btn.getAttribute('data-profile-child'))));
    });
    tbody.querySelectorAll('[data-edit-child]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!canManageChildren()) return;
        openChildModal(Number(btn.getAttribute('data-edit-child')), 'edit');
      });
    });
  }

  function resetChildForm() {
    const form = $('#create-child-form');
    if (form) form.reset();
    $('#child-edit-id').value = '';
    $('#child-is-active').checked = true;
    $('#child-diagnosis-other-wrap').hidden = true;
    $('#child-diagnosis-other').value = '';
    $('#modal-child-title').textContent = 'Register Child';
    $('#modal-child-subtitle').textContent = 'Add a patient profile to the facility registry.';
    $('#child-submit-btn').textContent = 'Register Child';
    $('#child-submit-btn').hidden = false;
    const headerIcon = document.querySelector('#modal-child .modal__header-icon img');
    if (headerIcon) {
      headerIcon.src = 'https://api.iconify.design/lucide/user-plus.svg?color=%230F3D30';
    }
    form?.querySelectorAll('input, select, textarea, button[type=submit]').forEach((el) => {
      if (el.id === 'child-submit-btn') return;
      el.disabled = false;
    });
    hideAlert($('#create-child-alert'));
  }

  function openChildModal(childId, mode) {
    const child = childrenCache.find((c) => c.id === childId);
    if (!child) return;
    resetChildForm();

    const isView = mode === 'view';
    $('#modal-child-title').textContent = isView ? 'View Child' : 'Edit Child';
    $('#modal-child-subtitle').textContent = isView
      ? `${patientId(child)} · read-only profile`
      : `Update profile for ${patientId(child)}.`;
    $('#child-submit-btn').textContent = 'Save changes';
    $('#child-submit-btn').hidden = isView;
    const headerIcon = document.querySelector('#modal-child .modal__header-icon img');
    if (headerIcon) {
      headerIcon.src = isView
        ? 'https://api.iconify.design/lucide/user-round.svg?color=%230F3D30'
        : 'https://api.iconify.design/lucide/pencil.svg?color=%230F3D30';
    }
    $('#child-edit-id').value = String(child.id);

    $('#child-first-name').value = child.first_name || '';
    $('#child-last-name').value = child.last_name || '';
    $('#child-birth-date').value = child.birth_date ? String(child.birth_date).slice(0, 10) : '';
    $('#child-sex').value = child.sex || '';
    $('#child-age-band').value = String(ageBandValueFromLabel(ageBandLabel(child.age_band)) || child.age_band || '');
    $('#child-is-active').checked = child.is_active !== false;

    const known = [
      'ASD Level 1', 'ASD Level 2', 'ASD Level 3', 'ADHD', 'SPD',
      'Speech Delay', 'Global Developmental Delay',
    ];
    if (child.diagnosis && known.includes(child.diagnosis)) {
      $('#child-diagnosis').value = child.diagnosis;
    } else if (child.diagnosis) {
      $('#child-diagnosis').value = 'Other';
      $('#child-diagnosis-other-wrap').hidden = false;
      $('#child-diagnosis-other').value = child.diagnosis;
    }

    const parsed = parseCaretakerFromNotes(child.condition_notes);
    if (parsed) {
      $('#child-caretaker-name').value = parsed.name;
      $('#child-caretaker-relation').value = parsed.relation || '';
    } else {
      const users = child.users || [];
      const preferred = users.find((u) => u.pivot?.relation) || users[0];
      if (preferred) {
        $('#child-caretaker-name').value = preferred.name || '';
        $('#child-caretaker-relation').value = preferred.pivot?.relation || '';
      }
    }
    $('#child-notes').value = stripCaretakerFromNotes(child.condition_notes || '');

    if (isView) {
      $('#create-child-form')
        .querySelectorAll('input, select, textarea')
        .forEach((el) => {
          el.disabled = true;
        });
    }

    openModal('modal-child');
  }

  async function loadChildren() {
    const loading = $('#children-loading');

    try {
      childrenCache = await SmartCareAPI.get('/children');
      if (!Array.isArray(childrenCache)) childrenCache = childrenCache.data || [];
    } catch (err) {
      loading.textContent = `Could not load children: ${err.message}`;
      return;
    }

    loading.hidden = true;
    refreshDiagnosisFilterOptions();
    populateChildSelects();
    updateAssessSummaryCounts();
    childrenPage = 1;
    renderChildrenTable();
  }

  function initChildrenSearch() {
    const apply = () => {
      childrenPage = 1;
      renderChildrenTable();
    };
    $('#children-search')?.addEventListener('input', apply);
    $('#children-filter-diagnosis')?.addEventListener('change', apply);
    $('#children-filter-age')?.addEventListener('change', apply);
    $('#children-filter-clear')?.addEventListener('click', () => {
      if ($('#children-search')) $('#children-search').value = '';
      if ($('#children-filter-diagnosis')) $('#children-filter-diagnosis').value = '';
      if ($('#children-filter-age')) $('#children-filter-age').value = '';
      apply();
    });
    $('#children-page-prev')?.addEventListener('click', () => {
      childrenPage -= 1;
      renderChildrenTable();
    });
    $('#children-page-next')?.addEventListener('click', () => {
      childrenPage += 1;
      renderChildrenTable();
    });
    $('#child-diagnosis')?.addEventListener('change', () => {
      const other = $('#child-diagnosis').value === 'Other';
      $('#child-diagnosis-other-wrap').hidden = !other;
    });
    $('#open-child-modal')?.addEventListener('click', () => {
      if (!canManageChildren()) return;
      resetChildForm();
    });
    $('#empty-open-child')?.addEventListener('click', () => {
      if (!canManageChildren()) return;
      resetChildForm();
    });
  }

  function populateChildSelects() {
    const options = childrenCache
      .map((c) => `<option value="${c.id}">${escapeHtml(childName(c))}</option>`)
      .join('');

    ['#assessment-child', '#report-child'].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      const current = el.value;
      el.innerHTML = `<option value="">${sel === '#report-child' ? 'Choose a child…' : 'Select a child…'}</option>${options}`;
      if (current) el.value = current;
    });
  }

  function resolveDiagnosisValue() {
    const selected = $('#child-diagnosis').value;
    if (selected === 'Other') return $('#child-diagnosis-other').value.trim() || null;
    return selected || null;
  }

  function initCreateChild() {
    $('#create-child-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canManageChildren()) return;

      const alertEl = $('#create-child-alert');
      hideAlert(alertEl);

      const editId = $('#child-edit-id').value;
      const payload = {
        first_name: $('#child-first-name').value.trim(),
        last_name: $('#child-last-name').value.trim(),
        birth_date: $('#child-birth-date').value || null,
        sex: $('#child-sex').value || null,
        age_band: $('#child-age-band').value ? parseInt($('#child-age-band').value, 10) : null,
        diagnosis: resolveDiagnosisValue(),
        condition_notes: buildConditionNotes(
          $('#child-caretaker-name').value.trim(),
          $('#child-caretaker-relation').value.trim(),
          $('#child-notes').value.trim()
        ),
        is_active: $('#child-is-active').checked,
      };

      try {
        if (editId) {
          await SmartCareAPI.put(`/children/${editId}`, payload);
          showAlert(alertEl, 'Child updated successfully.', 'success');
        } else {
          await SmartCareAPI.post('/children', payload);
          showAlert(alertEl, 'Child registered successfully.', 'success');
        }
        e.target.reset();
        resetChildForm();
        await loadChildren();
        closeModal('modal-child');
        hideAlert(alertEl);
      } catch (err) {
        showAlert(alertEl, err.message, 'error');
      }
    });
  }

  /* Checklists */
  const CHECKLIST_CATEGORIES = ['Motor Skills', 'Social', 'Cognitive', 'Behavioral'];

  function parseChecklistCategory(cl) {
    const desc = cl.description || '';
    const match = desc.match(/^Category:\s*(.+?)\s*(?:\n|$)/i);
    if (match) return match[1].trim();
    const domains = (cl.items || []).map((i) => i.domain).filter(Boolean);
    if (!domains.length) return 'General';
    const counts = {};
    domains.forEach((d) => {
      counts[d] = (counts[d] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  function stripChecklistCategory(desc) {
    if (!desc) return '';
    return String(desc).replace(/^Category:.*?(?:\n|$)/i, '').trim();
  }

  function buildChecklistDescription(category, description, meta = {}) {
    const lines = [];
    if (category) lines.push(`Category: ${category}`);
    if (meta.age_band) lines.push(`Age focus: ${meta.age_band}`);
    if (meta.diagnosis_focus) lines.push(`Diagnosis focus: ${meta.diagnosis_focus}`);
    if (meta.purpose) lines.push(`Purpose: ${meta.purpose}`);
    if (meta.scoring_guide) lines.push(`Scoring guide: ${meta.scoring_guide}`);
    const clean = (description || '').trim();
    if (clean) {
      if (lines.length) lines.push('---');
      lines.push(clean);
    }
    return lines.length ? lines.join('\n') : null;
  }

  function checklistDateLabel(cl) {
    const raw = cl.updated_at || cl.created_at;
    if (!raw) return '—';
    try {
      return new Date(raw).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  }

  function filterChecklists() {
    const q = ($('#checklists-search')?.value || '').trim().toLowerCase();
    const category = $('#checklists-filter-category')?.value || '';
    return checklistsCache.filter((cl) => {
      const title = (cl.title || '').toLowerCase();
      const desc = stripChecklistCategory(cl.description || '').toLowerCase();
      const cat = parseChecklistCategory(cl);
      const matchQ = !q || title.includes(q) || desc.includes(q);
      const matchCat = !category || cat.toLowerCase() === category.toLowerCase();
      return matchQ && matchCat;
    });
  }

  function renderChecklistsLibrary() {
    const empty = $('#checklists-empty');
    const list = $('#checklists-list');
    const filtered = filterChecklists();

    if (!checklistsCache.length) {
      empty.hidden = false;
      list.hidden = true;
      return;
    }

    empty.hidden = true;
    list.hidden = false;

    if (!filtered.length) {
      list.innerHTML = `<p class="form-hint" style="padding:1.5rem;text-align:center">No checklists match your search.</p>`;
      return;
    }

    list.innerHTML = filtered
      .map((cl) => {
        const itemCount = cl.items_count ?? (cl.items ? cl.items.length : 0);
        const category = parseChecklistCategory(cl);
        const desc = stripChecklistCategory(cl.description || '') || 'No description provided.';
        const isAi = /ai[- ]?generated/i.test(desc) || /ai[- ]?generated/i.test(cl.title || '');
        const active = cl.is_active !== false;
        return `
        <article class="checklist-card${isAi ? ' checklist-card--ai' : ''}" data-checklist-id="${cl.id}">
          <div class="checklist-card__top">
            <div class="checklist-card__tags">
              <span class="cat-pill">${escapeHtml(category)}</span>
              ${isAi ? '<span class="ai-pill" title="AI-assisted">✦</span>' : ''}
            </div>
            <div class="checklist-card__menu-wrap">
              <button type="button" class="icon-btn checklist-card__menu" aria-label="Checklist options" aria-expanded="false" data-checklist-menu="${cl.id}">
                <img src="https://api.iconify.design/lucide/ellipsis-vertical.svg?color=%235C6775" alt="" width="18" height="18">
              </button>
              <div class="checklist-menu" id="checklist-menu-${cl.id}" hidden>
                <button type="button" data-checklist-action="view" data-id="${cl.id}">View details</button>
                <button type="button" data-checklist-action="use" data-id="${cl.id}">Use in assessment</button>
                ${
                  canCreateChecklists()
                    ? `<button type="button" data-checklist-action="toggle" data-id="${cl.id}">${active ? 'Deactivate' : 'Activate'}</button>
                       <button type="button" class="is-danger" data-checklist-action="delete" data-id="${cl.id}">Delete</button>`
                    : ''
                }
              </div>
            </div>
          </div>
          <h4 class="checklist-card__title">${escapeHtml(cl.title)}</h4>
          <p class="checklist-card__desc">${escapeHtml(desc)}</p>
          <div class="checklist-card__foot">
            <span>
              <img src="https://api.iconify.design/lucide/list.svg?color=%235C6775" alt="" width="14" height="14">
              ${itemCount} Item${itemCount === 1 ? '' : 's'}
            </span>
            <span class="${isAi ? 'checklist-card__ai-label' : ''}">
              ${
                isAi
                  ? 'AI-GENERATED DRAFT'
                  : `<img src="https://api.iconify.design/lucide/clock.svg?color=%235C6775" alt="" width="14" height="14"> ${escapeHtml(checklistDateLabel(cl))}`
              }
            </span>
          </div>
        </article>`;
      })
      .join('');

    bindChecklistMenus();
  }

  function closeAllChecklistMenus() {
    $$('.checklist-menu').forEach((menu) => {
      menu.classList.remove('is-open');
      menu.hidden = true;
    });
    $$('.checklist-card__menu').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
  }

  async function openChecklistView(id) {
    let cl = checklistsCache.find((c) => String(c.id) === String(id));
    if (!cl) return;

    if (!Array.isArray(cl.items) || !cl.items.length) {
      try {
        const full = await SmartCareAPI.get(`/checklists/${id}`);
        cl = { ...cl, ...full };
        checklistsCache = checklistsCache.map((c) => (String(c.id) === String(id) ? cl : c));
      } catch {
        /* keep summary-only view */
      }
    }

    const category = parseChecklistCategory(cl);
    const desc = stripChecklistCategory(cl.description || '') || 'No description provided.';
    const items = cl.items || [];

    $('#modal-checklist-view-title').textContent = cl.title || 'Checklist details';
    $('#modal-checklist-view-meta').textContent = `${category} · ${items.length || cl.items_count || 0} item${(items.length || cl.items_count || 0) === 1 ? '' : 's'}`;
    $('#modal-checklist-view-desc').textContent = desc;
    $('#modal-checklist-view-items').innerHTML = items.length
      ? items
          .map(
            (item) => `
          <li>
            ${escapeHtml(item.prompt || 'Untitled prompt')}
            ${item.domain ? `<small>${escapeHtml(item.domain)}</small>` : ''}
          </li>`
          )
          .join('')
      : '<li class="form-hint">No items in this checklist.</li>';

    const useBtn = $('#checklist-view-use-btn');
    if (useBtn) {
      useBtn.onclick = () => {
        closeModal('modal-checklist-view');
        useChecklistInAssessment(id);
      };
    }
    openModal('modal-checklist-view');
  }

  function useChecklistInAssessment(id) {
    const nav = $('.nav-link[data-section="assessments"]');
    if (nav) nav.click();
    const select = $('#assessment-checklist');
    if (select) {
      select.value = String(id);
      select.dispatchEvent(new Event('change'));
    }
    if (canSubmitAssessments()) openModal('modal-assessment');
  }

  async function toggleChecklistActive(id) {
    if (!canCreateChecklists()) return;
    const cl = checklistsCache.find((c) => String(c.id) === String(id));
    if (!cl) return;
    try {
      await SmartCareAPI.put(`/checklists/${id}`, { is_active: !(cl.is_active !== false) });
      await loadChecklists();
    } catch (err) {
      window.alert(err.message || 'Could not update checklist.');
    }
  }

  async function deleteChecklist(id) {
    if (!canCreateChecklists()) return;
    const cl = checklistsCache.find((c) => String(c.id) === String(id));
    if (!cl) return;
    if (!window.confirm(`Delete checklist "${cl.title}"? This cannot be undone.`)) return;
    try {
      await SmartCareAPI.delete(`/checklists/${id}`);
      await loadChecklists();
    } catch (err) {
      window.alert(err.message || 'Could not delete checklist.');
    }
  }

  function bindChecklistMenus() {
    $$('[data-checklist-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-checklist-menu');
        const menu = $(`#checklist-menu-${id}`);
        const wasOpen = menu?.classList.contains('is-open');
        closeAllChecklistMenus();
        if (!wasOpen && menu) {
          menu.hidden = false;
          menu.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    $$('[data-checklist-action]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-checklist-action');
        const id = btn.getAttribute('data-id');
        closeAllChecklistMenus();
        if (action === 'view') openChecklistView(id);
        if (action === 'use') useChecklistInAssessment(id);
        if (action === 'toggle') await toggleChecklistActive(id);
        if (action === 'delete') await deleteChecklist(id);
      });
    });
  }

  function initChecklistMenuDismiss() {
    document.addEventListener('click', () => closeAllChecklistMenus());
  }

  async function loadChecklists() {
    const loading = $('#checklists-loading');
    const empty = $('#checklists-empty');
    const list = $('#checklists-list');

    if (!canManageChildren() && !canCreateChecklists()) {
      loading.textContent = 'Checklists require Head Doctor or Psychometrician access.';
      return;
    }

    try {
      checklistsCache = await SmartCareAPI.get('/checklists');
      if (!Array.isArray(checklistsCache)) checklistsCache = checklistsCache.data || [];
    } catch (err) {
      loading.textContent = `Could not load checklists: ${err.message}`;
      return;
    }

    loading.hidden = true;
    populateChecklistSelect();
    updateAssessSummaryCounts();
    renderChecklistsLibrary();
  }

  function initChecklistFilters() {
    const apply = () => renderChecklistsLibrary();
    $('#checklists-search')?.addEventListener('input', apply);
    $('#checklists-filter-category')?.addEventListener('change', apply);
  }

  function updateAssessSummaryCounts() {
    const childrenCount = $('#assess-children-count');
    const checklistsCount = $('#assess-checklists-count');
    if (childrenCount) childrenCount.textContent = String(childrenCache.length);
    if (checklistsCount) {
      const active = checklistsCache.filter((c) => c.is_active !== false).length;
      checklistsCount.textContent = String(active);
    }
  }

  function populateChecklistSelect() {
    const el = $('#assessment-checklist');
    if (!el) return;
    const current = el.value;
    el.innerHTML =
      '<option value="">Select a checklist…</option>' +
      checklistsCache
        .filter((c) => c.is_active !== false)
        .map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`)
        .join('');
    if (current) el.value = current;
  }

  function autoResizeTextarea(el) {
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 64)}px`;
  }

  function autoResizeTextareas(root = document) {
    root.querySelectorAll('textarea.item-prompt, textarea.item-hint, #checklist-purpose, #checklist-description').forEach(autoResizeTextarea);
  }

  function checklistItemRowHtml(item = {}, index = 0) {
    const prompt = escapeHtml(item.prompt || '');
    const domain = escapeHtml(item.domain || '');
    const hint = escapeHtml(item.scoring_hint || '');
    const n = index + 1;
    return `
      <div class="checklist-item-row__head">
        <span class="checklist-item-row__index">Item ${n}</span>
        <button type="button" class="btn btn-secondary remove-item-btn" aria-label="Remove item ${n}">Remove</button>
      </div>
      <div class="form-group checklist-item-row__prompt">
        <label>Observation prompt <span class="req-mark" aria-hidden="true">*</span></label>
        <textarea class="item-prompt field-control field-control--autosize" required maxlength="255" rows="2" placeholder="Observable behavior or skill the scorer can rate 0–3">${prompt}</textarea>
        <p class="field-error" hidden></p>
      </div>
      <div class="checklist-item-row__meta">
        <div class="form-group">
          <label>Domain</label>
          <input type="text" class="item-domain field-control" list="checklist-domain-options" maxlength="255" placeholder="e.g. Fine Motor Skills" value="${domain}">
        </div>
        <div class="form-group">
          <label>Scoring hint</label>
          <textarea class="item-hint field-control field-control--autosize" rows="2" maxlength="400" placeholder="Optional 0–3 cues for scorers (review aid; refine into the prompt if needed)">${hint}</textarea>
        </div>
      </div>`;
  }

  function initChecklistBuilder() {
    const form = $('#create-checklist-form');
    const container = $('#checklist-items-container');
    const addBtn = $('#add-checklist-item-btn');
    if (!form || !container || !addBtn) return;

    let checklistStep = 1;
    let hasDraft = false;
    let lastScoringGuide = '0 not observed · 1 emerging · 2 developing · 3 consistent';

    function clearFieldError(el) {
      if (!el) return;
      el.classList.remove('is-invalid');
      el.removeAttribute('aria-invalid');
      const group = el.closest('.form-group');
      const err = group?.querySelector('.field-error');
      if (err) {
        err.hidden = true;
        err.textContent = '';
      }
    }

    function setFieldError(el, message) {
      if (!el) return;
      el.classList.add('is-invalid');
      el.setAttribute('aria-invalid', 'true');
      const group = el.closest('.form-group');
      let err = group?.querySelector('.field-error');
      if (!err && group) {
        err = document.createElement('p');
        err.className = 'field-error';
        group.appendChild(err);
      }
      if (err) {
        err.hidden = false;
        err.textContent = message;
      }
    }

    function clearAllFieldErrors() {
      form.querySelectorAll('.is-invalid').forEach((el) => clearFieldError(el));
      container.querySelectorAll('.checklist-item-row.is-invalid-row').forEach((row) => {
        row.classList.remove('is-invalid-row');
      });
    }

    function setChecklistStep(step) {
      checklistStep = step;
      $$('#checklist-wizard-steps li').forEach((li) => {
        const n = Number(li.dataset.step);
        li.classList.toggle('is-active', n === step);
        li.classList.toggle('is-done', n < step);
      });
      $$('#create-checklist-form .wizard-pane').forEach((pane) => {
        const n = Number(pane.dataset.pane);
        const active = n === step;
        pane.classList.toggle('is-active', active);
        pane.hidden = !active;
      });
      hideAlert($('#create-checklist-alert'));
      if (step === 2) renderAiSummary();
      if (step === 3) {
        requestAnimationFrame(() => autoResizeTextareas(container));
      }
      if (step === 4) renderPublishPreview();
    }

    function collectDefineFields() {
      return {
        title: ($('#checklist-title')?.value || '').trim(),
        category: $('#checklist-category')?.value || '',
        age_band: $('#checklist-age-band')?.value || '',
        diagnosis_focus: $('#checklist-diagnosis')?.value || '',
        purpose: ($('#checklist-purpose')?.value || '').trim(),
        description: ($('#checklist-description')?.value || '').trim(),
        item_count: Number($('#checklist-item-count')?.value || 8),
      };
    }

    function validateDefine() {
      const alertEl = $('#create-checklist-alert');
      clearAllFieldErrors();
      const data = collectDefineFields();
      let firstInvalid = null;

      if (!data.title) {
        setFieldError($('#checklist-title'), 'Title is required.');
        firstInvalid = firstInvalid || $('#checklist-title');
      }
      if (!data.category) {
        setFieldError($('#checklist-category'), 'Category is required.');
        firstInvalid = firstInvalid || $('#checklist-category');
      }
      if (!data.purpose) {
        setFieldError($('#checklist-purpose'), 'Clinical purpose is required.');
        firstInvalid = firstInvalid || $('#checklist-purpose');
      }

      if (firstInvalid) {
        showAlert(alertEl, 'Please fill in all required fields before continuing.', 'error');
        setChecklistStep(1);
        firstInvalid.focus();
        return null;
      }
      return data;
    }

    function validateItems(category) {
      const alertEl = $('#create-checklist-alert');
      let firstInvalid = null;
      let emptyCount = 0;
      const items = [];

      container.querySelectorAll('.checklist-item-row').forEach((row, index) => {
        row.classList.remove('is-invalid-row');
        const promptEl = row.querySelector('.item-prompt');
        const domainEl = row.querySelector('.item-domain');
        const hintEl = row.querySelector('.item-hint');
        clearFieldError(promptEl);

        const prompt = (promptEl?.value || '').trim();
        const domain = (domainEl?.value || '').trim() || category;
        const hint = (hintEl?.value || '').trim();

        if (!prompt) {
          emptyCount += 1;
          setFieldError(promptEl, 'Observation prompt is required.');
          row.classList.add('is-invalid-row');
          firstInvalid = firstInvalid || promptEl;
        } else {
          items.push({
            prompt: prompt.slice(0, 255),
            domain,
            scoring_hint: hint,
            sort_order: index,
          });
        }
      });

      if (emptyCount || !items.length) {
        showAlert(
          alertEl,
          emptyCount
            ? `${emptyCount} item${emptyCount === 1 ? '' : 's'} missing an observation prompt.`
            : 'Add at least one checklist item with an observation prompt.',
          'error'
        );
        setChecklistStep(3);
        firstInvalid?.focus();
        return null;
      }
      return items;
    }

    function renderAiSummary() {
      const data = collectDefineFields();
      const el = $('#checklist-ai-summary');
      if (!el) return;
      const rows = [
        ['Title', data.title || '—'],
        ['Category', data.category || '—'],
        ['Age focus', data.age_band || 'All ages'],
        ['Diagnosis focus', data.diagnosis_focus || 'General / mixed'],
        ['Item count', String(data.item_count || 8)],
        ['Purpose', data.purpose || '—'],
      ];
      el.innerHTML = rows
        .map(([k, v]) => `<li><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></li>`)
        .join('');
    }

    function renumberItems() {
      container.querySelectorAll('.checklist-item-row').forEach((row, index) => {
        row.dataset.index = String(index);
        const label = row.querySelector('.checklist-item-row__index');
        if (label) label.textContent = `Item ${index + 1}`;
        const btn = row.querySelector('.remove-item-btn');
        if (btn) btn.setAttribute('aria-label', `Remove item ${index + 1}`);
      });
    }

    function updateRemoveButtons() {
      const rows = container.querySelectorAll('.checklist-item-row');
      rows.forEach((row) => {
        const btn = row.querySelector('.remove-item-btn');
        if (btn) btn.hidden = rows.length <= 1;
      });
      renumberItems();
    }

    function setItems(items) {
      const list = items?.length ? items : [{}];
      container.innerHTML = '';
      list.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'checklist-item-row checklist-item-row--rich';
        row.dataset.index = String(index);
        row.innerHTML = checklistItemRowHtml(item, index);
        container.appendChild(row);
      });
      updateRemoveButtons();
      autoResizeTextareas(container);
      hasDraft = true;
      const reviewBtn = $('#checklist-step-to-review');
      if (reviewBtn) reviewBtn.disabled = false;
    }

    function collectItems(category) {
      return Array.from(container.querySelectorAll('.checklist-item-row')).map((row, index) => {
        const prompt = row.querySelector('.item-prompt')?.value.trim() || '';
        const hint = row.querySelector('.item-hint')?.value.trim() || '';
        const domain = row.querySelector('.item-domain')?.value.trim() || category;
        // Keep prompt readable in assessments; fold a short hint only when space remains.
        let savedPrompt = prompt.slice(0, 255);
        if (hint && savedPrompt.length < 200) {
          const suffix = ` [Hint: ${hint}]`;
          const room = 255 - savedPrompt.length;
          if (room > 12) savedPrompt = (savedPrompt + suffix.slice(0, room)).trim();
        }
        return {
          prompt: savedPrompt,
          domain,
          sort_order: index,
        };
      });
    }

    function renderPublishPreview() {
      const data = collectDefineFields();
      const raw = Array.from(container.querySelectorAll('.checklist-item-row')).map((row) => ({
        prompt: row.querySelector('.item-prompt')?.value.trim() || '',
        domain: row.querySelector('.item-domain')?.value.trim() || data.category,
        hint: row.querySelector('.item-hint')?.value.trim() || '',
      })).filter((i) => i.prompt);
      const el = $('#checklist-publish-preview');
      if (!el) return;
      const statusLabel = $('#checklist-is-active')?.checked ? 'Active' : 'Inactive';
      el.innerHTML = `
        <section class="publish-section" aria-labelledby="publish-summary-title">
          <h5 id="publish-summary-title" class="publish-section__title">Checklist summary</h5>
          <div class="publish-summary">
            <div class="publish-summary__card">
              <span class="publish-summary__label">Title</span>
              <strong class="publish-summary__value">${escapeHtml(data.title || '—')}</strong>
            </div>
            <div class="publish-summary__card">
              <span class="publish-summary__label">Category</span>
              <strong class="publish-summary__value">${escapeHtml(data.category || '—')}</strong>
            </div>
            <div class="publish-summary__card">
              <span class="publish-summary__label">Items</span>
              <strong class="publish-summary__value">${raw.length}</strong>
            </div>
            <div class="publish-summary__card">
              <span class="publish-summary__label">Status</span>
              <strong class="publish-summary__value publish-summary__value--status">${escapeHtml(statusLabel)}</strong>
            </div>
          </div>
          ${data.purpose ? `<p class="publish-summary__purpose"><span>Purpose</span>${escapeHtml(data.purpose)}</p>` : ''}
        </section>
        <section class="publish-section" aria-labelledby="publish-items-title">
          <div class="publish-section__head">
            <h5 id="publish-items-title" class="publish-section__title">Items to publish</h5>
            <span class="publish-section__count">${raw.length} item${raw.length === 1 ? '' : 's'}</span>
          </div>
          <ol class="publish-item-list">
            ${raw
              .map(
                (i, idx) => `<li class="publish-item">
                  <div class="publish-item__index">${idx + 1}</div>
                  <div class="publish-item__body">
                    <p class="publish-item__prompt">${escapeHtml(i.prompt)}</p>
                    ${i.domain ? `<span class="publish-item__domain">${escapeHtml(i.domain)}</span>` : ''}
                    ${i.hint ? `<p class="publish-item__hint">${escapeHtml(i.hint)}</p>` : ''}
                  </div>
                </li>`
              )
              .join('')}
          </ol>
        </section>`;
    }

    async function generateAiDraft({ advance = true } = {}) {
      const alertEl = $('#create-checklist-alert');
      const statusEl = $('#checklist-ai-status');
      const data = validateDefine();
      if (!data) return;

      const generateBtn = $('#checklist-generate-ai-btn');
      const regenerateBtn = $('#checklist-regenerate-ai-btn');
      if (generateBtn) generateBtn.disabled = true;
      if (regenerateBtn) regenerateBtn.disabled = true;
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent = 'Generating observation items with AI…';
      }
      hideAlert(alertEl);

      try {
        const draft = await SmartCareAPI.post('/checklists/suggest', {
          title: data.title,
          category: data.category,
          age_band: data.age_band || null,
          diagnosis_focus: data.diagnosis_focus || null,
          purpose: data.purpose || null,
          item_count: data.item_count || 8,
        });

        if (draft.title && !$('#checklist-title').value.trim()) {
          $('#checklist-title').value = draft.title;
        }
        if (draft.description && !$('#checklist-description').value.trim()) {
          $('#checklist-description').value = draft.description;
        }
        if (draft.scoring_guide) {
          lastScoringGuide = draft.scoring_guide;
          const guideEl = $('#checklist-scoring-guide');
          if (guideEl) {
            guideEl.textContent = `Score guide: ${draft.scoring_guide} Use scoring hints as reviewer cues — edit prompts so they stay clear and complete.`;
          }
        }

        setItems(draft.items || []);
        if (statusEl) {
          const source = draft.source === 'openai' ? 'AI' : 'template fallback';
          statusEl.textContent = `Draft ready (${source}). Review every item before publishing.${
            draft.caution ? ` ${draft.caution}` : ''
          }`;
        }
        if (advance) setChecklistStep(3);
      } catch (err) {
        showAlert(alertEl, err.message || 'AI suggestion failed.', 'error');
        if (statusEl) statusEl.textContent = 'AI generation failed. You can skip AI and add items manually.';
      } finally {
        if (generateBtn) generateBtn.disabled = false;
        if (regenerateBtn) regenerateBtn.disabled = false;
      }
    }

    function resetChecklistWizard() {
      form.reset();
      clearAllFieldErrors();
      $('#checklist-item-count').value = '8';
      $('#checklist-scoring').value = '0–3 observation scale';
      $('#checklist-is-active').checked = true;
      $('#checklist-open-assessment').checked = false;
      lastScoringGuide = '0 not observed · 1 emerging · 2 developing · 3 consistent';
      const guideEl = $('#checklist-scoring-guide');
      if (guideEl) {
        guideEl.textContent =
          'Score guide: 0 not observed · 1 emerging · 2 developing · 3 consistent. Use scoring hints as reviewer cues — edit prompts so they stay clear and complete.';
      }
      const statusEl = $('#checklist-ai-status');
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.textContent = '';
      }
      setItems([{}]);
      hasDraft = false;
      const reviewBtn = $('#checklist-step-to-review');
      if (reviewBtn) reviewBtn.disabled = true;
      hideAlert($('#create-checklist-alert'));
      setChecklistStep(1);
    }

    form.addEventListener('input', (e) => {
      if (e.target.matches('textarea.field-control--autosize, textarea.item-prompt, textarea.item-hint, #checklist-purpose, #checklist-description')) {
        autoResizeTextarea(e.target);
      }
      if (e.target.matches('.field-control, .item-prompt, .item-domain, .item-hint')) {
        clearFieldError(e.target);
        e.target.closest('.checklist-item-row')?.classList.remove('is-invalid-row');
      }
    });
    form.addEventListener('change', (e) => {
      if (e.target.matches('.field-control')) clearFieldError(e.target);
      if (e.target.id === 'checklist-is-active' && checklistStep === 4) {
        renderPublishPreview();
      }
    });

    addBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'checklist-item-row checklist-item-row--rich';
      row.dataset.index = String(container.children.length);
      row.innerHTML = checklistItemRowHtml({}, container.children.length);
      container.appendChild(row);
      updateRemoveButtons();
      autoResizeTextareas(row);
      hasDraft = true;
      const reviewBtn = $('#checklist-step-to-review');
      if (reviewBtn) reviewBtn.disabled = false;
      row.querySelector('.item-prompt')?.focus();
    });

    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-item-btn')) {
        e.target.closest('.checklist-item-row')?.remove();
        updateRemoveButtons();
      }
    });

    $('#checklist-step-to-ai')?.addEventListener('click', () => {
      if (!validateDefine()) return;
      setChecklistStep(2);
    });

    $$('[data-checklist-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = Number(btn.getAttribute('data-checklist-step'));
        if (!Number.isNaN(step)) setChecklistStep(step);
      });
    });

    $('#checklist-generate-ai-btn')?.addEventListener('click', () => generateAiDraft({ advance: true }));
    $('#checklist-regenerate-ai-btn')?.addEventListener('click', () => generateAiDraft({ advance: false }));

    $('#checklist-skip-ai-btn')?.addEventListener('click', () => {
      if (!hasDraft || !container.querySelector('.item-prompt')?.value.trim()) {
        setItems([{}]);
      }
      const reviewBtn = $('#checklist-step-to-review');
      if (reviewBtn) reviewBtn.disabled = false;
      setChecklistStep(3);
    });

    $('#checklist-step-to-review')?.addEventListener('click', () => {
      if (!hasDraft) {
        showAlert($('#create-checklist-alert'), 'Generate an AI draft or start blank first.', 'error');
        return;
      }
      setChecklistStep(3);
    });

    $('#checklist-step-to-publish')?.addEventListener('click', () => {
      const data = validateDefine();
      if (!data) return;
      if (!validateItems(data.category)) return;
      setChecklistStep(4);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canCreateChecklists()) return;

      const alertEl = $('#create-checklist-alert');
      hideAlert(alertEl);

      const data = validateDefine();
      if (!data) return;

      const validated = validateItems(data.category);
      if (!validated) return;

      const items = collectItems(data.category).filter((i) => i.prompt);
      const payload = {
        title: data.title,
        description: buildChecklistDescription(data.category, data.description, {
          age_band: data.age_band,
          diagnosis_focus: data.diagnosis_focus,
          purpose: data.purpose,
          scoring_guide: lastScoringGuide,
        }),
        is_active: !!$('#checklist-is-active')?.checked,
        items,
      };

      const publishBtn = $('#checklist-publish-btn');
      if (publishBtn) publishBtn.disabled = true;

      try {
        const created = await SmartCareAPI.post('/checklists', payload);
        const openAssessment = !!$('#checklist-open-assessment')?.checked;
        await loadChecklists();
        resetChecklistWizard();
        closeModal('modal-checklist');
        if (openAssessment && created?.id) {
          useChecklistInAssessment(created.id);
        }
      } catch (err) {
        showAlert(alertEl, err.message, 'error');
      } finally {
        if (publishBtn) publishBtn.disabled = false;
      }
    });

    const modal = $('#modal-checklist');
    if (modal) {
      modal.addEventListener('close', () => {
        resetChecklistWizard();
      });
    }

    setItems([{}]);
    hasDraft = false;
    const reviewBtn = $('#checklist-step-to-review');
    if (reviewBtn) reviewBtn.disabled = true;
    setChecklistStep(1);
  }

  /* Assessment responses */
  function splitAssessmentPrompt(rawPrompt) {
    const text = String(rawPrompt || '').trim();
    const match = text.match(/^(.*?)(?:\s*\[Hint:\s*([\s\S]*?)\s*\])\s*$/i);
    if (match) {
      return {
        prompt: match[1].trim(),
        hint: match[2].trim(),
      };
    }
    return { prompt: text, hint: '' };
  }

  async function loadChecklistResponses(checklistId) {
    const wrap = $('#assessment-responses-wrap');
    const container = $('#assessment-responses');

    if (!checklistId) {
      wrap.hidden = true;
      container.innerHTML = '';
      return;
    }

    let checklist = checklistsCache.find((c) => String(c.id) === String(checklistId));
    if (!checklist || !checklist.items) {
      try {
        checklist = await SmartCareAPI.get(`/checklists/${checklistId}`);
      } catch {
        wrap.hidden = true;
        return;
      }
    }

    if (!checklist.items || !checklist.items.length) {
      wrap.hidden = true;
      return;
    }

    wrap.hidden = false;
    const scoringMatch = (checklist.description || '').match(/Scoring guide:\s*(.+?)(?:\n|$)/i);
    const scoringText = scoringMatch
      ? scoringMatch[1].trim()
      : '0 not observed · 1 emerging · 2 developing · 3 consistent';
    const items = checklist.items
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    container.innerHTML = `
      <div class="assessment-score-guide" role="note">
        <div class="assessment-score-guide__copy">
          <span class="assessment-score-guide__label">
            <img src="https://api.iconify.design/lucide/scale.svg?color=%230F3D30" alt="" width="14" height="14">
            Score scale
          </span>
          <p class="assessment-score-guide__text">${escapeHtml(scoringText)}</p>
        </div>
        <div class="assessment-score-guide__chips" aria-hidden="true">
          <span><strong>0</strong> Not observed</span>
          <span><strong>1</strong> Emerging</span>
          <span><strong>2</strong> Developing</span>
          <span><strong>3</strong> Consistent</span>
        </div>
      </div>
      <div class="assessment-response-list">
        ${items
          .map((item, index) => {
            const parts = splitAssessmentPrompt(item.prompt);
            return `
          <article class="response-row response-row--card" data-item-id="${item.id}">
            <div class="response-row__index">ITEM ${index + 1}</div>
            <div class="response-row__body">
              ${item.domain ? `<span class="domain-tag">${escapeHtml(item.domain)}</span>` : ''}
              <p class="response-row__prompt">${escapeHtml(parts.prompt)}</p>
              ${parts.hint ? `<p class="response-row__hint">${escapeHtml(parts.hint)}</p>` : ''}
            </div>
            <div class="response-row__fields">
              <div class="form-group response-row__score">
                <label>Score</label>
                <select class="response-score field-control" aria-label="Score for item ${index + 1}">
                  <option value="">Select score…</option>
                  <option value="0">0 — Not observed</option>
                  <option value="1">1 — Emerging</option>
                  <option value="2">2 — Developing</option>
                  <option value="3">3 — Consistent</option>
                </select>
              </div>
              <div class="form-group response-row__comment">
                <label>Comment</label>
                <input type="text" class="response-comment field-control" placeholder="Optional observation note" aria-label="Comment for item ${index + 1}">
              </div>
            </div>
          </article>`;
          })
          .join('')}
      </div>`;
  }

  function collectResponses() {
    return Array.from($('#assessment-responses').querySelectorAll('.response-row')).map((row) => ({
      checklist_item_id: parseInt(row.dataset.itemId, 10),
      score: row.querySelector('.response-score').value || null,
      comment: row.querySelector('.response-comment').value.trim() || null,
    }));
  }

  function initAssessments() {
    $('#assessment-checklist').addEventListener('change', (e) => {
      loadChecklistResponses(e.target.value);
    });

    $('#submit-assessment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canSubmitAssessments()) return;

      const alertEl = $('#assessment-alert');
      hideAlert(alertEl);

      const childId = $('#assessment-child').value;
      const checklistId = $('#assessment-checklist').value;
      const responses = collectResponses();

      if (!responses.length) {
        showAlert(alertEl, 'Select a checklist with items to score.', 'error');
        return;
      }

      const payload = {
        checklist_id: parseInt(checklistId, 10),
        severity_level: $('#assessment-severity').value || null,
        notes: $('#assessment-notes').value.trim() || null,
        responses,
      };

      const submitBtn = document.querySelector('#modal-assessment button[type=submit][form="submit-assessment-form"]')
        || e.target.querySelector('button[type=submit]');
      submitBtn.disabled = true;

      try {
        const created = await SmartCareAPI.post(`/children/${childId}/assessments`, payload);
        lastAssessmentChildId = childId;
        lastAssessmentId = created?.id || null;
        await loadSubmittedAssessments({ force: true });
        showAlert(alertEl, 'Assessment submitted successfully.', 'success');
        $('#generate-rec-btn').disabled = false;
      } catch (err) {
        showAlert(alertEl, err.message, 'error');
      } finally {
        submitBtn.disabled = false;
      }
    });

    $('#generate-rec-btn').addEventListener('click', async () => {
      const alertEl = $('#assessment-alert');
      const childId = $('#assessment-child').value || lastAssessmentChildId;

      if (!childId) {
        showAlert(alertEl, 'Select a child first.', 'error');
        return;
      }

      const btn = $('#generate-rec-btn');
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.textContent = 'Generating…';

      try {
        await SmartCareAPI.post(`/children/${childId}/recommendations/generate`, {
          assessment_id: lastAssessmentId ? Number(lastAssessmentId) : undefined,
        });
        showAlert(alertEl, 'AI recommendation generated.', 'success');
        await loadSubmittedAssessments({ force: true });
        if (lastAssessmentId) openAssessmentView(lastAssessmentId);
      } catch (err) {
        showAlert(alertEl, err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  }

  /* Submitted assessments */
  function recommendationStatusMeta(recs) {
    const list = Array.isArray(recs) ? recs : [];
    if (!list.length) {
      return { label: 'No AI recommendation', className: 'badge-neutral' };
    }
    const latest = list[0];
    const status = latest.status || 'pending_review';
    const map = {
      pending_review: { label: 'AI pending review', className: 'badge-pending' },
      approved: { label: 'AI approved', className: 'badge-approved' },
      rejected: { label: 'AI rejected', className: 'badge-rejected' },
      modified: { label: 'Edited', className: 'badge-modified' },
    };
    return map[status] || { label: String(status).replace(/_/g, ' '), className: 'badge-neutral' };
  }

  function renderRecommendationBlock(recs) {
    const list = Array.isArray(recs) ? recs : [];
    if (!list.length) {
      return `
        <div class="assessment-view__empty-rec">
          <p>No AI recommendation yet for this assessment.</p>
          <p class="form-hint">Use Generate AI recommendation to create teacher-reviewed guidance from these scores.</p>
        </div>`;
    }

    return list
      .map((r) => {
        const meta = recommendationStatusMeta([r]);
        const payload = r.openai_response_json || {};
        const summary = payload.developmental_summary || payload.summary || '';
        const focusAreas = Array.isArray(payload.focus_areas) ? payload.focus_areas : [];
        const activities = Array.isArray(payload.suggested_activities) ? payload.suggested_activities : [];
        const interventions = Array.isArray(payload.intervention_suggestions) ? payload.intervention_suggestions : [];
        const caution = payload.caution || r.caution || '';

        const activityItems = activities
          .map((g) => {
            if (typeof g === 'string') return escapeHtml(g);
            const title = g.title || g.name || 'Activity';
            const rationale = g.rationale ? ` — ${g.rationale}` : '';
            return `${escapeHtml(title)}${escapeHtml(rationale)}`;
          })
          .map((html) => `<li>${html}</li>`)
          .join('');

        return `
          <article class="assessment-view__rec">
            <div class="assessment-view__rec-top">
              <strong>AI recommendation</strong>
              <span class="badge ${meta.className}">${escapeHtml(meta.label)}</span>
            </div>
            <p class="data-card__meta">Generated ${formatDate(r.created_at)}</p>
            ${summary ? `<p class="assessment-view__rec-text">${escapeHtml(summary)}</p>` : ''}
            ${focusAreas.length ? `<div class="assessment-view__list-block"><h5>Focus areas</h5><ul>${focusAreas.map((g) => `<li>${escapeHtml(typeof g === 'string' ? g : JSON.stringify(g))}</li>`).join('')}</ul></div>` : ''}
            ${activityItems ? `<div class="assessment-view__list-block"><h5>Suggested activities</h5><ul>${activityItems}</ul></div>` : ''}
            ${interventions.length ? `<div class="assessment-view__list-block"><h5>Intervention suggestions</h5><ul>${interventions.map((g) => `<li>${escapeHtml(typeof g === 'string' ? g : JSON.stringify(g))}</li>`).join('')}</ul></div>` : ''}
            ${caution ? `<p class="form-hint">${escapeHtml(caution)}</p>` : ''}
          </article>`;
      })
      .join('');
  }

  async function openAssessmentView(assessmentId) {
    const alertEl = $('#assessment-view-alert');
    const content = $('#assessment-view-content');
    const generateBtn = $('#assessment-view-generate-btn');
    hideAlert(alertEl);
    content.innerHTML = '<p class="loading">Loading assessment…</p>';
    viewingAssessmentId = assessmentId;
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generate AI recommendation';
    }
    openModal('modal-assessment-view');

    try {
      const assessment = await SmartCareAPI.get(`/assessments/${assessmentId}`);
      assessmentsCache = assessmentsCache.map((a) => (String(a.id) === String(assessmentId) ? assessment : a));
      if (!assessmentsCache.some((a) => String(a.id) === String(assessmentId))) {
        assessmentsCache.unshift(assessment);
      }

      const child = assessment.child || {};
      const checklist = assessment.checklist || {};
      const responses = (assessment.responses || [])
        .slice()
        .sort((a, b) => (a.checklist_item?.sort_order ?? 0) - (b.checklist_item?.sort_order ?? 0));
      const severity = assessment.severity_level
        ? assessment.severity_level.charAt(0).toUpperCase() + assessment.severity_level.slice(1)
        : 'Not specified';
      const submitter = assessment.psychometrician?.name || assessment.psychometrician?.username || '—';
      const recMeta = recommendationStatusMeta(assessment.ai_recommendations);

      $('#modal-assessment-view-title').textContent = childName(child);
      $('#modal-assessment-view-meta').textContent = `${checklist.title || 'Checklist'} · ${severity} · ${recMeta.label}`;

      content.innerHTML = `
        <section class="assessment-section">
          <h4 class="assessment-section__title">Assessment summary</h4>
          <div class="publish-summary">
            <div class="publish-summary__card">
              <span class="publish-summary__label">Child</span>
              <strong class="publish-summary__value">${escapeHtml(childName(child))}</strong>
            </div>
            <div class="publish-summary__card">
              <span class="publish-summary__label">Checklist</span>
              <strong class="publish-summary__value">${escapeHtml(checklist.title || '—')}</strong>
            </div>
            <div class="publish-summary__card">
              <span class="publish-summary__label">Severity</span>
              <strong class="publish-summary__value">${escapeHtml(severity)}</strong>
            </div>
            <div class="publish-summary__card">
              <span class="publish-summary__label">Submitted</span>
              <strong class="publish-summary__value">${escapeHtml(formatDate(assessment.created_at))}</strong>
            </div>
          </div>
          <p class="data-card__meta" style="margin-top:0.85rem">By ${escapeHtml(submitter)} · Status ${escapeHtml(assessment.status || 'finalized')}</p>
          ${assessment.notes ? `<p class="publish-summary__purpose"><span>Notes</span>${escapeHtml(assessment.notes)}</p>` : ''}
        </section>

        <section class="assessment-section">
          <div class="assessment-section__head">
            <h4 class="assessment-section__title">Checklist responses</h4>
            <p class="assessment-section__hint">${responses.length} item${responses.length === 1 ? '' : 's'} scored for this assessment.</p>
          </div>
          <div class="assessment-response-list">
            ${responses
              .map((r, index) => {
                const item = r.checklist_item || {};
                const parts = splitAssessmentPrompt(item.prompt || 'Untitled prompt');
                const scoreLabel = r.score === null || r.score === undefined || r.score === ''
                  ? 'Not scored'
                  : String(r.score);
                return `
                <article class="response-row">
                  <div class="response-row__head">
                    <span class="response-row__index">Item ${index + 1}</span>
                    ${item.domain ? `<span class="domain-tag">${escapeHtml(item.domain)}</span>` : ''}
                    <span class="badge badge-neutral">Score ${escapeHtml(scoreLabel)}</span>
                  </div>
                  <p class="response-row__prompt">${escapeHtml(parts.prompt)}</p>
                  ${parts.hint ? `<p class="response-row__hint">${escapeHtml(parts.hint)}</p>` : ''}
                  ${r.comment ? `<p class="response-row__hint"><strong>Comment:</strong> ${escapeHtml(r.comment)}</p>` : ''}
                </article>`;
              })
              .join('') || '<p class="form-hint">No scored responses on this assessment.</p>'}
          </div>
        </section>

        <section class="assessment-section">
          <div class="assessment-section__head">
            <h4 class="assessment-section__title">AI recommendation</h4>
            <p class="assessment-section__hint">Generate or review AI guidance based on this assessment.</p>
          </div>
          <div id="assessment-view-rec-wrap">
            ${renderRecommendationBlock(assessment.ai_recommendations)}
          </div>
        </section>`;

      if (generateBtn) {
        generateBtn.disabled = !canSubmitAssessments();
        generateBtn.dataset.childId = String(child.id || '');
        generateBtn.dataset.assessmentId = String(assessment.id);
      }

      const profileBtn = $('#assessment-view-profile-btn');
      if (profileBtn) {
        profileBtn.onclick = () => {
          closeModal('modal-assessment-view');
          if (child.id) openChildProfile(child.id, 'recommendations');
        };
      }
    } catch (err) {
      content.innerHTML = '';
      showAlert(alertEl, err.message || 'Could not load assessment.', 'error');
      if (generateBtn) generateBtn.disabled = true;
    }
  }

  async function generateRecommendationForAssessment(childId, assessmentId, btn, alertEl) {
    if (!childId || !assessmentId) {
      showAlert(alertEl, 'Assessment context is missing.', 'error');
      return null;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Generating…';
    }
    try {
      const rec = await SmartCareAPI.post(`/children/${childId}/recommendations/generate`, {
        assessment_id: Number(assessmentId),
      });
      showAlert(alertEl, 'AI recommendation generated.', 'success');
      await loadSubmittedAssessments({ force: true });
      return rec;
    } catch (err) {
      showAlert(alertEl, err.message || 'AI recommendation failed.', 'error');
      return null;
    } finally {
      if (btn) {
        btn.disabled = !canSubmitAssessments();
        btn.textContent = 'Generate AI recommendation';
      }
    }
  }

  function initAssessmentViewActions() {
    const list = $('#submitted-assessments-list');
    list?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-assessment-action]');
      if (!btn) return;
      const id = btn.getAttribute('data-assessment-id');
      const action = btn.getAttribute('data-assessment-action');
      if (!id) return;

      if (action === 'view') {
        openAssessmentView(id);
        return;
      }

      if (action === 'profile') {
        const childId = btn.getAttribute('data-child-id');
        if (childId) openChildProfile(Number(childId), 'recommendations');
        return;
      }

      if (action === 'generate') {
        const childId = btn.getAttribute('data-child-id');
        const alertEl = $('#submitted-assessments-alert');
        hideAlert(alertEl);
        const rec = await generateRecommendationForAssessment(childId, id, btn, alertEl);
        if (rec) openAssessmentView(id);
      }
    });

    $('#assessment-view-generate-btn')?.addEventListener('click', async () => {
      const btn = $('#assessment-view-generate-btn');
      const alertEl = $('#assessment-view-alert');
      const childId = btn?.dataset.childId;
      const assessmentId = btn?.dataset.assessmentId || viewingAssessmentId;
      const rec = await generateRecommendationForAssessment(childId, assessmentId, btn, alertEl);
      if (rec && assessmentId) {
        await openAssessmentView(assessmentId);
      }
    });
  }

  let assessmentsLoaded = false;
  let assessmentsLoading = false;

  async function loadSubmittedAssessments({ force = false } = {}) {
    if (assessmentsLoading) return;
    if (assessmentsLoaded && !force) return;

    const loading = $('#submitted-assessments-loading');
    const empty = $('#submitted-assessments-empty');
    const list = $('#submitted-assessments-list');
    const totalEl = $('#submitted-assessments-count');
    const toolbarCount = $('#submitted-assessments-toolbar-count');
    const pendingCountEl = $('#pending-recs-count');

    assessmentsLoading = true;
    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    if (list) list.hidden = true;

    let assessments = [];
    try {
      assessments = await SmartCareAPI.get('/assessments');
      assessmentsCache = assessments;
      assessmentsLoaded = true;
    } catch (err) {
      if (loading) loading.textContent = `Could not load assessments: ${err.message}`;
      if (totalEl) totalEl.textContent = '0';
      if (toolbarCount) toolbarCount.textContent = '0';
      if (pendingCountEl) pendingCountEl.textContent = '0';
      assessmentsLoading = false;
      return;
    }

    if (loading) {
      loading.hidden = true;
      loading.textContent = 'Loading assessments…';
    }

    const pendingRecs = assessments.reduce((count, a) => {
      const recs = a.ai_recommendations || [];
      return count + recs.filter((r) => r.status === 'pending_review').length;
    }, 0);

    if (totalEl) totalEl.textContent = String(assessments.length);
    if (toolbarCount) toolbarCount.textContent = String(assessments.length);
    if (pendingCountEl) pendingCountEl.textContent = String(pendingRecs);

    if (!assessments.length) {
      if (empty) empty.hidden = false;
      assessmentsLoading = false;
      return;
    }

    if (empty) empty.hidden = true;
    if (!list) {
      assessmentsLoading = false;
      return;
    }
    list.hidden = false;
    list.innerHTML = assessments
      .map((a) => {
        const child = a.child || {};
        const checklist = a.checklist || {};
        const responseCount = a.responses_count ?? (a.responses || []).length;
        const scored = a.scored_responses_count
          ?? (a.responses || []).filter((r) => r.score !== null && r.score !== '' && r.score !== undefined).length;
        const recMeta = recommendationStatusMeta(a.ai_recommendations);
        const severity = a.severity_level
          ? a.severity_level.charAt(0).toUpperCase() + a.severity_level.slice(1)
          : 'Not specified';
        const submitter = a.psychometrician?.name || a.psychometrician?.username || '—';
        const notes = a.notes ? truncate(a.notes, 110) : '';
        const hasRec = (a.ai_recommendations || []).length > 0;

        return `
        <article class="data-card data-card--assessment" data-assessment-id="${a.id}">
          <div class="data-card__top">
            <h4>${escapeHtml(childName(child))}</h4>
            <span class="badge ${recMeta.className}">${escapeHtml(recMeta.label)}</span>
          </div>
          <p class="data-card__meta">${escapeHtml(checklist.title || 'Checklist')} · ${escapeHtml(severity)}</p>
          <p class="data-card__meta">${scored}/${responseCount} scored · Submitted ${formatDate(a.created_at)}</p>
          <p class="data-card__meta">By ${escapeHtml(submitter)}</p>
          ${notes ? `<p class="data-card__desc">${escapeHtml(notes)}</p>` : ''}
          <div class="data-card__actions">
            <button type="button" class="btn btn-secondary" data-assessment-action="view" data-assessment-id="${a.id}">View</button>
            <button type="button" class="btn btn-secondary" data-assessment-action="profile" data-child-id="${child.id || ''}">Child profile</button>
            <button type="button" class="btn btn-accent" data-assessment-action="generate" data-assessment-id="${a.id}" data-child-id="${child.id || ''}">
              ${hasRec ? 'Regenerate AI' : 'Generate AI'}
            </button>
          </div>
        </article>`;
      })
      .join('');
    assessmentsLoading = false;
  }

  /* Child clinical profile */
  let childProfileCache = null;
  let childProfileId = null;

  function setProfileTab(tab) {
    $$('.profile-tab').forEach((btn) => {
      const active = btn.dataset.profileTab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $$('.profile-pane').forEach((pane) => {
      const active = pane.dataset.profilePane === tab;
      pane.classList.toggle('is-active', active);
      pane.hidden = !active;
    });
  }

  function materialCardHtml(m) {
    return `
      <article class="profile-item">
        <div class="profile-item__top">
          <h5>${escapeHtml(m.title || 'Material')}</h5>
          ${m.type ? `<span class="badge badge-neutral">${escapeHtml(m.type)}</span>` : ''}
        </div>
        <p class="profile-item__meta">${escapeHtml(truncate(m.description || 'No description', 140))}</p>
      </article>`;
  }

  function renderPerformanceLine(points) {
    const usable = (points || []).filter((p) => p.average_score != null);
    if (!usable.length) {
      return '<p class="profile-empty">Not enough scored assessments to plot a performance trend yet.</p>';
    }

    const w = 560;
    const h = 200;
    const padX = 36;
    const padY = 28;
    const maxScore = 3;
    const coords = usable.map((p, i) => {
      const x = usable.length === 1
        ? w / 2
        : padX + (i / (usable.length - 1)) * (w - padX * 2);
      const y = padY + (1 - Number(p.average_score) / maxScore) * (h - padY * 2);
      return { ...p, x, y };
    });
    const line = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const latest = usable[usable.length - 1];

    return `
      <div class="profile-chart">
        <svg class="profile-line" viewBox="0 0 ${w} ${h}" role="img" aria-label="Assessment performance trend">
          <line class="profile-line__grid" x1="${padX}" y1="${padY}" x2="${w - padX}" y2="${padY}" />
          <line class="profile-line__grid" x1="${padX}" y1="${h / 2}" x2="${w - padX}" y2="${h / 2}" />
          <line class="profile-line__grid" x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" />
          <polyline class="profile-line__path" points="${line}" fill="none" stroke="#0F4C4A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
          ${coords
            .map(
              (c) => `
            <circle class="profile-line__dot" cx="${c.x}" cy="${c.y}" r="4.5" fill="#fff" stroke="#0F4C4A" stroke-width="2.5">
              <title>${escapeHtml(c.title || 'Assessment')}: ${c.average_score}/3</title>
            </circle>
            <text class="profile-line__label" x="${c.x}" y="${h - 8}" text-anchor="middle">${escapeHtml(formatDate(c.submitted_at).replace(/,.*/, ''))}</text>`
            )
            .join('')}
          <text class="profile-line__label" x="8" y="${padY + 4}">3</text>
          <text class="profile-line__label" x="8" y="${h / 2 + 4}">1.5</text>
          <text class="profile-line__label" x="8" y="${h - padY + 4}">0</text>
        </svg>
        <p class="profile-item__meta">Latest average score: <strong>${latest.average_score}/3</strong> on ${escapeHtml(latest.title || 'assessment')}</p>
      </div>`;
  }

  function renderDomainBars(domains) {
    const rows = domains || [];
    if (!rows.length) {
      return '<p class="profile-empty">Domain score analytics will appear after checklist responses are scored.</p>';
    }
    return `
      <div class="profile-domain-bars">
        ${rows
          .map((d) => {
            const pct = Math.max(0, Math.min(100, Math.round((Number(d.average) / 3) * 100)));
            return `
              <div class="profile-domain-row">
                <span>${escapeHtml(d.domain)}</span>
                <div class="profile-domain-track"><div class="profile-domain-fill" style="width:${pct}%"></div></div>
                <strong>${Number(d.average).toFixed(1)}</strong>
              </div>`;
          })
          .join('')}
      </div>`;
  }

  function recommendationCardHtml(r, { showActions = true } = {}) {
    const meta = recommendationStatusMeta([r]);
    const payload = r.openai_response_json || {};
    const summary = payload.developmental_summary || '';
    const focus = Array.isArray(payload.focus_areas) ? payload.focus_areas : [];
    const activities = Array.isArray(payload.suggested_activities) ? payload.suggested_activities : [];
    const interventions = Array.isArray(payload.intervention_suggestions) ? payload.intervention_suggestions : [];
    const pendingRec = r.status === 'pending_review';

    return `
      <article class="profile-item ${pendingRec ? 'profile-suggestion' : ''}" data-rec-id="${r.id}">
        <div class="profile-item__top">
          <h5>${escapeHtml(r.assessment?.checklist?.title || 'AI recommendation')}</h5>
          <span class="badge ${meta.className}">${escapeHtml(meta.label)}</span>
        </div>
        <p class="profile-item__meta">Generated ${formatDate(r.created_at)}${r.reviewed_at ? ` · Reviewed ${formatDate(r.reviewed_at)}` : ''}</p>
        ${summary ? `<p class="profile-item__body">${escapeHtml(summary)}</p>` : ''}
        ${focus.length ? `<p class="profile-item__meta"><strong>Focus:</strong> ${escapeHtml(focus.join(', '))}</p>` : ''}
        ${
          activities.length
            ? `<div class="assessment-view__list-block"><h5>Suggested activities</h5><ul>${activities
                .slice(0, 5)
                .map((a) => `<li>${escapeHtml(typeof a === 'string' ? a : a.title || 'Activity')}${a && a.rationale ? ` — ${escapeHtml(a.rationale)}` : ''}</li>`)
                .join('')}</ul></div>`
            : ''
        }
        ${
          interventions.length
            ? `<div class="assessment-view__list-block"><h5>Intervention suggestions</h5><ul>${interventions
                .slice(0, 4)
                .map((g) => `<li>${escapeHtml(typeof g === 'string' ? g : JSON.stringify(g))}</li>`)
                .join('')}</ul></div>`
            : ''
        }
        ${r.teacher_notes ? `<p class="profile-item__meta"><strong>Review notes:</strong> ${escapeHtml(r.teacher_notes)}</p>` : ''}
        ${r.therapy_plan ? `<p class="profile-item__meta"><strong>Therapy plan:</strong> ${escapeHtml(r.therapy_plan.title)} (${escapeHtml(r.therapy_plan.status)})</p>` : ''}
        ${
          showActions && pendingRec && canReviewRecommendations()
            ? `<div class="profile-item__actions">
                <textarea class="field-control profile-notes" data-rec-notes="${r.id}" placeholder="Optional review notes"></textarea>
                <button type="button" class="btn btn-primary" data-review-rec="${r.id}" data-review-status="approved">Accept</button>
                <button type="button" class="btn btn-secondary" data-review-rec="${r.id}" data-review-status="modified">Accept as modified</button>
                <button type="button" class="btn btn-secondary" data-review-rec="${r.id}" data-review-status="rejected">Reject</button>
              </div>`
            : ''
        }
      </article>`;
  }

  function renderChildProfile(report) {
    const child = report.child || {};
    const pending = report.pending_recommendations_count || 0;
    const trend = report.performance_trend || [];
    const domains = report.domain_performance || [];
    const recs = report.recommendations || [];
    const featuredRec = recs.find((r) => r.status === 'pending_review') || recs[0] || null;
    const scoredTrend = trend.filter((p) => p.average_score != null);
    const latestAvg = scoredTrend.length ? scoredTrend[scoredTrend.length - 1].average_score : null;

    $('#modal-child-profile-title').textContent = childName(child);
    $('#modal-child-profile-meta').textContent = `${patientId(child)} · ${child.diagnosis || 'No diagnosis'} · Age ${ageBandLabel(child.age_band)}`;

    const name = childName(child);
    const initials = initialsFromName(name);
    const photoUrl = child.photo_url || child.avatar_url || child.profile_photo || '';
    const active = child.is_active !== false;
    const photoHtml = photoUrl
      ? `<img class="profile-photo-frame__img" src="${escapeHtml(photoUrl)}" alt="">`
      : `<span class="profile-photo-frame__initials">${escapeHtml(initials)}</span>`;

    $('#child-profile-summary').innerHTML = `
      <div class="profile-photo-frame" aria-hidden="true">
        <div class="profile-photo-frame__inner">
          ${photoHtml}
        </div>
        <span class="profile-photo-frame__badge">${escapeHtml(initials.slice(0, 2))}</span>
      </div>
      <div class="profile-hero__identity">
        <h4 class="profile-hero__name">${escapeHtml(name)}</h4>
        <p class="profile-hero__meta">${escapeHtml(patientId(child))} · ${escapeHtml(child.diagnosis || 'No diagnosis')} · Age ${escapeHtml(ageBandLabel(child.age_band))}</p>
        <div class="profile-hero__tags">
          <span class="profile-hero__tag ${active ? 'profile-hero__tag--active' : ''}">
            <img src="https://api.iconify.design/lucide/${active ? 'badge-check' : 'circle-off'}.svg?color=${active ? '%230F3D30' : '%235C6775'}" alt="" width="13" height="13">
            ${active ? 'Active' : 'Inactive'}
          </span>
          <span class="profile-hero__tag">
            <img src="https://api.iconify.design/lucide/user.svg?color=%235C6775" alt="" width="13" height="13">
            ${escapeHtml(child.sex || 'Sex not set')}
          </span>
          <span class="profile-hero__tag">
            <img src="https://api.iconify.design/lucide/heart-handshake.svg?color=%235C6775" alt="" width="13" height="13">
            ${escapeHtml(primaryCaretaker(child))}
          </span>
        </div>
      </div>
      <div class="profile-hero__stats" aria-label="Profile metrics">
        <div class="profile-hero__stat"><span>Assessments</span><strong>${report.assessments_count || 0}</strong></div>
        <div class="profile-hero__stat"><span>Avg score</span><strong>${latestAvg != null ? latestAvg : '—'}</strong></div>
        <div class="profile-hero__stat"><span>Pending AI</span><strong>${pending}</strong></div>
        <div class="profile-hero__stat"><span>Active plans</span><strong>${(report.active_therapy_plans || []).length}</strong></div>
      </div>`;

    const photoImg = $('#child-profile-summary')?.querySelector('.profile-photo-frame__img');
    if (photoImg) {
      photoImg.addEventListener('error', () => {
        const inner = photoImg.parentElement;
        if (!inner) return;
        photoImg.remove();
        inner.insertAdjacentHTML(
          'beforeend',
          `<span class="profile-photo-frame__initials">${escapeHtml(initials)}</span>`
        );
      });
    }

    const overview = $(`.profile-pane[data-profile-pane="overview"]`);
    overview.innerHTML = `
      <div class="profile-analytics">
        <div class="profile-block">
          <h4>Performance trend</h4>
          ${renderPerformanceLine(trend)}
        </div>
        <div class="profile-block">
          <h4>Domain analytics</h4>
          ${renderDomainBars(domains)}
        </div>
      </div>
      <div class="profile-block profile-suggestion">
        <h4>Latest AI suggestion</h4>
        ${
          featuredRec
            ? recommendationCardHtml(featuredRec, { showActions: true })
            : `<p class="profile-empty">No AI suggestion yet. Generate one from an assessment to review it here.</p>
               ${report.latest_assessment ? `<div class="profile-item__actions"><button type="button" class="btn btn-accent" data-generate-from-profile="${report.latest_assessment.id}" data-child-id="${child.id}">Generate AI recommendation</button></div>` : ''}`
        }
      </div>
      <div class="profile-details-grid">
        <div class="profile-block">
          <h4>Patient details</h4>
          <p class="profile-item__meta"><strong>Status:</strong> ${child.is_active !== false ? 'Active' : 'Inactive'}</p>
          <p class="profile-item__meta"><strong>Sex:</strong> ${escapeHtml(child.sex || '—')}</p>
          <p class="profile-item__meta"><strong>Birth date:</strong> ${escapeHtml(child.birth_date ? String(child.birth_date).slice(0, 10) : '—')}</p>
          <p class="profile-item__meta"><strong>Caretaker:</strong> ${escapeHtml(primaryCaretaker(child))}</p>
          <p class="profile-item__meta"><strong>Notes:</strong> ${escapeHtml(stripCaretakerFromNotes(child.condition_notes || '') || '—')}</p>
        </div>
        <div class="profile-block">
          <h4>Latest assessment result</h4>
          ${
            report.latest_assessment
              ? `<div class="profile-item">
                  <div class="profile-item__top">
                    <h5>${escapeHtml(report.latest_assessment.checklist?.title || 'Assessment')}</h5>
                    <span class="badge badge-neutral">${escapeHtml(report.latest_assessment.severity_level || 'No severity')}</span>
                  </div>
                  <p class="profile-item__meta">Submitted ${formatDate(report.latest_assessment.created_at)} · ${(report.latest_assessment.scored_responses_count ?? 0)}/${(report.latest_assessment.responses_count ?? 0)} scored</p>
                  <p class="profile-item__meta">Average score: <strong>${
                    scoredTrend.find((p) => String(p.assessment_id) === String(report.latest_assessment.id))?.average_score ?? '—'
                  }/3</strong></p>
                  <div class="profile-item__actions">
                    <button type="button" class="btn btn-secondary" data-open-assessment="${report.latest_assessment.id}">View full responses</button>
                  </div>
                </div>`
              : '<p class="profile-empty">No assessments submitted yet.</p>'
          }
        </div>
      </div>
      <div class="profile-block">
        <h4>Upcoming sessions</h4>
        <div class="profile-list">
          ${(report.sessions_upcoming || []).length
            ? report.sessions_upcoming
                .map(
                  (s) => `
                <article class="profile-item">
                  <div class="profile-item__top">
                    <h5>${escapeHtml(formatSessionTime(s.scheduled_at))}</h5>
                    <span class="badge badge-neutral">${escapeHtml(s.status || 'scheduled')}</span>
                  </div>
                  <p class="profile-item__meta">Teacher: ${escapeHtml(s.teacher?.name || '—')}</p>
                </article>`
                )
                .join('')
            : '<p class="profile-empty">No upcoming sessions.</p>'}
        </div>
      </div>`;

    const assessmentsPane = $(`.profile-pane[data-profile-pane="assessments"]`);
    const assessments = report.assessments || [];
    assessmentsPane.innerHTML = `
      <div class="profile-block">
        <h4>Submitted assessments &amp; results</h4>
        <div class="profile-list">
          ${
            assessments.length
              ? assessments
                  .map((a) => {
                    const recMeta = recommendationStatusMeta(a.ai_recommendations);
                    const point = trend.find((p) => String(p.assessment_id) === String(a.id));
                    const domainBits = (point?.domain_averages || [])
                      .slice(0, 3)
                      .map((d) => `${d.domain} ${d.average}`)
                      .join(' · ');
                    const tip = ((a.ai_recommendations || [])[0]?.openai_response_json || {}).developmental_summary;
                    return `
                    <article class="profile-item">
                      <div class="profile-item__top">
                        <h5>${escapeHtml(a.checklist?.title || 'Checklist')}</h5>
                        <span class="badge ${recMeta.className}">${escapeHtml(recMeta.label)}</span>
                      </div>
                      <p class="profile-item__meta">${escapeHtml(a.severity_level || 'Severity not set')} · Avg ${point?.average_score ?? '—'}/3 · ${a.scored_responses_count ?? 0}/${a.responses_count ?? 0} scored · ${formatDate(a.created_at)}</p>
                      ${domainBits ? `<p class="profile-item__meta">${escapeHtml(domainBits)}</p>` : ''}
                      <p class="profile-item__meta">By ${escapeHtml(a.psychometrician?.name || a.psychometrician?.username || '—')}</p>
                      ${a.notes ? `<p class="profile-item__body">${escapeHtml(a.notes)}</p>` : ''}
                      ${tip ? `<p class="profile-item__body">${escapeHtml(tip)}</p>` : ''}
                      <div class="profile-item__actions">
                        <button type="button" class="btn btn-secondary" data-open-assessment="${a.id}">View responses</button>
                        <button type="button" class="btn btn-accent" data-generate-from-profile="${a.id}" data-child-id="${child.id}">
                          ${(a.ai_recommendations || []).length ? 'Regenerate AI' : 'Generate AI'}
                        </button>
                      </div>
                    </article>`;
                  })
                  .join('')
              : '<p class="profile-empty">No assessments yet for this child.</p>'
          }
        </div>
      </div>`;

    const recsPane = $(`.profile-pane[data-profile-pane="recommendations"]`);
    recsPane.innerHTML = `
      <div class="profile-block">
        <h4>AI recommendations</h4>
        <p class="form-hint">Pending suggestions appear here and on Overview. Accepting creates an active therapy plan linked to this child.</p>
        <div class="profile-list">
          ${recs.length ? recs.map((r) => recommendationCardHtml(r)).join('') : '<p class="profile-empty">No AI recommendations yet. Generate one from an assessment.</p>'}
        </div>
      </div>`;

    const medsPane = $(`.profile-pane[data-profile-pane="medications"]`);
    const meds = report.medication_schedules || [];
    medsPane.innerHTML = `
      <div class="profile-block">
        <h4>Medication schedules</h4>
        <div class="profile-list">
          ${
            meds.length
              ? meds
                  .map(
                    (m) => `
                <article class="profile-item">
                  <div class="profile-item__top">
                    <h5>${escapeHtml(m.medicine_name || 'Medicine')}</h5>
                    <span class="badge ${m.is_active !== false ? 'badge-approved' : 'badge-neutral'}">${m.is_active !== false ? 'Active' : 'Inactive'}</span>
                  </div>
                  <p class="profile-item__meta">Dosage: ${escapeHtml(m.dosage || '—')} · Time: ${escapeHtml(m.time_of_day || '—')}</p>
                  <p class="profile-item__meta">${escapeHtml(m.instructions || 'No special instructions')}</p>
                </article>`
                  )
                  .join('')
              : '<p class="profile-empty">No medication schedules for this child.</p>'
          }
        </div>
      </div>`;

    const materialsPane = $(`.profile-pane[data-profile-pane="materials"]`);
    const recommended = report.recommended_materials || [];
    const library = report.learning_materials || [];
    materialsPane.innerHTML = `
      <div class="profile-block">
        <h4>Recommended from AI</h4>
        <div class="profile-list">
          ${recommended.length ? recommended.map(materialCardHtml).join('') : '<p class="profile-empty">No linked learning materials from AI recommendations yet.</p>'}
        </div>
      </div>
      <div class="profile-block">
        <h4>Facility learning library</h4>
        <div class="profile-list">
          ${library.length ? library.map(materialCardHtml).join('') : '<p class="profile-empty">No learning materials in the library.</p>'}
        </div>
      </div>`;

    const progressPane = $(`.profile-pane[data-profile-pane="progress"]`);
    const progress = report.progress_records || [];
    const plans = report.active_therapy_plans || [];
    progressPane.innerHTML = `
      <div class="profile-block">
        <h4>Active therapy plans</h4>
        <div class="profile-list">
          ${
            plans.length
              ? plans
                  .map(
                    (p) => `
                <article class="profile-item">
                  <div class="profile-item__top">
                    <h5>${escapeHtml(p.title || 'Therapy plan')}</h5>
                    <span class="badge badge-approved">${escapeHtml(p.status || 'active')}</span>
                  </div>
                  <p class="profile-item__meta">Teacher: ${escapeHtml(p.teacher?.name || '—')} · ${p.sessions_per_week || 0} sessions/week</p>
                  ${p.description ? `<p class="profile-item__body">${escapeHtml(p.description)}</p>` : ''}
                </article>`
                  )
                  .join('')
              : '<p class="profile-empty">No active therapy plans. Accept a pending AI recommendation to create one.</p>'
          }
        </div>
      </div>
      <div class="profile-block">
        <h4>Progress records</h4>
        <div class="profile-list">
          ${
            progress.length
              ? progress
                  .map(
                    (p) => `
                <article class="profile-item">
                  <div class="profile-item__top">
                    <h5>${escapeHtml(p.title || 'Progress note')}</h5>
                    <span class="badge badge-neutral">${escapeHtml(p.recorded_on || formatDate(p.created_at))}</span>
                  </div>
                  <p class="profile-item__body">${escapeHtml(p.summary || p.milestone || 'No details')}</p>
                </article>`
                  )
                  .join('')
              : '<p class="profile-empty">No progress records yet.</p>'
          }
        </div>
      </div>`;
  }

  async function openChildProfile(childId, tab = 'overview') {
    childProfileId = childId;
    const alertEl = $('#child-profile-alert');
    const loading = $('#child-profile-loading');
    const content = $('#child-profile-content');
    hideAlert(alertEl);
    loading.hidden = false;
    content.hidden = true;
    openModal('modal-child-profile');
    setProfileTab(tab);

    try {
      const report = await SmartCareAPI.get(`/reports/children/${childId}`);
      childProfileCache = report;
      renderChildProfile(report);
      loading.hidden = true;
      content.hidden = false;
      const editBtn = $('#child-profile-edit-btn');
      const assessBtn = $('#child-profile-assess-btn');
      if (editBtn) {
        editBtn.hidden = !canManageChildren();
        editBtn.onclick = () => {
          closeModal('modal-child-profile');
          openChildModal(childId, 'edit');
        };
      }
      if (assessBtn) {
        assessBtn.hidden = !canSubmitAssessments();
        assessBtn.onclick = () => {
          closeModal('modal-child-profile');
          const nav = $('.nav-link[data-section="assessments"]');
          if (nav) nav.click();
          const select = $('#assessment-child');
          if (select) select.value = String(childId);
          openModal('modal-assessment');
        };
      }
    } catch (err) {
      loading.hidden = true;
      showAlert(alertEl, err.message || 'Could not load child profile.', 'error');
    }
  }

  async function reviewRecommendation(recId, status) {
    const alertEl = $('#child-profile-alert');
    const notes = $(`[data-rec-notes="${recId}"]`)?.value.trim() || null;
    hideAlert(alertEl);
    try {
      await SmartCareAPI.post(`/recommendations/${recId}/review`, {
        status,
        teacher_notes: notes,
      });
      const label = status === 'approved' ? 'accepted' : status === 'modified' ? 'accepted as modified' : 'rejected';
      showAlert(alertEl, `AI recommendation ${label}.`, 'success');
      if (childProfileId) {
        const activeTab = $('.profile-tab.is-active')?.dataset?.profileTab || 'overview';
        await openChildProfile(childProfileId, activeTab);
      }
      await loadSubmittedAssessments({ force: true });
      if (window.__facilityReport) {
        window.__facilityReport = null;
        loadAnalytics();
      }
    } catch (err) {
      showAlert(alertEl, err.message || 'Could not review recommendation.', 'error');
    }
  }

  function initChildProfile() {
    $$('.profile-tab').forEach((btn) => {
      btn.addEventListener('click', () => setProfileTab(btn.dataset.profileTab));
    });

    $('#child-profile-content')?.addEventListener('click', async (e) => {
      const openAssessment = e.target.closest('[data-open-assessment]');
      if (openAssessment) {
        const id = openAssessment.getAttribute('data-open-assessment');
        closeModal('modal-child-profile');
        openAssessmentView(id);
        return;
      }

      const generateBtn = e.target.closest('[data-generate-from-profile]');
      if (generateBtn) {
        const assessmentId = generateBtn.getAttribute('data-generate-from-profile');
        const childId = generateBtn.getAttribute('data-child-id') || childProfileId;
        const alertEl = $('#child-profile-alert');
        const rec = await generateRecommendationForAssessment(childId, assessmentId, generateBtn, alertEl);
        if (rec && childProfileId) {
          await openChildProfile(childProfileId, 'overview');
        }
        return;
      }

      const reviewBtn = e.target.closest('[data-review-rec]');
      if (reviewBtn) {
        if (!canReviewRecommendations()) return;
        reviewBtn.disabled = true;
        await reviewRecommendation(
          reviewBtn.getAttribute('data-review-rec'),
          reviewBtn.getAttribute('data-review-status')
        );
      }
    });
  }

  /* Reports */
  async function loadFacilityReport() {
    if (window.__facilityReport) {
      syncFacilityReportPanel(window.__facilityReport);
      return;
    }
    try {
      const report = await SmartCareAPI.get('/reports/overview');
      window.__facilityReport = report;
      syncFacilityReportPanel(report);
    } catch (err) {
      const loading = $('#facility-report-loading');
      if (loading) loading.textContent = `Could not load facility report: ${err.message}`;
    }
  }

  async function loadChildReport(childId) {
    const loading = $('#child-report-loading');
    const empty = $('#child-report-empty');
    const content = $('#child-report-content');

    if (!childId) {
      loading.hidden = true;
      content.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    loading.hidden = false;
    content.hidden = true;

    try {
      const report = await SmartCareAPI.get(`/reports/children/${childId}`);
      loading.hidden = true;
      content.hidden = false;

      const child = report.child;
      const latest = report.latest_assessment;

      content.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">${report.assessments_count}</span>
            <span class="stat-label">Assessments</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${report.sessions_completed}</span>
            <span class="stat-label">Sessions done</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${(report.active_therapy_plans || []).length}</span>
            <span class="stat-label">Active plans</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${report.medication_schedules_active}</span>
            <span class="stat-label">Med schedules</span>
          </div>
        </div>
        <h4 class="panel-title" style="margin-top:1.5rem">${escapeHtml(childName(child))}</h4>
        <p class="item-list-meta">Diagnosis: ${escapeHtml(child.diagnosis || 'Not recorded')}</p>
        ${
          latest
            ? `<p class="item-list-meta">Latest assessment: ${escapeHtml(latest.checklist?.title || 'Unknown')} · Severity: ${escapeHtml(latest.severity_level || '—')}</p>`
            : '<p class="item-list-meta">No assessments yet.</p>'
        }
        ${
          (report.recommendations || []).length
            ? `<h4 class="panel-title" style="margin-top:1rem">Recent recommendations</h4>
               <ul class="item-list">${report.recommendations
                 .map(
                   (r) => `
                 <li>
                   <p class="item-list-meta">
                     <span class="badge badge-${r.status === 'pending_review' ? 'pending' : r.status}">${escapeHtml(r.status.replace(/_/g, ' '))}</span>
                     · ${formatDate(r.created_at)}
                   </p>
                 </li>`
                 )
                 .join('')}</ul>`
            : ''
        }`;
    } catch (err) {
      loading.hidden = true;
      content.hidden = false;
      content.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function initReports() {
    $('#report-child').addEventListener('change', (e) => {
      loadChildReport(e.target.value);
    });
  }

  /* Utilities */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  function truncate(str, len) {
    if (!str || str.length <= len) return str;
    return `${str.slice(0, len)}…`;
  }

  async function loadStaff() {
    const loading = $('#staff-loading');
    const empty = $('#staff-empty');
    const wrap = $('#staff-table-wrap');
    const tbody = $('#staff-tbody');
    if (!loading || !tbody) return;

    if (!isHeadDoctor()) {
      loading.hidden = true;
      empty.hidden = false;
      empty.querySelector('h3').textContent = 'Restricted';
      empty.querySelector('p').textContent = 'Only Head Doctors can manage staff users.';
      wrap.hidden = true;
      return;
    }

    loading.hidden = false;
    empty.hidden = true;
    wrap.hidden = true;

    try {
      const users = await SmartCareAPI.get('/users');
      const list = Array.isArray(users) ? users : (users.data || []);
      loading.hidden = true;
      if (!list.length) {
        empty.hidden = false;
        return;
      }
      wrap.hidden = false;
      tbody.innerHTML = list.map((u) => {
        const active = u.is_active !== false;
        return `
          <tr>
            <td>
              <strong>${escapeHtml(u.name || '—')}</strong><br>
              <span class="form-hint">${escapeHtml(u.email || u.username || '')}</span>
            </td>
            <td><span class="badge-role">${escapeHtml(formatRole(u.role))}</span></td>
            <td><span class="badge-status${active ? '' : ' badge-status--inactive'}">${active ? 'Active' : 'Inactive'}</span></td>
            <td>—</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      loading.hidden = true;
      empty.hidden = false;
      empty.querySelector('h3').textContent = 'Unable to load staff';
      empty.querySelector('p').textContent = err.message || 'Request failed.';
    }
  }

  async function loadTherapySessions() {
    const loading = $('#therapy-loading');
    const empty = $('#therapy-empty');
    const wrap = $('#therapy-table-wrap');
    const tbody = $('#therapy-tbody');
    if (!loading || !tbody) return;

    loading.hidden = false;
    empty.hidden = true;
    wrap.hidden = true;

    try {
      const sessions = await SmartCareAPI.get('/therapy-sessions');
      const list = Array.isArray(sessions) ? sessions : (sessions.data || []);
      loading.hidden = true;
      if (!list.length) {
        empty.hidden = false;
        return;
      }
      wrap.hidden = false;
      tbody.innerHTML = list.map((s) => `
        <tr>
          <td>${escapeHtml(formatDate(s.scheduled_at))}</td>
          <td>${escapeHtml(s.child ? childName(s.child) : (s.child_id || '—'))}</td>
          <td>${escapeHtml(s.title || s.type || s.session_type || 'Session')}</td>
          <td><span class="status-pill">${escapeHtml(s.status || 'scheduled')}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      loading.hidden = true;
      empty.hidden = false;
      empty.querySelector('p').textContent = err.message || 'Request failed.';
    }
  }

  async function loadMedicationSchedules() {
    const loading = $('#medication-loading');
    const empty = $('#medication-empty');
    const wrap = $('#medication-table-wrap');
    const tbody = $('#medication-tbody');
    if (!loading || !tbody) return;

    loading.hidden = false;
    empty.hidden = true;
    wrap.hidden = true;

    try {
      const rows = await SmartCareAPI.get('/medication-schedules');
      const list = Array.isArray(rows) ? rows : (rows.data || []);
      loading.hidden = true;
      if (!list.length) {
        empty.hidden = false;
        return;
      }
      wrap.hidden = false;
      tbody.innerHTML = list.map((m) => `
        <tr>
          <td>${escapeHtml(m.child ? childName(m.child) : (m.child_id || '—'))}</td>
          <td>${escapeHtml(m.medication_name || m.name || '—')}</td>
          <td>${escapeHtml(m.dosage || '—')}</td>
          <td>${escapeHtml(m.frequency || '—')}</td>
          <td><span class="badge-status${m.is_active === false ? ' badge-status--inactive' : ''}">${m.is_active === false ? 'Inactive' : 'Active'}</span></td>
        </tr>
      `).join('');
    } catch (err) {
      loading.hidden = true;
      empty.hidden = false;
      empty.querySelector('p').textContent = err.message || 'Request failed.';
    }
  }

  async function loadMaterials() {
    const loading = $('#materials-loading');
    const empty = $('#materials-empty');
    const listEl = $('#materials-list');
    if (!loading || !listEl) return;

    loading.hidden = false;
    empty.hidden = true;
    listEl.hidden = true;

    try {
      const rows = await SmartCareAPI.get('/learning-materials');
      const list = Array.isArray(rows) ? rows : (rows.data || []);
      loading.hidden = true;
      if (!list.length) {
        empty.hidden = false;
        return;
      }
      listEl.hidden = false;
      listEl.innerHTML = list.map((m) => `
        <article class="data-card">
          <div class="data-card__top">
            <h4>${escapeHtml(m.title || 'Material')}</h4>
            ${m.category ? `<span class="badge-role">${escapeHtml(m.category)}</span>` : ''}
          </div>
          <p class="data-card__desc">${escapeHtml(truncate(m.description || m.content || 'No description', 140))}</p>
        </article>
      `).join('');
    } catch (err) {
      loading.hidden = true;
      empty.hidden = false;
      empty.querySelector('p').textContent = err.message || 'Request failed.';
    }
  }

  /* Boot */
  async function init() {
    initNav();
    initModals();
    initOverviewActions();
    initCreateChild();
    initChecklistBuilder();
    initChecklistFilters();
    initChecklistMenuDismiss();
    initAssessments();
    initAssessmentViewActions();
    initChildProfile();
    initReports();
    initChildrenSearch();

    await loadMe();
    // Dashboard first: one overview report paints KPIs, charts, and upcoming sessions.
    await loadAnalytics();
    // Defer registry data so Overview stays responsive.
    const defer = window.requestIdleCallback || ((cb) => setTimeout(cb, 120));
    defer(() => {
      loadChildren();
      loadChecklists();
    });
  }

  init();
})();
