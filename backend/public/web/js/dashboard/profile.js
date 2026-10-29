/** SmartCare dashboard — profile */
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
  const formatDateTime = (...args) => SC.formatDateTime(...args);
  const truncate = SC.truncate;

  const patientId = (...args) => SC.patientId(...args);
  const ageBandLabel = (...args) => SC.ageBandLabel(...args);
  const primaryCaretaker = (...args) => SC.primaryCaretaker(...args);
  const stripCaretakerFromNotes = (...args) => SC.stripCaretakerFromNotes(...args);
  const formatSessionTime = (...args) => SC.formatSessionTime(...args);
  const recommendationStatusMeta = (...args) => SC.recommendationStatusMeta(...args);
  const visibleRecommendations = (...args) => SC.visibleRecommendations(...args);
  const recommendationIsLocked = (...args) => SC.recommendationIsLocked(...args);
  const generateLockLabel = (...args) => SC.generateLockLabel(...args);
  const openChildModal = (...args) => SC.openChildModal(...args);
  const openAssessmentView = (...args) => SC.openAssessmentView(...args);
  const loadSubmittedAssessments = (...args) => SC.loadSubmittedAssessments(...args);
  const loadAnalytics = (...args) => SC.loadAnalytics(...args);
  const generateRecommendationForAssessment = (...args) => SC.generateRecommendationForAssessment(...args);

  /* Child clinical profile */
  function setProfileTab(tab) {
    SC.$$('.profile-tab').forEach((btn) => {
      const active = btn.dataset.profileTab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    SC.$$('.profile-pane').forEach((pane) => {
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
    const pendingRec = r.status === 'pending_review';
    const locked = r.status === 'approved' || r.status === 'modified';
    const detailHtml =
      typeof SC.renderRecommendationPayload === 'function'
        ? SC.renderRecommendationPayload(payload)
        : `${payload.developmental_summary ? `<p class="profile-item__body">${escapeHtml(payload.developmental_summary)}</p>` : ''}`;

    return `
      <article class="profile-item ${pendingRec ? 'profile-suggestion' : ''}${locked ? ' is-locked' : ''}" data-rec-id="${r.id}">
        <div class="profile-item__top">
          <h5>${escapeHtml(r.assessment?.checklist?.title || 'AI recommendation')}</h5>
          <span class="badge ${meta.className}">${escapeHtml(meta.label)}</span>
        </div>
        <p class="profile-item__meta">Triggered ${escapeHtml(formatDateTime(r.created_at))}${r.reviewed_at ? ` · Reviewed ${escapeHtml(formatDateTime(r.reviewed_at))}` : ''}${r.status === 'modified' ? ' · Edited by reviewer (not AI-only)' : ''}</p>
        ${locked ? '<p class="form-hint">Accepted recommendations are locked. Generate is unavailable for this assessment.</p>' : ''}
        ${detailHtml}
        ${r.teacher_notes ? `<p class="profile-item__meta"><strong>Review notes:</strong> ${escapeHtml(r.teacher_notes)}</p>` : ''}
        ${r.therapy_plan ? `<p class="profile-item__meta"><strong>Therapy plan:</strong> ${escapeHtml(String(r.therapy_plan.title || '').replace(/^Therapy plan:\s*/i, '') || 'Learning support plan')} (${escapeHtml(r.therapy_plan.status)})</p>` : ''}
        ${
          showActions && pendingRec && canReviewRecommendations()
            ? `<div class="profile-item__actions">
                <details class="rec-edit" data-rec-edit="${r.id}">
                  <summary class="btn btn-secondary rec-edit__summary">Edit / customize before approving</summary>
                  <div class="rec-edit__body">
                    <p class="rec-edit__intro">Adjust the AI plan, then save to approve with your edits.</p>
                    <div class="rec-edit__grid">
                      <label class="rec-edit__field rec-edit__field--full">
                        <span class="rec-edit__label">Developmental summary</span>
                        <textarea class="field-control" data-rec-field="developmental_summary" rows="4" placeholder="Overall developmental picture for this child…">${escapeHtml(payload.developmental_summary || '')}</textarea>
                      </label>
                      <label class="rec-edit__field rec-edit__field--full">
                        <span class="rec-edit__label">Assessment basis</span>
                        <textarea class="field-control" data-rec-field="clinical_basis" rows="3" placeholder="What in the scores / observations supports this plan…">${escapeHtml(payload.clinical_basis || '')}</textarea>
                      </label>
                      <label class="rec-edit__field">
                        <span class="rec-edit__label">Focus areas</span>
                        <span class="rec-edit__hint">Comma-separated</span>
                        <input class="field-control" data-rec-field="focus_areas" placeholder="e.g. Communication, Fine motor, Social play" value="${escapeHtml((payload.focus_areas || []).filter((x) => typeof x === 'string').join(', '))}">
                      </label>
                      <label class="rec-edit__field">
                        <span class="rec-edit__label">Interventions</span>
                        <span class="rec-edit__hint">One per line</span>
                        <textarea class="field-control" data-rec-field="intervention_suggestions" rows="5" placeholder="List each suggested intervention on its own line…">${escapeHtml((payload.intervention_suggestions || []).filter((x) => typeof x === 'string').join('\n'))}</textarea>
                      </label>
                    </div>
                    <div class="rec-edit__materials" data-rec-materials="${r.id}">
                      <p class="form-hint">Open to load learning materials…</p>
                    </div>
                    <div class="rec-edit__footer">
                      <button type="button" class="btn btn-primary" data-review-rec="${r.id}" data-review-status="modified">Save edits &amp; approve</button>
                    </div>
                  </div>
                </details>
                <textarea class="field-control profile-notes" data-rec-notes="${r.id}" placeholder="Optional review notes"></textarea>
                <button type="button" class="btn btn-primary" data-review-rec="${r.id}" data-review-status="approved">Accept</button>
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
    const recs = visibleRecommendations(report.recommendations || []);
    const featuredRec = recs.find((r) => r.status === 'pending_review') || recs[0] || null;
    const scoredTrend = trend.filter((p) => p.average_score != null);
    const latestAvg = scoredTrend.length ? scoredTrend[scoredTrend.length - 1].average_score : null;

    SC.$('#modal-child-profile-title').textContent = childName(child);
    SC.$('#modal-child-profile-meta').textContent = `${patientId(child)} · ${child.diagnosis || 'No diagnosis'} · Age ${ageBandLabel(child.age_band)}`;

    const name = childName(child);
    const initials = initialsFromName(name);
    const photoUrl = child.photo_url || child.avatar_url || child.profile_photo || '';
    const active = child.is_active !== false;
    const photoHtml = photoUrl
      ? `<img class="profile-photo-frame__img" src="${escapeHtml(photoUrl)}" alt="">`
      : `<span class="profile-photo-frame__initials">${escapeHtml(initials)}</span>`;

    SC.$('#child-profile-summary').innerHTML = `
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

    const photoImg = SC.$('#child-profile-summary')?.querySelector('.profile-photo-frame__img');
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

    const overview = SC.$(`.profile-pane[data-profile-pane="overview"]`);
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
               ${
                 report.latest_assessment && canSubmitAssessments() && !recommendationIsLocked(report.latest_assessment.ai_recommendations)
                   ? `<div class="profile-item__actions"><button type="button" class="btn btn-accent" data-generate-from-profile="${report.latest_assessment.id}" data-child-id="${child.id}">Generate AI recommendation</button></div>`
                   : ''
               }`
        }
      </div>
      <div class="profile-details-grid">
        <div class="profile-block">
          <h4>Patient details</h4>
          <p class="profile-item__meta"><strong>Status:</strong> ${child.is_active !== false ? 'Active' : 'Inactive'}</p>
          <p class="profile-item__meta"><strong>Diagnosis:</strong> ${escapeHtml(child.diagnosis || 'Not specified')}</p>
          <p class="profile-item__meta"><strong>Sex:</strong> ${escapeHtml(child.sex || '—')}</p>
          <p class="profile-item__meta"><strong>Birth date:</strong> ${escapeHtml(child.birth_date ? String(child.birth_date).slice(0, 10) : '—')}</p>
          <p class="profile-item__meta"><strong>Caretaker:</strong> ${escapeHtml(primaryCaretaker(child))}</p>
          <p class="profile-item__meta"><strong>Notes:</strong> ${escapeHtml(stripCaretakerFromNotes(child.condition_notes || '') || '—')}</p>
          ${canManageChildren() ? `<div id="child-diagnosis-history" class="profile-diagnosis-history"><p class="profile-item__meta">Loading diagnosis history…</p></div>` : ''}
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

    const assessmentsPane = SC.$(`.profile-pane[data-profile-pane="assessments"]`);
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
                    const visibleRecs = visibleRecommendations(a.ai_recommendations);
                    const locked = recommendationIsLocked(a.ai_recommendations);
                    const point = trend.find((p) => String(p.assessment_id) === String(a.id));
                    const domainBits = (point?.domain_averages || [])
                      .slice(0, 3)
                      .map((d) => `${d.domain} ${d.average}`)
                      .join(' · ');
                    const tip = (visibleRecs[0]?.openai_response_json || {}).developmental_summary;
                    const generateLabel = generateLockLabel(a.ai_recommendations).replace(' recommendation', '');
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
                        <button type="button" class="btn btn-accent" data-generate-from-profile="${a.id}" data-child-id="${child.id}" ${locked || !canSubmitAssessments() ? 'disabled' : ''}>
                          ${escapeHtml(generateLabel)}
                        </button>
                      </div>
                    </article>`;
                  })
                  .join('')
              : '<p class="profile-empty">No assessments yet for this child.</p>'
          }
        </div>
      </div>`;

    renderProfileRecommendationsPane(report, { resetPages: true });

    const medsPane = SC.$(`.profile-pane[data-profile-pane="medications"]`);
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
                    <p class="profile-item__meta">Dosage: ${escapeHtml(m.dosage || '—')} · Time: ${escapeHtml((Array.isArray(m.times_of_day) && m.times_of_day.length ? m.times_of_day : [m.time_of_day]).filter(Boolean).join(', ') || '—')}</p>
                  <p class="profile-item__meta">${escapeHtml(m.instructions || 'No special instructions')}</p>
                </article>`
                  )
                  .join('')
              : '<p class="profile-empty">No medication schedules for this child.</p>'
          }
        </div>
      </div>`;

    const materialsPane = SC.$(`.profile-pane[data-profile-pane="materials"]`);
    const recommended = report.recommended_materials || [];
    materialsPane.innerHTML = `
      <div class="profile-block">
        <h4>Learning materials for this child</h4>
        <p class="profile-empty" style="margin-top:0">Only materials linked through AI review or assigned to this patient are shown.</p>
        <div class="profile-list">
          ${recommended.length ? recommended.map(materialCardHtml).join('') : '<p class="profile-empty">No learning materials assigned to this child yet.</p>'}
        </div>
      </div>`;

    renderProfileProgressPane(report, { resetPages: true });
    if (canManageChildren() && child.id) {
      loadDiagnosisHistory(child.id);
    }
  }

  async function loadDiagnosisHistory(childId) {
    const wrap = SC.$('#child-diagnosis-history');
    if (!wrap) return;
    try {
      const history = await SmartCareAPI.get(`/children/${childId}/diagnosis-history`);
      const rows = Array.isArray(history) ? history : [];
      if (!rows.length) {
        wrap.innerHTML = '<p class="profile-item__meta"><strong>Diagnosis history:</strong> No changes recorded yet.</p>';
        return;
      }
      wrap.innerHTML = `
        <h5 class="profile-item__meta" style="margin:12px 0 6px"><strong>Diagnosis history</strong></h5>
        <div class="profile-list">
          ${rows
            .slice(0, 8)
            .map(
              (h) => `
            <article class="profile-item">
              <div class="profile-item__top">
                <h5>${escapeHtml(h.new_diagnosis || 'Cleared')}</h5>
                <span class="badge badge-neutral">${escapeHtml(formatDateTime(h.created_at))}</span>
              </div>
              <p class="profile-item__meta">
                From ${escapeHtml(h.previous_diagnosis || 'Not specified')}
                · By ${escapeHtml(h.changer?.name || 'Staff')}
                ${h.assessment_id ? ` · Assessment #${escapeHtml(String(h.assessment_id))}` : ''}
              </p>
              ${h.note ? `<p class="profile-item__body">${escapeHtml(h.note)}</p>` : ''}
            </article>`
            )
            .join('')}
        </div>`;
    } catch (_) {
      wrap.innerHTML = '<p class="profile-item__meta"><strong>Diagnosis history:</strong> Unable to load.</p>';
    }
  }

  const PROFILE_LIST_PAGE_SIZE = 5;
  const AI_RECS_PAGE_SIZE = 3;
  let parentUpdatesPage = 1;
  let teacherProgressPage = 1;
  let aiRecsPage = 1;

  function profileListPagerHtml(listKey, pageData) {
    if (pageData.total <= pageData.pageSize) return '';
    return `
      <nav class="list-pagination profile-list-pagination" aria-label="Pagination">
        <button type="button" class="btn btn-secondary btn-sm" data-profile-page="${listKey}" data-page-dir="-1"${pageData.page <= 1 ? ' disabled' : ''}>Previous</button>
        <p class="list-pagination__meta">Page ${pageData.page} of ${pageData.totalPages} · Showing ${pageData.from}–${pageData.to} of ${pageData.total}</p>
        <button type="button" class="btn btn-secondary btn-sm" data-profile-page="${listKey}" data-page-dir="1"${pageData.page >= pageData.totalPages ? ' disabled' : ''}>Next</button>
      </nav>`;
  }

  function parentUpdateCardHtml(f) {
    const status = f.status || 'open';
    const canRespond = !isParentRole();
    return `
      <article class="profile-item" data-feedback-id="${f.id || ''}">
        <div class="profile-item__top">
          <h5>${escapeHtml(f.subject || 'Parent feedback')}</h5>
          <span class="badge badge-neutral">${escapeHtml(status)} · ${escapeHtml(formatDate(f.created_at))}</span>
        </div>
        <p class="profile-item__meta">From ${escapeHtml(f.parent?.name || 'Parent')}${f.category ? ` · ${escapeHtml(f.category)}` : ''}</p>
        <p class="profile-item__body">${escapeHtml(f.message || 'No message')}</p>
        ${
          f.staff_response
            ? `<p class="profile-item__meta"><strong>Staff response:</strong> ${escapeHtml(f.staff_response)}${
                f.responder?.name ? ` — ${escapeHtml(f.responder.name)}` : ''
              }</p>`
            : ''
        }
        ${
          canRespond && f.id
            ? `<div class="profile-item__actions">
                ${status === 'open' ? `<button type="button" class="btn btn-secondary btn-sm" data-feedback-status="${f.id}" data-status="acknowledged">Acknowledge</button>` : ''}
                ${status !== 'addressed' ? `<button type="button" class="btn btn-primary btn-sm" data-feedback-respond="${f.id}">Respond</button>` : ''}
              </div>`
            : ''
        }
      </article>`;
  }

  function isParentRole() {
    const role = SC.state?.user?.role;
    const value = typeof role === 'object' ? role?.value : role;
    return String(value || '') === 'parent';
  }

  function teacherProgressCardHtml(p) {
    return `
      <article class="profile-item">
        <div class="profile-item__top">
          <h5>${escapeHtml(p.title || 'Progress note')}</h5>
          <span class="badge badge-neutral">${escapeHtml(formatDate(p.recorded_on || p.created_at))}</span>
        </div>
        <p class="profile-item__meta">${escapeHtml(p.recorder?.name || 'Care team')}${p.milestone ? ` · ${escapeHtml(p.milestone)}` : ''}</p>
        <p class="profile-item__body">${escapeHtml(p.summary || p.milestone || 'No details')}</p>
      </article>`;
  }

  function renderProfileProgressPane(report, { resetPages = false } = {}) {
    const progressPane = SC.$(`.profile-pane[data-profile-pane="progress"]`);
    if (!progressPane) return;

    if (resetPages) {
      parentUpdatesPage = 1;
      teacherProgressPage = 1;
    }

    const progress = report.progress_records || [];
    const parentUpdates = report.parent_feedback || [];
    const plans = report.active_therapy_plans || [];
    const childId = report.child?.id || SC.state.childProfileId;

    const parentPage = SC.paginate(parentUpdates, parentUpdatesPage, PROFILE_LIST_PAGE_SIZE);
    parentUpdatesPage = parentPage.page;
    const teacherPage = SC.paginate(progress, teacherProgressPage, PROFILE_LIST_PAGE_SIZE);
    teacherProgressPage = teacherPage.page;

    const composeHtml = isHeadDoctor()
      ? `
      <div class="profile-block">
        <div class="profile-item__top" style="margin-bottom:0.75rem">
          <h4 style="margin:0">Send to parent</h4>
          <button type="button" class="btn btn-primary btn-sm" id="profile-open-progress-update" data-child-id="${childId || ''}">
            Send progress update
          </button>
        </div>
        <p class="profile-empty" style="margin:0">Parents see these notes on their mobile Progress tab. Teachers and caretakers are notified too.</p>
      </div>`
      : '';

    progressPane.innerHTML = `
      ${composeHtml}
      <div class="profile-block" id="profile-parent-updates">
        <h4>Parent feedback</h4>
        <p class="profile-empty" style="margin-top:0">Feedback from parents or guardians after facility visits or reviewing progress.</p>
        <div class="profile-list">
          ${
            parentUpdates.length
              ? parentPage.items.map(parentUpdateCardHtml).join('')
              : '<p class="profile-empty">No parent feedback yet.</p>'
          }
        </div>
        ${profileListPagerHtml('parent-updates', parentPage)}
      </div>
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
      <div class="profile-block" id="profile-teacher-progress">
        <h4>Teacher & care progress</h4>
        <div class="profile-list">
          ${
            progress.length
              ? teacherPage.items.map(teacherProgressCardHtml).join('')
              : '<p class="profile-empty">No progress records yet.</p>'
          }
        </div>
        ${profileListPagerHtml('teacher-progress', teacherPage)}
      </div>`;
  }

  function renderProfileRecommendationsPane(report, { resetPages = false } = {}) {
    const recsPane = SC.$(`.profile-pane[data-profile-pane="recommendations"]`);
    if (!recsPane) return;

    if (resetPages) aiRecsPage = 1;

    const recs = visibleRecommendations(report.recommendations || []);
    const pageData = SC.paginate(recs, aiRecsPage, AI_RECS_PAGE_SIZE);
    aiRecsPage = pageData.page;

    recsPane.innerHTML = `
      <div class="profile-block" id="profile-ai-recommendations">
        <h4>AI recommendations</h4>
        <p class="form-hint">Pending suggestions appear here and on Overview. Accepting creates an active therapy plan linked to this child.</p>
        <div class="profile-list">
          ${
            recs.length
              ? pageData.items.map((r) => recommendationCardHtml(r)).join('')
              : '<p class="profile-empty">No AI recommendations yet. Generate one from an assessment.</p>'
          }
        </div>
        ${profileListPagerHtml('ai-recs', pageData)}
      </div>`;
  }

  function focusParentFeedback(feedbackId) {
    if (!feedbackId) return;
    const id = String(feedbackId).replace(/"/g, '');
    const target = SC.$(`#child-profile-content [data-feedback-id="${id}"]`);
    if (!target) return;
    target.classList.add('is-highlight');
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => target.classList.remove('is-highlight'), 2400);
  }

  async function openChildProfile(childId, tab = 'overview', options = {}) {
    const feedbackId = options?.feedbackId || null;
    SC.state.childProfileId = childId;
    const alertEl = SC.$('#child-profile-alert');
    const loading = SC.$('#child-profile-loading');
    const content = SC.$('#child-profile-content');
    hideAlert(alertEl);
    loading.hidden = false;
    content.hidden = true;
    openModal('modal-child-profile');
    setProfileTab(tab);

    try {
      const report = await SmartCareAPI.get(`/reports/children/${childId}`);
      SC.state.childProfileCache = report;
      SC.state.childProfileReport = report;
      renderChildProfile(report);
      loading.hidden = true;
      content.hidden = false;
      if (typeof SC.hydrateRecommendationMaterialPickers === 'function') {
        await SC.hydrateRecommendationMaterialPickers(content);
      }
      const editBtn = SC.$('#child-profile-edit-btn');
      const assessBtn = SC.$('#child-profile-assess-btn');
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
          const nav = SC.$('.nav-link[data-section="assessments"]');
          if (nav) nav.click();
          const select = SC.$('#assessment-child');
          if (select) select.value = String(childId);
          openModal('modal-assessment');
        };
      }
      if (feedbackId) {
        window.requestAnimationFrame(() => focusParentFeedback(feedbackId));
      }
    } catch (err) {
      loading.hidden = true;
      showAlert(alertEl, err.message || 'Could not load child profile.', 'error');
    }
  }

  async function reviewRecommendation(recId, status) {
    const alertEl = SC.$('#child-profile-alert');
    const notes = SC.$(`[data-rec-notes="${recId}"]`)?.value.trim() || null;
    hideAlert(alertEl);
    try {
      const report = SC.state.childProfileReport;
      const existing = (report?.recommendations || []).find((r) => String(r.id) === String(recId));
      const edits =
        typeof SC.collectRecommendationEdits === 'function'
          ? SC.collectRecommendationEdits(recId, existing?.openai_response_json || {})
          : { openai_response_json: null, learning_material_ids: undefined };
      const payload = {
        status,
        teacher_notes: notes,
      };
      if (status === 'modified' || edits.openai_response_json) {
        payload.openai_response_json = edits.openai_response_json || existing?.openai_response_json || {};
      }
      if (edits.learning_material_ids !== undefined) {
        payload.learning_material_ids = edits.learning_material_ids;
      }
      await SmartCareAPI.post(`/recommendations/${recId}/review`, payload);
      const label = status === 'approved' ? 'accepted' : status === 'modified' ? 'saved as edited' : 'rejected';
      showAlert(alertEl, `AI recommendation ${label}.`, 'success');
      if (SC.state.childProfileId) {
        const activeTab = SC.$('.profile-tab.is-active')?.dataset?.profileTab || 'overview';
        await openChildProfile(SC.state.childProfileId, activeTab);
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
    SC.$$('.profile-tab').forEach((btn) => {
      btn.addEventListener('click', () => setProfileTab(btn.dataset.profileTab));
    });

    SC.$('#child-profile-content')?.addEventListener('toggle', async (e) => {
      const details = e.target.closest('details.rec-edit');
      if (!details?.open) return;
      if (typeof SC.hydrateRecommendationMaterialPickers === 'function') {
        await SC.hydrateRecommendationMaterialPickers(details);
      }
    });

    SC.$('#child-profile-content')?.addEventListener('click', async (e) => {
      const pageBtn = e.target.closest('[data-profile-page]');
      if (pageBtn && !pageBtn.disabled) {
        const listKey = pageBtn.getAttribute('data-profile-page');
        const dir = Number(pageBtn.getAttribute('data-page-dir')) || 0;
        const report = SC.state.childProfileReport || SC.state.childProfileCache;
        if (listKey === 'parent-updates') {
          parentUpdatesPage += dir;
          if (report) renderProfileProgressPane(report);
        } else if (listKey === 'teacher-progress') {
          teacherProgressPage += dir;
          if (report) renderProfileProgressPane(report);
        } else if (listKey === 'ai-recs') {
          aiRecsPage += dir;
          if (report) renderProfileRecommendationsPane(report);
        }
        return;
      }

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
        const childId = generateBtn.getAttribute('data-child-id') || SC.state.childProfileId;
        const alertEl = SC.$('#child-profile-alert');
        const rec = await generateRecommendationForAssessment(childId, assessmentId, generateBtn, alertEl);
        if (rec && SC.state.childProfileId) {
          await openChildProfile(SC.state.childProfileId, 'overview');
        }
        return;
      }

      const statusBtn = e.target.closest('[data-feedback-status]');
      if (statusBtn) {
        const feedbackId = statusBtn.getAttribute('data-feedback-status');
        const status = statusBtn.getAttribute('data-status') || 'acknowledged';
        const alertEl = SC.$('#child-profile-alert');
        try {
          await SC.withBusy({ button: statusBtn, busyLabel: 'Saving…' }, async () => {
            await SmartCareAPI.patch(`/parent-feedback/${feedbackId}`, { status });
          });
          showAlert(alertEl, 'Parent feedback acknowledged.', 'success');
          if (SC.state.childProfileId) await openChildProfile(SC.state.childProfileId, 'progress');
        } catch (err) {
          showAlert(alertEl, err.message || 'Could not update feedback.', 'error');
        }
        return;
      }

      const respondBtn = e.target.closest('[data-feedback-respond]');
      if (respondBtn) {
        const feedbackId = respondBtn.getAttribute('data-feedback-respond');
        const response = window.prompt('Staff response to parent feedback:');
        if (response == null) return;
        const alertEl = SC.$('#child-profile-alert');
        try {
          await SC.withBusy({ button: respondBtn, busyLabel: 'Saving…' }, async () => {
            await SmartCareAPI.patch(`/parent-feedback/${feedbackId}`, {
              status: 'addressed',
              staff_response: response.trim() || null,
            });
          });
          showAlert(alertEl, 'Response saved on parent feedback.', 'success');
          if (SC.state.childProfileId) await openChildProfile(SC.state.childProfileId, 'progress');
        } catch (err) {
          showAlert(alertEl, err.message || 'Could not save response.', 'error');
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

  SC.setProfileTab = setProfileTab;
  SC.materialCardHtml = materialCardHtml;
  SC.renderPerformanceLine = renderPerformanceLine;
  SC.renderDomainBars = renderDomainBars;
  SC.recommendationCardHtml = recommendationCardHtml;
  SC.renderChildProfile = renderChildProfile;
  SC.renderProfileProgressPane = renderProfileProgressPane;
  SC.renderProfileRecommendationsPane = renderProfileRecommendationsPane;
  SC.openChildProfile = openChildProfile;
  SC.reviewRecommendation = reviewRecommendation;
  SC.initChildProfile = initChildProfile;
})(window.SmartCareApp);
