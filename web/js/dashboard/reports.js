/** SmartCare dashboard — printable reports (document preview + export) */
(function (SC) {
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;
  const formatRole = SC.formatRole;
  const isHeadDoctor = SC.isHeadDoctor;
  const childName = SC.childName;
  const escapeHtml = SC.escapeHtml;
  const formatDate = SC.formatDate;

  const FACILITY = 'Malvar Assisted Facility and Therapy Center';
  let reportType = 'facility';
  let reportPeriod = 'monthly';
  let childReportCache = null;
  let childReportId = null;
  let childLoading = false;
  let facilityLoading = false;
  let facilityReportCache = null;
  let facilityReportCacheKey = '';
  let medicationLoading = false;
  let medicationReportCache = null;
  let medicationReportCacheKey = '';

  function $(sel) {
    return SC.$(sel);
  }

  function preparedBy() {
    const user = SC.state.currentUser || {};
    const name = user.name || user.username || 'Staff';
    const role = formatRole(user.role);
    return `${name} · ${role}`;
  }

  function generatedAt() {
    return new Date().toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function stampDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function toInputDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function periodBounds(period, ref = new Date()) {
    const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    let start;
    if (period === 'weekly') {
      const day = end.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start = new Date(end);
      start.setDate(end.getDate() - diff);
    } else if (period === 'quarterly') {
      const quarterStartMonth = Math.floor(end.getMonth() / 3) * 3;
      start = new Date(end.getFullYear(), quarterStartMonth, 1);
    } else if (period === 'annually') {
      start = new Date(end.getFullYear(), 0, 1);
    } else {
      // monthly (default)
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    }
    return { from: toInputDate(start), to: toInputDate(end) };
  }

  function periodLabel(period) {
    const map = {
      weekly: 'Weekly',
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      annually: 'Annually',
      custom: 'Custom range',
    };
    return map[period] || 'Custom range';
  }

  function getSelectedRange() {
    const from = $('#report-date-from')?.value || '';
    const to = $('#report-date-to')?.value || '';
    return { from, to, period: reportPeriod };
  }

  function applyPeriodPreset(period, { refresh = true } = {}) {
    reportPeriod = period || 'monthly';
    SC.$$('.report-period-btn').forEach((btn) => {
      const active = btn.dataset.reportPeriod === reportPeriod;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (reportPeriod !== 'custom') {
      const bounds = periodBounds(reportPeriod);
      const fromEl = $('#report-date-from');
      const toEl = $('#report-date-to');
      if (fromEl) fromEl.value = bounds.from;
      if (toEl) toEl.value = bounds.to;
    }

    if (refresh) {
      // Facility aggregates are period-scoped on the API; child reports re-filter client-side.
      facilityReportCache = null;
      facilityReportCacheKey = '';
      medicationReportCache = null;
      medicationReportCacheKey = '';
      refreshPreview();
    }
  }

  function updatePeriodPresetsForReportType() {
    const medicationMode = reportType === 'medication';
    SC.$$('.report-period-btn').forEach((btn) => {
      const period = btn.dataset.reportPeriod;
      const show =
        period === 'custom' ||
        (medicationMode && (period === 'weekly' || period === 'monthly')) ||
        (!medicationMode && (period === 'monthly' || period === 'quarterly' || period === 'annually'));
      btn.hidden = !show;
    });
    if (medicationMode && (reportPeriod === 'quarterly' || reportPeriod === 'annually')) {
      applyPeriodPreset('monthly', { refresh: false });
    } else if (!medicationMode && reportPeriod === 'weekly') {
      applyPeriodPreset('monthly', { refresh: false });
    }
  }

  function inDateRange(iso, from, to) {
    if (!iso) return false;
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return false;
    if (from) {
      const start = new Date(`${from}T00:00:00`).getTime();
      if (!Number.isNaN(start) && time < start) return false;
    }
    if (to) {
      const end = new Date(`${to}T23:59:59.999`).getTime();
      if (!Number.isNaN(end) && time > end) return false;
    }
    return true;
  }

  function rangeQuery() {
    const { from, to } = getSelectedRange();
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  function medicationQuery() {
    const { from, to } = getSelectedRange();
    const params = new URLSearchParams();
    if (reportPeriod === 'weekly' || reportPeriod === 'monthly') {
      params.set('period', reportPeriod);
    }
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  function rangeCaption() {
    const { from, to, period } = getSelectedRange();
    const fromLabel = from ? formatDate(from) : '—';
    const toLabel = to ? formatDate(to) : '—';
    return `${periodLabel(period)} · ${fromLabel} – ${toLabel}`;
  }

  function filterChildReportByRange(report) {
    if (!report) return report;
    const { from, to } = getSelectedRange();
    const assessments = (report.assessments || []).filter((a) => inDateRange(a.created_at, from, to));
    const recommendations = (report.recommendations || []).filter((r) => inDateRange(r.created_at, from, to));
    const upcoming = (report.sessions_upcoming || []).filter((s) => inDateRange(s.scheduled_at, from, to));
    const meds = (report.medication_schedules || []).filter((m) => inDateRange(m.created_at, from, to));
    const plans = report.active_therapy_plans || [];
    const latest = assessments[0] || null;

    return {
      ...report,
      assessments,
      assessments_count: assessments.length,
      latest_assessment: latest,
      recommendations,
      pending_recommendations_count: recommendations.filter((r) => r.status === 'pending_review').length,
      sessions_upcoming: upcoming,
      medication_schedules: meds,
      medication_schedules_active: meds.filter((m) => m.is_active).length,
      active_therapy_plans: plans,
      report_period: {
        label: periodLabel(reportPeriod),
        from,
        to,
      },
    };
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  function prettyStatus(value) {
    return String(value || '—').replace(/_/g, ' ');
  }

  function capitalize(value) {
    const text = String(value || '');
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—';
  }

  function setExportEnabled(on) {
    const pdf = $('#report-export-pdf');
    const csv = $('#report-export-csv');
    if (pdf) pdf.disabled = !on;
    if (csv) csv.disabled = !on;
  }

  function setStage({ loading = false, empty = false, sheet = false, emptyTitle = '', emptyCopy = '' } = {}) {
    const loadingEl = $('#report-loading');
    const emptyEl = $('#report-empty');
    const sheetEl = $('#report-sheet');
    if (loadingEl) {
      loadingEl.hidden = !loading;
      if (loading) loadingEl.textContent = 'Preparing report…';
    }
    if (emptyEl) {
      emptyEl.hidden = !empty;
      if (empty) {
        const title = emptyEl.querySelector('h3');
        const copy = emptyEl.querySelector('p');
        if (title && emptyTitle) title.textContent = emptyTitle;
        if (copy && emptyCopy) copy.textContent = emptyCopy;
      }
    }
    if (sheetEl) sheetEl.hidden = !sheet;
    setExportEnabled(sheet);
  }

  function letterhead(title) {
    return `
      <header class="report-sheet__letterhead">
        <div>
          <p class="report-sheet__brand">SmartCare</p>
          <p class="report-sheet__org">${escapeHtml(FACILITY)}</p>
        </div>
        <p class="report-sheet__mark">Confidential</p>
      </header>
      <h1 class="report-sheet__title">${escapeHtml(title)}</h1>
      <p class="report-sheet__byline">Generated ${escapeHtml(generatedAt())} · Prepared by ${escapeHtml(preparedBy())}</p>
      <p class="report-sheet__period">Reporting period: ${escapeHtml(rangeCaption())}</p>`;
  }

  function sheetFoot() {
    return `<footer class="report-sheet__foot">${escapeHtml(FACILITY)} · Generated ${escapeHtml(generatedAt())}</footer>`;
  }

  function kvTable(rows) {
    if (!rows.length) return '<p class="report-sheet__muted">No records in this section.</p>';
    return `
      <table class="report-table report-table--kv">
        <tbody>
          ${rows
            .map(
              ([label, value]) => `
            <tr>
              <th scope="row">${escapeHtml(label)}</th>
              <td>${value}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  }

  function dataTable(headers, rows) {
    if (!rows.length) return '<p class="report-sheet__muted">No records in this section.</p>';
    return `
      <table class="report-table">
        <thead>
          <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
            .join('')}
        </tbody>
      </table>`;
  }

  function section(title, html) {
    return `
      <section class="report-sheet__section">
        <h2>${escapeHtml(title)}</h2>
        ${html}
      </section>`;
  }

  function renderFacility(report) {
    const sheet = $('#report-sheet');
    if (!sheet || !report) return;
    const roles = report.users_by_role || {};
    const recs = report.recommendations_by_status || {};
    const sessions = report.sessions_by_status || {};
    const upcoming = report.upcoming_sessions || [];

    sheet.innerHTML = `
      ${letterhead('Facility overview report')}
      ${section(
        'Census',
        kvTable([
          ['Children on record', String(report.children_count ?? 0)],
          ['Active children', String(report.children_active ?? 0)],
          ['Staff accounts', String(report.staff_total ?? 0)],
          ['Active checklists', String(report.checklists_total ?? 0)],
          ['Assessments on file', String(report.assessments_total ?? 0)],
        ])
      )}
      ${section(
        'Staff by role',
        dataTable(
          ['Role', 'Accounts'],
          Object.entries(roles).map(([role, count]) => [escapeHtml(formatRole(role)), String(count)])
        )
      )}
      ${section(
        'AI recommendations',
        kvTable([
          ['Pending review', String(recs.pending_review ?? report.pending_recommendations ?? 0)],
          ['Approved', String(recs.approved ?? 0)],
          ['Edited', String(recs.modified ?? 0)],
          ['Rejected', String(recs.rejected ?? 0)],
        ])
      )}
      ${section(
        'Therapy sessions',
        kvTable([
          ['Scheduled (upcoming in period)', String(report.sessions_scheduled_upcoming ?? 0)],
          ['Completed in period', String(report.sessions_completed_this_month ?? 0)],
          ['Scheduled (period)', String(sessions.scheduled ?? 0)],
          ['Completed (period)', String(sessions.completed ?? 0)],
          ['Cancelled (period)', String(sessions.cancelled ?? 0)],
        ])
      )}
      ${section(
        'Upcoming sessions',
        dataTable(
          ['When', 'Child', 'Teacher', 'Status'],
          upcoming.map((s) => [
            escapeHtml(formatDateTime(s.scheduled_at)),
            escapeHtml(s.child ? childName(s.child) : '—'),
            escapeHtml(s.teacher?.name || '—'),
            escapeHtml(prettyStatus(s.status)),
          ])
        )
      )}
      ${sheetFoot()}`;
    setStage({ sheet: true });
  }

  function renderMedication(report) {
    const sheet = $('#report-sheet');
    if (!sheet || !report) return;
    const summary = report.summary || {};
    const doses = summary.doses_by_status || {};
    const rows = report.rows || [];

    sheet.innerHTML = `
      ${letterhead('Medication administration report')}
      ${section(
        'Summary',
        kvTable([
          ['Children who received doses', String(summary.children_given_count ?? 0)],
          ['Total log entries', String(summary.total_logs ?? rows.length)],
          ['Given', String(doses.given ?? 0)],
          ['Missed', String(doses.missed ?? 0)],
          ['Refused', String(doses.refused ?? 0)],
          ['Partial', String(doses.partial ?? 0)],
        ])
      )}
      ${section(
        'Administration log',
        dataTable(
          ['When', 'Child', 'Medication', 'Dosage', 'Status', 'Caretaker'],
          rows.map((row) => [
            escapeHtml(formatDateTime(row.administered_at)),
            escapeHtml(row.child ? childName(row.child) : '—'),
            escapeHtml(row.medicine || '—'),
            escapeHtml(row.dosage || '—'),
            escapeHtml(prettyStatus(row.status)),
            escapeHtml(row.caretaker || '—'),
          ])
        )
      )}
      ${sheetFoot()}`;
    setStage({ sheet: true });
  }

  function assignedStaff(child) {
    const users = child?.users || [];
    if (!users.length) return 'Not recorded';
    return users
      .map((u) => {
        const rel = u.pivot?.relationship || u.role;
        return `${u.name || u.username}${rel ? ` (${formatRole(rel)})` : ''}`;
      })
      .join(', ');
  }

  function renderChild(report) {
    const sheet = $('#report-sheet');
    if (!sheet || !report) return;
    const filtered = filterChildReportByRange(report);
    const child = filtered.child || {};
    const latest = filtered.latest_assessment;
    const assessments = filtered.assessments || [];
    const recs = filtered.recommendations || [];
    const plans = filtered.active_therapy_plans || [];
    const upcoming = filtered.sessions_upcoming || [];
    const meds = filtered.medication_schedules || [];

    const latestBlock = latest
      ? kvTable([
          ['Checklist', escapeHtml(latest.checklist?.title || 'Checklist')],
          ['Severity', escapeHtml(capitalize(latest.severity_level))],
          ['Items scored', `${latest.scored_responses_count ?? 0}/${latest.responses_count ?? 0}`],
          ['Submitted', escapeHtml(formatDate(latest.created_at))],
          ['Recorded by', escapeHtml(latest.psychometrician?.name || latest.psychometrician?.username || '—')],
          ['Notes', escapeHtml(latest.notes || 'None')],
        ])
      : '<p class="report-sheet__muted">No assessments in this date range.</p>';

    sheet.innerHTML = `
      ${letterhead(`Child record · ${childName(child)}`)}
      ${section(
        'Child',
        kvTable([
          ['Name', escapeHtml(childName(child))],
          ['Diagnosis', escapeHtml(child.diagnosis || 'Not recorded')],
          ['Status', child.is_active === false ? 'Inactive' : 'Active'],
          ['Assigned staff', escapeHtml(assignedStaff(child))],
        ])
      )}
      ${section(
        'Caseload summary',
        kvTable([
          ['Assessments in period', String(filtered.assessments_count ?? assessments.length)],
          ['Completed sessions (all-time)', String(filtered.sessions_completed ?? 0)],
          ['Active therapy plans', String(plans.length)],
          ['Medication schedules in period', String(filtered.medication_schedules_active ?? 0)],
          ['Pending AI reviews in period', String(filtered.pending_recommendations_count ?? 0)],
        ])
      )}
      ${section('Latest assessment in period', latestBlock)}
      ${section(
        'Assessment history',
        dataTable(
          ['Date', 'Checklist', 'Severity', 'Scored', 'Recorded by'],
          assessments.map((a) => [
            escapeHtml(formatDate(a.created_at)),
            escapeHtml(a.checklist?.title || 'Checklist'),
            escapeHtml(capitalize(a.severity_level)),
            `${a.scored_responses_count ?? 0}/${a.responses_count ?? 0}`,
            escapeHtml(a.psychometrician?.name || a.psychometrician?.username || '—'),
          ])
        )
      )}
      ${section(
        'AI recommendations',
        dataTable(
          ['Date', 'Checklist', 'Status', 'Reviewer'],
          recs.map((r) => [
            escapeHtml(formatDate(r.created_at)),
            escapeHtml(r.assessment?.checklist?.title || '—'),
            escapeHtml(prettyStatus(r.status)),
            escapeHtml(r.reviewer?.name || r.reviewer?.username || '—'),
          ])
        )
      )}
      ${section(
        'Active therapy plans',
        dataTable(
          ['Plan', 'Teacher', 'Status'],
          plans.map((p) => [
            escapeHtml(p.title || 'Therapy plan'),
            escapeHtml(p.teacher?.name || '—'),
            escapeHtml(prettyStatus(p.status)),
          ])
        )
      )}
      ${section(
        'Upcoming sessions in period',
        dataTable(
          ['When', 'Teacher', 'Status'],
          upcoming.map((s) => [
            escapeHtml(formatDateTime(s.scheduled_at)),
            escapeHtml(s.teacher?.name || '—'),
            escapeHtml(prettyStatus(s.status)),
          ])
        )
      )}
      ${section(
        'Medication schedules',
        dataTable(
          ['Medication', 'Active', 'Created'],
          meds.map((m) => [
            escapeHtml(m.medicine_name || m.medication_name || m.name || 'Schedule'),
            m.is_active ? 'Yes' : 'No',
            escapeHtml(formatDate(m.created_at)),
          ])
        )
      )}
      ${sheetFoot()}`;
    setStage({ sheet: true });
  }

  function csvCell(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function toCsv(tables) {
    return tables
      .map((table) => {
        const lines = [];
        if (table.title) lines.push(csvCell(table.title));
        (table.rows || []).forEach((row) => lines.push(row.map(csvCell).join(',')));
        return lines.join('\n');
      })
      .join('\n\n');
  }

  function downloadCsv(filename, tables) {
    const blob = new Blob([`\ufeff${toCsv(tables)}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function facilityCsv(report) {
    const roles = report.users_by_role || {};
    const recs = report.recommendations_by_status || {};
    const sessions = report.sessions_by_status || {};
    const upcoming = report.upcoming_sessions || [];
    return [
      {
        title: 'Facility overview',
        rows: [
          ['Generated', generatedAt()],
          ['Prepared by', preparedBy()],
          ['Facility', FACILITY],
          ['Reporting period', rangeCaption()],
        ],
      },
      {
        title: 'Census',
        rows: [
          ['Measure', 'Count'],
          ['Children on record', report.children_count ?? 0],
          ['Active children', report.children_active ?? 0],
          ['Staff accounts', report.staff_total ?? 0],
          ['Active checklists', report.checklists_total ?? 0],
          ['Assessments on file', report.assessments_total ?? 0],
        ],
      },
      {
        title: 'Staff by role',
        rows: [['Role', 'Accounts'], ...Object.entries(roles).map(([role, count]) => [formatRole(role), count])],
      },
      {
        title: 'AI recommendations',
        rows: [
          ['Status', 'Count'],
          ['Pending review', recs.pending_review ?? report.pending_recommendations ?? 0],
          ['Approved', recs.approved ?? 0],
          ['Edited', recs.modified ?? 0],
          ['Rejected', recs.rejected ?? 0],
        ],
      },
      {
        title: 'Therapy sessions',
        rows: [
          ['Measure', 'Count'],
          ['Scheduled (upcoming in period)', report.sessions_scheduled_upcoming ?? 0],
          ['Completed in period', report.sessions_completed_this_month ?? 0],
          ['Scheduled (period)', sessions.scheduled ?? 0],
          ['Completed (period)', sessions.completed ?? 0],
          ['Cancelled (period)', sessions.cancelled ?? 0],
        ],
      },
      {
        title: 'Upcoming sessions',
        rows: [
          ['When', 'Child', 'Teacher', 'Status'],
          ...upcoming.map((s) => [
            formatDateTime(s.scheduled_at),
            s.child ? childName(s.child) : '—',
            s.teacher?.name || '—',
            prettyStatus(s.status),
          ]),
        ],
      },
    ];
  }

  function medicationCsv(report) {
    const summary = report.summary || {};
    const doses = summary.doses_by_status || {};
    const rows = report.rows || [];
    return [
      {
        title: 'Medication administration',
        rows: [
          ['Generated', generatedAt()],
          ['Prepared by', preparedBy()],
          ['Facility', FACILITY],
          ['Reporting period', rangeCaption()],
        ],
      },
      {
        title: 'Summary',
        rows: [
          ['Measure', 'Count'],
          ['Children who received doses', summary.children_given_count ?? 0],
          ['Total log entries', summary.total_logs ?? rows.length],
          ['Given', doses.given ?? 0],
          ['Missed', doses.missed ?? 0],
          ['Refused', doses.refused ?? 0],
          ['Partial', doses.partial ?? 0],
        ],
      },
      {
        title: 'Administration log',
        rows: [
          ['When', 'Child', 'Medication', 'Dosage', 'Status', 'Caretaker'],
          ...rows.map((row) => [
            formatDateTime(row.administered_at),
            row.child ? childName(row.child) : '—',
            row.medicine || '—',
            row.dosage || '—',
            prettyStatus(row.status),
            row.caretaker || '—',
          ]),
        ],
      },
    ];
  }

  function childCsv(report) {
    const filtered = filterChildReportByRange(report);
    const child = filtered.child || {};
    const latest = filtered.latest_assessment;
    const assessments = filtered.assessments || [];
    const recs = filtered.recommendations || [];
    const plans = filtered.active_therapy_plans || [];
    const upcoming = filtered.sessions_upcoming || [];
    const meds = filtered.medication_schedules || [];
    return [
      {
        title: `Child record — ${childName(child)}`,
        rows: [
          ['Generated', generatedAt()],
          ['Prepared by', preparedBy()],
          ['Reporting period', rangeCaption()],
          ['Name', childName(child)],
          ['Diagnosis', child.diagnosis || 'Not recorded'],
          ['Status', child.is_active === false ? 'Inactive' : 'Active'],
          ['Assigned staff', assignedStaff(child)],
          ['Assessments on file', filtered.assessments_count ?? assessments.length],
          ['Completed sessions', filtered.sessions_completed ?? 0],
          ['Active therapy plans', plans.length],
          ['Active medication schedules', filtered.medication_schedules_active ?? 0],
        ],
      },
      {
        title: 'Latest assessment',
        rows: latest
          ? [
              ['Field', 'Value'],
              ['Checklist', latest.checklist?.title || 'Checklist'],
              ['Severity', capitalize(latest.severity_level)],
              ['Items scored', `${latest.scored_responses_count ?? 0}/${latest.responses_count ?? 0}`],
              ['Submitted', formatDate(latest.created_at)],
              ['Recorded by', latest.psychometrician?.name || latest.psychometrician?.username || '—'],
              ['Notes', latest.notes || 'None'],
            ]
          : [['Note', 'No assessments submitted yet.']],
      },
      {
        title: 'Assessment history',
        rows: [
          ['Date', 'Checklist', 'Severity', 'Scored', 'Recorded by'],
          ...assessments.map((a) => [
            formatDate(a.created_at),
            a.checklist?.title || 'Checklist',
            capitalize(a.severity_level),
            `${a.scored_responses_count ?? 0}/${a.responses_count ?? 0}`,
            a.psychometrician?.name || a.psychometrician?.username || '—',
          ]),
        ],
      },
      {
        title: 'AI recommendations',
        rows: [
          ['Date', 'Checklist', 'Status', 'Reviewer'],
          ...recs.map((r) => [
            formatDate(r.created_at),
            r.assessment?.checklist?.title || '—',
            prettyStatus(r.status),
            r.reviewer?.name || r.reviewer?.username || '—',
          ]),
        ],
      },
      {
        title: 'Active therapy plans',
        rows: [
          ['Plan', 'Teacher', 'Status'],
          ...plans.map((p) => [p.title || 'Therapy plan', p.teacher?.name || '—', prettyStatus(p.status)]),
        ],
      },
      {
        title: 'Upcoming sessions',
        rows: [
          ['When', 'Teacher', 'Status'],
          ...upcoming.map((s) => [formatDateTime(s.scheduled_at), s.teacher?.name || '—', prettyStatus(s.status)]),
        ],
      },
      {
        title: 'Medication schedules',
        rows: [
          ['Medication', 'Active', 'Created'],
          ...meds.map((m) => [
            m.medicine_name || m.medication_name || m.name || 'Schedule',
            m.is_active ? 'Yes' : 'No',
            formatDate(m.created_at),
          ]),
        ],
      },
    ];
  }

  function exportCsv() {
    const alertEl = $('#report-alert');
    hideAlert(alertEl);
    if (reportType === 'facility') {
      const report = facilityReportCache;
      if (!report) {
        showAlert(alertEl, 'Facility report is not ready yet.', 'error');
        return;
      }
      downloadCsv(`smartcare-facility-overview-${stampDate()}.csv`, facilityCsv(report));
      return;
    }
    if (reportType === 'medication') {
      const report = medicationReportCache;
      if (!report) {
        showAlert(alertEl, 'Medication report is not ready yet.', 'error');
        return;
      }
      downloadCsv(`smartcare-medication-${stampDate()}.csv`, medicationCsv(report));
      return;
    }
    if (!childReportCache) {
      showAlert(alertEl, 'Select a child to export a record.', 'error');
      return;
    }
    const name = childName(childReportCache.child || {})
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    downloadCsv(`smartcare-child-${name || 'record'}-${stampDate()}.csv`, childCsv(childReportCache));
  }

  function exportPdf() {
    const sheet = $('#report-sheet');
    const alertEl = $('#report-alert');
    hideAlert(alertEl);
    if (!sheet || sheet.hidden) {
      showAlert(alertEl, 'Nothing to export yet. Generate a preview first.', 'error');
      return;
    }
    document.body.classList.add('is-printing-report');
    const cleanup = () => document.body.classList.remove('is-printing-report');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.setTimeout(cleanup, 1500);
    window.print();
  }

  function setTypeButtons() {
    SC.$$('.report-type-btn').forEach((btn) => {
      const active = btn.dataset.reportType === reportType;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const childField = $('#report-child-field');
    if (childField) childField.hidden = reportType !== 'child';
    updatePeriodPresetsForReportType();
  }

  function setReportType(next) {
    reportType = next;
    setTypeButtons();
    updatePeriodPresetsForReportType();
    refreshPreview();
  }

  async function ensureFacilityReport({ force = false } = {}) {
    const cacheKey = rangeQuery() || 'all';
    if (!force && facilityReportCache && facilityReportCacheKey === cacheKey) {
      return facilityReportCache;
    }
    const report = await SmartCareAPI.get(`/reports/overview${rangeQuery()}`);
    facilityReportCache = report;
    facilityReportCacheKey = cacheKey;
    return report;
  }

  async function loadFacilityReport({ force = false } = {}) {
    if (!isHeadDoctor()) {
      if (reportType === 'facility') setReportType('child');
      else refreshPreview();
      return;
    }
    if (facilityLoading) return;
    facilityLoading = true;
    setStage({ loading: true });
    try {
      const report = await ensureFacilityReport({ force });
      if (reportType === 'facility') renderFacility(report);
    } catch (err) {
      const loading = $('#report-loading');
      if (loading) {
        loading.hidden = false;
        loading.textContent = `Could not load facility report: ${err.message}`;
      }
      setExportEnabled(false);
    } finally {
      facilityLoading = false;
    }
  }

  async function ensureMedicationReport({ force = false } = {}) {
    const cacheKey = medicationQuery() || 'default';
    if (!force && medicationReportCache && medicationReportCacheKey === cacheKey) {
      return medicationReportCache;
    }
    const report = await SmartCareAPI.get(`/reports/medication${medicationQuery()}`);
    medicationReportCache = report;
    medicationReportCacheKey = cacheKey;
    return report;
  }

  async function loadMedicationReport({ force = false } = {}) {
    if (!isHeadDoctor()) {
      if (reportType === 'medication') setReportType('child');
      else refreshPreview();
      return;
    }
    if (medicationLoading) return;
    medicationLoading = true;
    setStage({ loading: true });
    try {
      const report = await ensureMedicationReport({ force });
      if (reportType === 'medication') renderMedication(report);
    } catch (err) {
      const loading = $('#report-loading');
      if (loading) {
        loading.hidden = false;
        loading.textContent = `Could not load medication report: ${err.message}`;
      }
      setExportEnabled(false);
    } finally {
      medicationLoading = false;
    }
  }

  async function loadChildReport(childId) {
    const alertEl = $('#report-alert');
    hideAlert(alertEl);

    if (!childId) {
      childReportCache = null;
      childReportId = null;
      setStage({
        empty: true,
        emptyTitle: 'Select a child',
        emptyCopy: 'Choose a child to generate a printable record of assessments, therapy, and recommendations.',
      });
      return;
    }

    if (childLoading) return;
    childLoading = true;
    childReportId = childId;
    setStage({ loading: true });

    try {
      const report = await SmartCareAPI.get(`/reports/children/${childId}`);
      if (reportType !== 'child' || $('#report-child')?.value !== String(childId)) return;
      childReportCache = report;
      renderChild(report);
    } catch (err) {
      childReportCache = null;
      setStage({ empty: true, emptyTitle: 'Could not load report', emptyCopy: err.message });
      showAlert(alertEl, err.message, 'error');
    } finally {
      childLoading = false;
    }
  }

  function refreshPreview() {
    const alertEl = $('#report-alert');
    if (alertEl) hideAlert(alertEl);
    setTypeButtons();

    if (reportType === 'facility') {
      if (!isHeadDoctor()) {
        setReportType('child');
        return;
      }
      const cacheKey = rangeQuery() || 'all';
      if (facilityReportCache && facilityReportCacheKey === cacheKey) {
        renderFacility(facilityReportCache);
        return;
      }
      loadFacilityReport({ force: true });
      return;
    }

    if (reportType === 'medication') {
      if (!isHeadDoctor()) {
        setReportType('child');
        return;
      }
      const cacheKey = medicationQuery() || 'default';
      if (medicationReportCache && medicationReportCacheKey === cacheKey) {
        renderMedication(medicationReportCache);
        return;
      }
      loadMedicationReport({ force: true });
      return;
    }

    const childId = $('#report-child')?.value || '';
    if (!childId) {
      setStage({
        empty: true,
        emptyTitle: 'Select a child',
        emptyCopy: 'Choose a child to generate a printable record of assessments, therapy, and recommendations.',
      });
      return;
    }
    if (childReportCache && String(childReportId) === String(childId)) {
      renderChild(childReportCache);
      return;
    }
    loadChildReport(childId);
  }

  function applyReportRoleAccess() {
    const head = isHeadDoctor();
    const facilityBtn = $('#report-type-facility');
    const medicationBtn = $('#report-type-medication');
    if (facilityBtn) facilityBtn.hidden = !head;
    if (medicationBtn) medicationBtn.hidden = !head;
    if (!head && (reportType === 'facility' || reportType === 'medication')) {
      reportType = 'child';
    }
    const hint = $('#report-stage-hint');
    if (hint && SC.isPsychometrician?.()) {
      hint.textContent = 'Export a child assessment record for case review. Choose a child, then export PDF or CSV.';
    }
    setTypeButtons();
  }

  function initReports() {
    SC.$$('.report-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.hidden) return;
        setReportType(btn.dataset.reportType);
      });
    });
    SC.$$('.report-period-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyPeriodPreset(btn.dataset.reportPeriod, { refresh: true });
      });
    });
    const onCustomDateChange = () => {
      reportPeriod = 'custom';
      SC.$$('.report-period-btn').forEach((btn) => {
        const active = btn.dataset.reportPeriod === 'custom';
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      facilityReportCache = null;
      facilityReportCacheKey = '';
      medicationReportCache = null;
      medicationReportCacheKey = '';
      // Keep child cache; re-filter client-side for the new custom range.
      refreshPreview();
    };
    $('#report-date-from')?.addEventListener('change', onCustomDateChange);
    $('#report-date-to')?.addEventListener('change', onCustomDateChange);
    $('#report-child')?.addEventListener('change', (e) => {
      childReportCache = null;
      loadChildReport(e.target.value);
    });
    $('#report-export-pdf')?.addEventListener('click', exportPdf);
    $('#report-export-csv')?.addEventListener('click', exportCsv);
    applyPeriodPreset('monthly', { refresh: false });
    setTypeButtons();
    updatePeriodPresetsForReportType();
  }

  SC.loadFacilityReport = loadFacilityReport;
  SC.loadChildReport = loadChildReport;
  SC.initReports = initReports;
  SC.refreshReportPreview = refreshPreview;
  SC.applyReportRoleAccess = applyReportRoleAccess;
  SC.syncFacilityReportPanel = function (report) {
    // Overview analytics cache stays global; reports keep a period-scoped copy.
    window.__facilityReport = report;
    if (reportType === 'facility' && !rangeQuery()) {
      facilityReportCache = report;
      facilityReportCacheKey = 'all';
      renderFacility(report);
    }
  };
})(window.SmartCareApp);
