/** SmartCare dashboard — assessments */
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

  const populateChildSelects = (...args) => SC.populateChildSelects(...args);
  const openChildProfile = (...args) => SC.openChildProfile(...args);
  const loadChildren = (...args) => SC.loadChildren(...args);

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
    const wrap = SC.$('#assessment-responses-wrap');
    const container = SC.$('#assessment-responses');

    if (!checklistId) {
      wrap.hidden = true;
      container.innerHTML = '';
      return;
    }

    let checklist = SC.state.checklistsCache.find((c) => String(c.id) === String(checklistId));
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
    return Array.from(SC.$('#assessment-responses').querySelectorAll('.response-row')).map((row) => ({
      checklist_item_id: parseInt(row.dataset.itemId, 10),
      score: row.querySelector('.response-score').value || null,
      comment: row.querySelector('.response-comment').value.trim() || null,
    }));
  }

  function hideDiagnosisStep() {
    const step = SC.$('#assessment-diagnosis-step');
    const form = SC.$('#submit-assessment-form');
    const footer = SC.$('#assessment-modal-footer');
    if (step) step.hidden = true;
    if (form) form.hidden = false;
    if (footer) footer.hidden = false;
  }

  async function openDiagnosisStep(childId, assessmentId) {
    const step = SC.$('#assessment-diagnosis-step');
    const form = SC.$('#submit-assessment-form');
    const footer = SC.$('#assessment-modal-footer');
    if (!step) return;

    let child = (SC.state.childrenCache || []).find((c) => String(c.id) === String(childId));
    if (!child) {
      try {
        child = await SmartCareAPI.get(`/children/${childId}`);
      } catch (_) {
        child = null;
      }
    }

    const valueInput = SC.$('#assessment-diagnosis-value');
    const noteInput = SC.$('#assessment-diagnosis-note');
    if (valueInput) valueInput.value = child?.diagnosis || '';
    if (noteInput) noteInput.value = '';
    SC.state.lastAssessmentChildId = childId;
    SC.state.lastAssessmentId = assessmentId || SC.state.lastAssessmentId || null;

    if (form) form.hidden = true;
    if (footer) footer.hidden = true;
    step.hidden = false;
  }

  function initAssessments() {
    SC.consumePendingAssessmentChecklist?.();

    SC.$('#assessment-checklist')?.addEventListener('change', (e) => {
      loadChecklistResponses(e.target.value);
    });

    SC.$('#submit-assessment-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canSubmitAssessments()) return;

      const alertEl = SC.$('#assessment-alert');
      hideAlert(alertEl);

      const childId = SC.$('#assessment-child').value;
      const checklistId = SC.$('#assessment-checklist').value;
      const responses = collectResponses();

      if (!responses.length) {
        showAlert(alertEl, 'Select a checklist with items to score.', 'error');
        return;
      }

      const payload = {
        checklist_id: parseInt(checklistId, 10),
        severity_level: SC.$('#assessment-severity').value || null,
        notes: SC.$('#assessment-notes').value.trim() || null,
        responses,
      };

      const submitBtn = e.submitter
        || document.querySelector('#modal-assessment button[type=submit][form="submit-assessment-form"]')
        || e.target.querySelector('button[type=submit]');

      try {
        await SC.withBusy({ button: submitBtn, busyLabel: 'Submitting…' }, async () => {
          const created = await SmartCareAPI.post(`/children/${childId}/assessments`, payload);
          SC.state.lastAssessmentChildId = childId;
          SC.state.lastAssessmentId = created?.id || null;
          await loadSubmittedAssessments({ force: true });
          showAlert(alertEl, 'Assessment submitted successfully. You can update the diagnosis next.', 'success');
          SC.$('#generate-rec-btn').disabled = false;
          await openDiagnosisStep(childId, created?.id || null);
        });
      } catch (err) {
        showAlert(alertEl, err.message, 'error');
      }
    });

    SC.$('#assessment-diagnosis-skip')?.addEventListener('click', () => hideDiagnosisStep());
    SC.$('#assessment-diagnosis-save')?.addEventListener('click', async () => {
      const alertEl = SC.$('#assessment-alert');
      const childId = SC.state.lastAssessmentChildId;
      if (!childId) return;
      const diagnosis = SC.$('#assessment-diagnosis-value')?.value?.trim() || null;
      const note = SC.$('#assessment-diagnosis-note')?.value?.trim() || null;
      const btn = SC.$('#assessment-diagnosis-save');
      try {
        await SC.withBusy({ button: btn, busyLabel: 'Saving…' }, async () => {
          await SmartCareAPI.patch(`/children/${childId}/diagnosis`, {
            diagnosis,
            assessment_id: SC.state.lastAssessmentId ? Number(SC.state.lastAssessmentId) : undefined,
            note,
          });
          if (SC.state.childrenCache) {
            const child = SC.state.childrenCache.find((c) => String(c.id) === String(childId));
            if (child) child.diagnosis = diagnosis;
          }
          hideDiagnosisStep();
          showAlert(alertEl, 'Diagnosis updated on the child profile.', 'success');
        });
      } catch (err) {
        showAlert(alertEl, err.message, 'error');
      }
    });

    SC.$('#generate-rec-btn')?.addEventListener('click', async () => {
      const alertEl = SC.$('#assessment-alert');
      const childId = SC.$('#assessment-child').value || SC.state.lastAssessmentChildId;

      if (!childId) {
        showAlert(alertEl, 'Select a child first.', 'error');
        return;
      }

      const btn = SC.$('#generate-rec-btn');
      const lastAssessment = (SC.state.assessmentsCache || []).find(
        (a) => String(a.id) === String(SC.state.lastAssessmentId)
      );
      if (recommendationIsLocked(lastAssessment?.ai_recommendations)) {
        showAlert(alertEl, 'This assessment already has an AI recommendation that is pending review or approved.', 'error');
        return;
      }

      try {
        await SC.withBusy({ button: btn, busyLabel: 'Generating…' }, async () => {
          await SmartCareAPI.post(`/children/${childId}/recommendations/generate`, {
            assessment_id: SC.state.lastAssessmentId ? Number(SC.state.lastAssessmentId) : undefined,
          });
          showAlert(alertEl, 'AI recommendation generated.', 'success');
          await loadSubmittedAssessments({ force: true });
          if (SC.state.lastAssessmentId) openAssessmentView(SC.state.lastAssessmentId);
        });
      } catch (err) {
        showAlert(alertEl, err.message, 'error');
      }
    });

    SC.$('#assessments-filter-mine')?.addEventListener('change', () => {
      assessmentRecordsPage = 1;
      childAssessmentPages.clear();
      renderSubmittedAssessments();
    });

    SC.$('#assessments-search')?.addEventListener('input', () => {
      assessmentRecordsPage = 1;
      childAssessmentPages.clear();
      renderSubmittedAssessments();
    });

    SC.$('#assessments-page-prev')?.addEventListener('click', () => {
      if (assessmentRecordsPage <= 1) return;
      assessmentRecordsPage -= 1;
      renderSubmittedAssessments({ scrollToTop: true });
    });

    SC.$('#assessments-page-next')?.addEventListener('click', () => {
      const totalPages = Math.max(
        1,
        Math.ceil(groupAssessmentsByChild(getFilteredAssessments()).length / ASSESSMENT_PAGE_SIZE) || 1
      );
      if (assessmentRecordsPage >= totalPages) return;
      assessmentRecordsPage += 1;
      renderSubmittedAssessments({ scrollToTop: true });
    });
  }

  /* Submitted assessments */
  function visibleRecommendations(recs) {
    return (Array.isArray(recs) ? recs : []).filter((r) => r.status !== 'rejected');
  }

  function recommendationIsLocked(recs) {
    return visibleRecommendations(recs).some((r) =>
      ['pending_review', 'approved', 'modified'].includes(r.status)
    );
  }

  function generateLockLabel(recs) {
    const list = visibleRecommendations(recs);
    if (list.some((r) => r.status === 'pending_review')) return 'Pending review';
    if (list.some((r) => r.status === 'approved' || r.status === 'modified')) return 'AI approved';
    return 'Generate AI recommendation';
  }

  function recommendationStatusMeta(recs) {
    const list = visibleRecommendations(recs);
    if (!list.length) {
      return { label: 'No AI recommendation', className: 'badge-neutral' };
    }
    const latest = list[0];
    const status = latest.status || 'pending_review';
    const map = {
      pending_review: { label: 'Pending AI review', className: 'badge-pending' },
      approved: { label: 'AI approved', className: 'badge-approved' },
      modified: { label: 'Edited', className: 'badge-modified' },
    };
    return map[status] || { label: String(status).replace(/_/g, ' '), className: 'badge-neutral' };
  }

  function renderRecommendationPayload(payload) {
    const summary = payload.developmental_summary || payload.summary || '';
    const clinicalBasis = payload.clinical_basis || '';
    const strengths = Array.isArray(payload.strengths) ? payload.strengths : [];
    const focusAreas = Array.isArray(payload.focus_areas) ? payload.focus_areas : [];
    const goals = Array.isArray(payload.priority_goals) ? payload.priority_goals : [];
    const activities = Array.isArray(payload.suggested_activities) ? payload.suggested_activities : [];
    const interventions = Array.isArray(payload.intervention_suggestions) ? payload.intervention_suggestions : [];
    const homeStrategies = Array.isArray(payload.home_school_strategies) ? payload.home_school_strategies : [];
    const monitoring = Array.isArray(payload.progress_monitoring) ? payload.progress_monitoring : [];
    const session = payload.session_structure && typeof payload.session_structure === 'object' ? payload.session_structure : null;
    const caution = payload.caution || '';
    const attachedMaterials = Array.isArray(payload.attached_materials) ? payload.attached_materials : [];

    const icon = (name) =>
      `<span class="rec-section__icon" aria-hidden="true"><img src="https://api.iconify.design/lucide/${name}.svg?color=%230F4C4A" alt="" width="16" height="16"></span>`;

    const section = (title, iconName, body, extraClass = '') =>
      body
        ? `<section class="rec-section ${extraClass}">
            <header class="rec-section__head">${icon(iconName)}<h5>${title}</h5></header>
            <div class="rec-section__body">${body}</div>
          </section>`
        : '';

    const focusChips = focusAreas.length
      ? `<div class="rec-chips">${focusAreas
          .map((g) => `<span class="rec-chip">${escapeHtml(typeof g === 'string' ? g : JSON.stringify(g))}</span>`)
          .join('')}</div>`
      : '';

    const strengthItems = strengths.length
      ? `<ul class="rec-bullets">${strengths
          .map((g) => `<li>${escapeHtml(typeof g === 'string' ? g : JSON.stringify(g))}</li>`)
          .join('')}</ul>`
      : '';

    const goalCards = goals.length
      ? `<div class="rec-goal-grid">${goals
          .map((g, idx) => {
            if (typeof g === 'string') {
              return `<article class="rec-goal"><span class="rec-goal__num">${idx + 1}</span><div><strong>${escapeHtml(g)}</strong></div></article>`;
            }
            return `<article class="rec-goal">
              <span class="rec-goal__num">${idx + 1}</span>
              <div>
                <strong>${escapeHtml(g.goal || g.title || 'Goal')}</strong>
                ${g.timeframe ? `<span class="rec-pill">${escapeHtml(g.timeframe)}</span>` : ''}
                ${g.success_indicator ? `<p><span>Success</span>${escapeHtml(g.success_indicator)}</p>` : ''}
                ${g.basis ? `<p><span>Basis</span>${escapeHtml(g.basis)}</p>` : ''}
              </div>
            </article>`;
          })
          .join('')}</div>`
      : '';

    const activityCards = activities.length
      ? `<div class="rec-activity-list">${activities
          .map((g, idx) => {
            if (typeof g === 'string') {
              return `<article class="rec-activity"><h6>${escapeHtml(g)}</h6></article>`;
            }
            const meta = [g.duration_minutes ? `${g.duration_minutes} min` : null, g.frequency || null]
              .filter(Boolean)
              .map((m) => `<span class="rec-pill">${escapeHtml(m)}</span>`)
              .join('');
            const steps =
              Array.isArray(g.steps) && g.steps.length
                ? `<ol class="rec-steps">${g.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
                : '';
            return `<article class="rec-activity">
              <div class="rec-activity__top">
                <span class="rec-activity__num">${idx + 1}</span>
                <div>
                  <h6>${escapeHtml(g.title || g.name || 'Activity')}</h6>
                  ${meta ? `<div class="rec-activity__meta">${meta}</div>` : ''}
                </div>
              </div>
              ${g.rationale ? `<p class="rec-activity__copy">${escapeHtml(g.rationale)}</p>` : ''}
              ${g.evidence_basis ? `<p class="rec-activity__basis"><strong>Basis:</strong> ${escapeHtml(g.evidence_basis)}</p>` : ''}
              ${steps}
            </article>`;
          })
          .join('')}</div>`
      : '';

    const bulletBlock = (items) =>
      items.length
        ? `<ul class="rec-bullets">${items
            .map((g) => `<li>${escapeHtml(typeof g === 'string' ? g : JSON.stringify(g))}</li>`)
            .join('')}</ul>`
        : '';

    const sessionHtml = session
      ? `<div class="rec-session">
          ${session.recommended_sessions_per_week != null
            ? `<div class="rec-session__stat"><strong>${escapeHtml(String(session.recommended_sessions_per_week))}</strong><span>sessions / week</span></div>`
            : ''}
          <ol class="rec-session__flow">
            ${session.warm_up ? `<li><span>Warm-up</span><p>${escapeHtml(session.warm_up)}</p></li>` : ''}
            ${session.core_block ? `<li><span>Core block</span><p>${escapeHtml(session.core_block)}</p></li>` : ''}
            ${session.cool_down ? `<li><span>Cool-down</span><p>${escapeHtml(session.cool_down)}</p></li>` : ''}
          </ol>
        </div>`
      : '';

    const attachedHtml = attachedMaterials.length
      ? `<ul class="rec-bullets">${attachedMaterials
          .map((m) => {
            const title = typeof m === 'string' ? m : m.title || m.name || 'Material';
            const type = typeof m === 'object' && m.type ? ` <span class="rec-pill">${escapeHtml(m.type)}</span>` : '';
            return `<li><strong>${escapeHtml(title)}</strong>${type}</li>`;
          })
          .join('')}</ul>`
      : '';

    return `
      <div class="rec-plan">
        ${
          summary
            ? `<div class="rec-plan__summary">
                <p class="rec-plan__label">Developmental summary</p>
                <p class="rec-plan__lead">${escapeHtml(summary)}</p>
              </div>`
            : ''
        }
        ${section('Assessment basis', 'clipboard-check', clinicalBasis ? `<p class="rec-plan__text">${escapeHtml(clinicalBasis)}</p>` : '', 'rec-section--basis')}
        ${section('Focus areas', 'target', focusChips)}
        ${section('Strengths to build on', 'sparkles', strengthItems)}
        ${section('Priority goals', 'flag', goalCards)}
        ${section('Suggested activities', 'puzzle', activityCards, 'rec-section--activities')}
        ${section('Attached learning materials', 'book-open', attachedHtml)}
        ${section('Intervention strategies', 'waypoints', bulletBlock(interventions))}
        ${section('Home & school carryover', 'home', bulletBlock(homeStrategies))}
        ${section('Progress monitoring', 'line-chart', bulletBlock(monitoring))}
        ${section('Session structure', 'timer', sessionHtml)}
        ${caution ? `<aside class="rec-caution" role="note"><strong>Review note</strong><p>${escapeHtml(caution)}</p></aside>` : ''}
      </div>
    `;
  }

  function renderRecommendationBlock(recs) {
    const list = visibleRecommendations(recs);
    if (!list.length) {
      return `
        <div class="assessment-view__empty-rec">
          <span class="assessment-view__empty-rec-icon" aria-hidden="true">
            <img src="https://api.iconify.design/lucide/sparkles.svg?color=%230F4C4A" alt="" width="22" height="22">
          </span>
          <p><strong>No AI recommendation yet</strong></p>
          <p class="form-hint">Generate a score-based learning plan for teacher review.</p>
        </div>`;
    }

    return list
      .map((r) => {
        const meta = recommendationStatusMeta([r]);
        const payload = r.openai_response_json || {};
        const locked = r.status === 'approved' || r.status === 'modified';
        const pending = r.status === 'pending_review';

        return `
          <article class="assessment-view__rec ${locked ? 'is-locked' : ''} ${pending ? 'is-pending' : ''}" data-rec-id="${r.id}">
            <header class="assessment-view__rec-banner">
              <div class="assessment-view__rec-banner-copy">
                <p class="assessment-view__rec-eyebrow">Learning support plan</p>
                <div class="assessment-view__rec-top">
                  <strong>${r.status === 'modified' ? 'Edited recommendation' : 'AI recommendation'}</strong>
                  <span class="badge ${meta.className}">${escapeHtml(meta.label)}</span>
                </div>
                <p class="assessment-view__rec-meta">Triggered ${escapeHtml(formatDateTime(r.created_at))}${r.reviewed_at ? ` · Reviewed ${escapeHtml(formatDateTime(r.reviewed_at))}` : ''}${r.status === 'modified' ? ' · Edited by reviewer (not AI-only)' : ''}</p>
              </div>
              <span class="assessment-view__rec-orb" aria-hidden="true">
                <img src="https://api.iconify.design/lucide/sparkles.svg?color=%23FFFFFF" alt="" width="22" height="22">
              </span>
            </header>
            ${locked ? '<p class="assessment-view__rec-banner-note">Accepted recommendations are locked. Generate is unavailable for this assessment.</p>' : ''}
            ${pending ? '<p class="assessment-view__rec-banner-note">Awaiting professional review — approve to create a therapy plan, or reject to dismiss.</p>' : ''}
            ${renderRecommendationPayload(payload)}
            ${
              pending && canReviewRecommendations()
                ? `<div class="assessment-view__rec-actions">
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
                          <p class="form-hint">Loading learning materials…</p>
                        </div>
                        <div class="rec-edit__footer">
                          <button type="button" class="btn btn-primary" data-assessment-review="${r.id}" data-review-status="modified">Save edits &amp; approve</button>
                        </div>
                      </div>
                    </details>
                    <label class="assessment-view__notes">
                      <span>Review notes <span class="settings-optional">(optional)</span></span>
                      <textarea class="field-control" data-assessment-rec-notes="${r.id}" rows="2" placeholder="Optional notes for the care team"></textarea>
                    </label>
                    <div class="assessment-view__rec-btns">
                      <button type="button" class="btn btn-primary" data-assessment-review="${r.id}" data-review-status="approved">Approve</button>
                      <button type="button" class="btn btn-secondary" data-assessment-review="${r.id}" data-review-status="rejected">Reject</button>
                    </div>
                  </div>`
                : ''
            }
          </article>`;
      })
      .join('');
  }

  async function openAssessmentView(assessmentId) {
    const alertEl = SC.$('#assessment-view-alert');
    const content = SC.$('#assessment-view-content');
    const generateBtn = SC.$('#assessment-view-generate-btn');
    hideAlert(alertEl);
    content.innerHTML = '<p class="loading">Loading assessment…</p>';
    SC.state.viewingAssessmentId = assessmentId;
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generate AI recommendation';
    }
    openModal('modal-assessment-view');

    try {
      const assessment = await SmartCareAPI.get(`/assessments/${assessmentId}`);
      SC.state.assessmentsCache = SC.state.assessmentsCache.map((a) => (String(a.id) === String(assessmentId) ? assessment : a));
      if (!SC.state.assessmentsCache.some((a) => String(a.id) === String(assessmentId))) {
        SC.state.assessmentsCache.unshift(assessment);
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

      SC.$('#modal-assessment-view-title').textContent = childName(child);
      SC.$('#modal-assessment-view-meta').textContent = `${checklist.title || 'Checklist'} · ${severity} · ${recMeta.label}`;

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
        const locked = recommendationIsLocked(assessment.ai_recommendations);
        const canGenerate = canSubmitAssessments() && !locked;
        generateBtn.hidden = !canGenerate;
        generateBtn.disabled = !canGenerate;
        generateBtn.dataset.childId = String(child.id || '');
        generateBtn.dataset.assessmentId = String(assessment.id);
        generateBtn.textContent = 'Generate AI recommendation';
      }

      const profileBtn = SC.$('#assessment-view-profile-btn');
      if (profileBtn) {
        profileBtn.onclick = () => {
          closeModal('modal-assessment-view');
          if (child.id) openChildProfile(child.id, 'recommendations');
        };
      }
      await hydrateRecommendationMaterialPickers(content);
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
    try {
      return await SC.withBusy({ button: btn, busyLabel: 'Generating…' }, async () => {
        const rec = await SmartCareAPI.post(`/children/${childId}/recommendations/generate`, {
          assessment_id: Number(assessmentId),
        });
        showAlert(alertEl, 'AI recommendation generated.', 'success');
        await loadSubmittedAssessments({ force: true });
        return rec;
      });
    } catch (err) {
      showAlert(alertEl, err.message || 'AI recommendation failed.', 'error');
      return null;
    } finally {
      if (btn) {
        const assessment = (SC.state.assessmentsCache || []).find((a) => String(a.id) === String(assessmentId));
        const recs = assessment?.ai_recommendations;
        const locked = recommendationIsLocked(recs);
        const canGenerate = canSubmitAssessments() && !locked;
        btn.hidden = !canGenerate;
        btn.disabled = !canGenerate;
        btn.textContent = 'Generate AI recommendation';
      }
    }
  }

  async function ensureMaterialsCache() {
    if (Array.isArray(SC.state.materialsCache) && SC.state.materialsCache.length) {
      return SC.state.materialsCache;
    }
    try {
      const rows = await SmartCareAPI.get('/learning-materials');
      SC.state.materialsCache = Array.isArray(rows) ? rows : rows.data || [];
    } catch {
      SC.state.materialsCache = [];
    }
    return SC.state.materialsCache;
  }

  async function hydrateRecommendationMaterialPickers(root = document) {
    const hosts = [...root.querySelectorAll('[data-rec-materials]')];
    if (!hosts.length) return;
    const materials = await ensureMaterialsCache();
    hosts.forEach((host) => {
      const recId = host.getAttribute('data-rec-materials');
      const article = host.closest('[data-rec-id]');
      const payload = (() => {
        try {
          const id = Number(recId);
          const assessment = SC.state.assessmentsCache?.find((a) =>
            (a.ai_recommendations || []).some((r) => Number(r.id) === id)
          );
          const fromAssessment = (assessment?.ai_recommendations || []).find((r) => Number(r.id) === id);
          if (fromAssessment?.openai_response_json) return fromAssessment.openai_response_json;
          const fromProfile = (SC.state.childProfileReport?.recommendations || []).find(
            (r) => Number(r.id) === id
          );
          return fromProfile?.openai_response_json || {};
        } catch {
          return {};
        }
      })();
      const selected = new Set();
      (payload.learning_material_ids || []).forEach((id) => selected.add(Number(id)));
      (payload.attached_materials || []).forEach((m) => {
        if (m?.id != null) selected.add(Number(m.id));
      });
      (payload.suggested_activities || []).forEach((activity) => {
        if (activity?.material_id != null) selected.add(Number(activity.material_id));
      });
      if (!materials.length) {
        host.innerHTML = '<p class="form-hint">No learning materials in the library yet.</p>';
        return;
      }
      host.innerHTML = `
        <div class="rec-edit__materials-panel">
          <div class="rec-edit__materials-head">
            <p class="rec-edit__label">Learning materials</p>
            <p class="rec-edit__hint">Check to attach, uncheck to remove a suggested material</p>
          </div>
          <div class="rec-edit__material-list">
            ${materials
              .map(
                (m) => `<label class="rec-edit__material">
                  <input type="checkbox" data-rec-material-id="${m.id}" ${selected.has(Number(m.id)) ? 'checked' : ''}>
                  <span class="rec-edit__material-copy">
                    <strong>${escapeHtml(m.title || `Material #${m.id}`)}</strong>
                    ${m.type ? `<span class="rec-edit__material-meta">${escapeHtml(m.type)}</span>` : ''}
                    ${selected.has(Number(m.id)) ? '<span class="rec-edit__material-badge">Suggested</span>' : ''}
                  </span>
                </label>`
              )
              .join('')}
          </div>
        </div>`;
    });
  }

  function collectRecommendationEdits(recId, existingPayload = {}) {
    const scope =
      SC.$(`.assessment-view__rec[data-rec-id="${recId}"]`) ||
      SC.$(`.profile-item[data-rec-id="${recId}"]`) ||
      document;
    const summary = scope.querySelector('[data-rec-field="developmental_summary"]')?.value ?? null;
    const basis = scope.querySelector('[data-rec-field="clinical_basis"]')?.value ?? null;
    const focusRaw = scope.querySelector('[data-rec-field="focus_areas"]')?.value ?? null;
    const interventionsRaw = scope.querySelector('[data-rec-field="intervention_suggestions"]')?.value ?? null;
    const materialBoxes = [...scope.querySelectorAll('[data-rec-material-id]')];
    const materialsHydrated = materialBoxes.length > 0;
    const materialIds = materialBoxes
      .filter((el) => el.checked)
      .map((el) => Number(el.getAttribute('data-rec-material-id')))
      .filter((id) => Number.isFinite(id) && id > 0);

    const hasEditUi = summary !== null || basis !== null || focusRaw !== null || interventionsRaw !== null;
    // Only send material IDs when the picker was rendered so Accept without opening
    // Edit does not wipe AI-suggested materials.
    const learningMaterialIds = materialsHydrated ? materialIds : undefined;

    if (!hasEditUi && learningMaterialIds === undefined) {
      return { openai_response_json: null, learning_material_ids: undefined };
    }

    const next = { ...(existingPayload || {}) };
    if (summary !== null) next.developmental_summary = summary.trim();
    if (basis !== null) next.clinical_basis = basis.trim();
    if (focusRaw !== null) {
      next.focus_areas = focusRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (interventionsRaw !== null) {
      next.intervention_suggestions = interventionsRaw
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    return {
      openai_response_json: hasEditUi ? next : null,
      learning_material_ids: learningMaterialIds,
    };
  }

  async function reviewRecommendationFromAssessment(recId, status, btn) {
    const alertEl = SC.$('#assessment-view-alert');
    const notes = SC.$(`[data-assessment-rec-notes="${recId}"]`)?.value.trim() || null;
    hideAlert(alertEl);
    if (btn) btn.disabled = true;
    try {
      const assessment = SC.state.assessmentsCache?.find((a) =>
        (a.ai_recommendations || []).some((r) => String(r.id) === String(recId))
      );
      const existing = (assessment?.ai_recommendations || []).find((r) => String(r.id) === String(recId));
      const edits = collectRecommendationEdits(recId, existing?.openai_response_json || {});
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
      const label = status === 'approved' ? 'approved' : status === 'modified' ? 'saved as edited' : 'rejected';
      showAlert(alertEl, `AI recommendation ${label}.`, 'success');
      await loadSubmittedAssessments({ force: true });
      if (SC.state.viewingAssessmentId) {
        await openAssessmentView(SC.state.viewingAssessmentId);
      }
      if (window.__facilityReport) {
        window.__facilityReport = null;
        SC.loadAnalytics?.();
      }
    } catch (err) {
      showAlert(alertEl, err.message || 'Could not review recommendation.', 'error');
      if (btn) btn.disabled = false;
    }
  }

  function initAssessmentViewActions() {
    const list = SC.$('#submitted-assessments-list');
    list?.addEventListener('toggle', (e) => {
      const details = e.target.closest?.('details.assessment-group');
      if (!details || e.target !== details) return;
      const childId = details.getAttribute('data-child-group');
      if (!childId) return;
      if (details.open) openAssessmentGroups.add(childId);
      else openAssessmentGroups.delete(childId);
    });

    list?.addEventListener('click', async (e) => {
      const pageBtn = e.target.closest('[data-child-page]');
      if (pageBtn) {
        e.preventDefault();
        const childId = pageBtn.getAttribute('data-child-id');
        const direction = pageBtn.getAttribute('data-child-page');
        if (!childId || pageBtn.disabled) return;
        const group = groupAssessmentsByChild(getFilteredAssessments()).find(
          (g) => String(g.childId) === String(childId)
        );
        const totalPages = Math.max(
          1,
          Math.ceil((group?.assessments.length || 0) / CHILD_ASSESSMENT_PAGE_SIZE) || 1
        );
        let page = getChildAssessmentPage(childId);
        if (direction === 'prev') page -= 1;
        if (direction === 'next') page += 1;
        page = Math.min(totalPages, Math.max(1, page));
        setChildAssessmentPage(childId, page);
        openAssessmentGroups.add(String(childId));
        renderSubmittedAssessments();
        return;
      }

      const btn = e.target.closest('[data-assessment-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-assessment-action');
      const id = btn.getAttribute('data-assessment-id');

      if (action === 'profile') {
        const childId = btn.getAttribute('data-child-id');
        if (!childId) {
          showAlert(SC.$('#submitted-assessments-alert'), 'Child profile is unavailable for this assessment.', 'error');
          return;
        }
        if (typeof SC.openChildProfile === 'function') {
          await SC.openChildProfile(Number(childId), 'overview');
        }
        return;
      }

      if (!id) return;

      if (action === 'view') {
        openAssessmentView(id);
        return;
      }

      if (action === 'generate') {
        const childId = btn.getAttribute('data-child-id');
        const alertEl = SC.$('#submitted-assessments-alert');
        hideAlert(alertEl);
        const rec = await generateRecommendationForAssessment(childId, id, btn, alertEl);
        if (rec) openAssessmentView(id);
      }
    });

    SC.$('#assessment-view-content')?.addEventListener('click', async (e) => {
      const reviewBtn = e.target.closest('[data-assessment-review]');
      if (!reviewBtn) return;
      if (!canReviewRecommendations()) {
        showAlert(SC.$('#assessment-view-alert'), 'Only Head Doctors can approve or reject AI recommendations here.', 'error');
        return;
      }
      await reviewRecommendationFromAssessment(
        reviewBtn.getAttribute('data-assessment-review'),
        reviewBtn.getAttribute('data-review-status'),
        reviewBtn
      );
    });

    SC.$('#assessment-view-generate-btn')?.addEventListener('click', async () => {
      const btn = SC.$('#assessment-view-generate-btn');
      const alertEl = SC.$('#assessment-view-alert');
      const childId = btn?.dataset.childId;
      const assessmentId = btn?.dataset.assessmentId || SC.state.viewingAssessmentId;
      const rec = await generateRecommendationForAssessment(childId, assessmentId, btn, alertEl);
      if (rec && assessmentId) {
        await openAssessmentView(assessmentId);
      }
    });
  }

  let assessmentsLoaded = false;
  let assessmentsLoading = false;
  let assessmentRecordsPage = 1;
  const ASSESSMENT_PAGE_SIZE = 10;
  const CHILD_ASSESSMENT_PAGE_SIZE = 6;
  const openAssessmentGroups = new Set();
  const childAssessmentPages = new Map();

  function getChildAssessmentPage(childId) {
    const page = Number(childAssessmentPages.get(String(childId)) || 1);
    return Number.isFinite(page) && page > 0 ? page : 1;
  }

  function setChildAssessmentPage(childId, page) {
    childAssessmentPages.set(String(childId), Math.max(1, Number(page) || 1));
  }

  function setAssessmentStatLabels(assessmentCount, pendingCount) {
    const submittedLabel = SC.$('#submitted-assessments-label');
    const pendingLabel = SC.$('#pending-recs-label');
    if (submittedLabel) submittedLabel.textContent = SC.pluralLabel(assessmentCount, 'Submitted assessment', 'Submitted assessments');
    if (pendingLabel) pendingLabel.textContent = SC.pluralLabel(pendingCount, 'Pending recommendation', 'Pending recommendations');
  }

  function getAssessmentSearchQuery() {
    return String(SC.$('#assessments-search')?.value || '').trim().toLowerCase();
  }

  function assessmentMatchesSearch(assessment, query) {
    if (!query) return true;
    const child = assessment.child || {};
    const checklist = assessment.checklist || {};
    const submitter = assessment.psychometrician?.name || assessment.psychometrician?.username || '';
    const haystack = [
      childName(child),
      child.first_name,
      child.last_name,
      checklist.title,
      assessment.severity_level,
      submitter,
      assessment.notes,
      recommendationStatusMeta(assessment.ai_recommendations).label,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  }

  function getFilteredAssessments() {
    const assessments = Array.isArray(SC.state.assessmentsCache) ? SC.state.assessmentsCache : [];
    const mineOnly = Boolean(SC.$('#assessments-filter-mine')?.checked);
    const meId = SC.state.currentUser?.id;
    const query = getAssessmentSearchQuery();

    let visible = mineOnly
      ? assessments.filter((a) => String(a.psychometrician_id || a.psychometrician?.id) === String(meId))
      : assessments.slice();

    if (query) {
      visible = visible.filter((a) => assessmentMatchesSearch(a, query));
    }

    return visible;
  }

  function groupAssessmentsByChild(assessments) {
    const groups = new Map();
    (assessments || []).forEach((a) => {
      const child = a.child || {};
      const childId = String(a.child_id || child.id || 'unknown');
      if (!groups.has(childId)) {
        groups.set(childId, {
          childId,
          child,
          assessments: [],
        });
      }
      const group = groups.get(childId);
      if (!group.child?.id && child.id) group.child = child;
      group.assessments.push(a);
    });

    return [...groups.values()]
      .map((group) => {
        group.assessments.sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        return group;
      })
      .sort((a, b) => childName(a.child).localeCompare(childName(b.child), undefined, { sensitivity: 'base' }));
  }

  function renderAssessmentCard(a, { grouped = false } = {}) {
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
    const initials = initialsFromName(childName(child));
    const sevRaw = (a.severity_level || '').toLowerCase();
    const sevKey = ['mild', 'moderate', 'severe'].includes(sevRaw) ? sevRaw : 'unspecified';
    const locked = recommendationIsLocked(a.ai_recommendations);
    const canGenerate = (SC.canGenerateRecommendations?.() || canSubmitAssessments()) && !locked;
    const generateLabel = generateLockLabel(a.ai_recommendations);
    const title = grouped ? (checklist.title || 'Checklist') : childName(child);
    const subtitle = grouped
      ? `${severity} · ${formatDate(a.created_at)}`
      : (checklist.title || 'Checklist');

    return `
      <article class="assessment-card${grouped ? ' assessment-card--grouped' : ''}" data-assessment-id="${a.id}">
        <header class="assessment-card__head">
          ${
            grouped
              ? ''
              : `<span class="assessment-card__avatar assessment-card__avatar--${sevKey}" aria-hidden="true">${escapeHtml(initials)}</span>`
          }
          <div class="assessment-card__identity">
            <h4 class="assessment-card__title">${escapeHtml(title)}</h4>
            <p class="assessment-card__checklist">${escapeHtml(subtitle)}</p>
          </div>
          <span class="assessment-card__flag ${recMeta.className}">
            <span class="assessment-card__flag-dot" aria-hidden="true"></span>
            ${escapeHtml(recMeta.label)}
          </span>
        </header>
        <dl class="assessment-card__facts">
          <div class="assessment-card__fact">
            <dt>Severity</dt>
            <dd class="assessment-card__value assessment-card__value--${sevKey}">${escapeHtml(severity)}</dd>
          </div>
          <div class="assessment-card__fact">
            <dt>Items scored</dt>
            <dd class="assessment-card__value">${scored}/${responseCount}</dd>
          </div>
          <div class="assessment-card__fact">
            <dt>Submitted</dt>
            <dd class="assessment-card__value">${escapeHtml(formatDate(a.created_at))}</dd>
          </div>
          <div class="assessment-card__fact">
            <dt>Recorded by</dt>
            <dd class="assessment-card__value">${escapeHtml(submitter)}</dd>
          </div>
        </dl>
        ${notes ? `<p class="assessment-card__notes">${escapeHtml(notes)}</p>` : ''}
        <div class="assessment-card__actions">
          <button type="button" class="btn btn-primary" data-assessment-action="view" data-assessment-id="${a.id}">View</button>
          ${
            grouped
              ? ''
              : `<button type="button" class="btn btn-secondary" data-assessment-action="profile" data-child-id="${child.id || ''}" ${child.id ? '' : 'disabled'}>Child Profile</button>`
          }
          ${
            canGenerate
              ? `<button type="button" class="btn btn-accent" data-assessment-action="generate" data-assessment-id="${a.id}" data-child-id="${child.id || ''}">${escapeHtml(generateLabel)}</button>`
              : ''
          }
        </div>
      </article>`;
  }

  function renderAssessmentGroup(group) {
    const child = group.child || {};
    const name = childName(child);
    const initials = initialsFromName(name);
    const count = group.assessments.length;
    const latest = group.assessments[0] || {};
    const pendingCount = group.assessments.reduce((sum, a) => {
      const recs = a.ai_recommendations || [];
      return sum + recs.filter((r) => r.status === 'pending_review').length;
    }, 0);
    const latestSeverity = latest.severity_level
      ? latest.severity_level.charAt(0).toUpperCase() + latest.severity_level.slice(1)
      : 'Not specified';
    const sevRaw = (latest.severity_level || '').toLowerCase();
    const sevKey = ['mild', 'moderate', 'severe'].includes(sevRaw) ? sevRaw : 'unspecified';
    const isOpen = openAssessmentGroups.has(group.childId);

    const totalPages = Math.max(1, Math.ceil(count / CHILD_ASSESSMENT_PAGE_SIZE) || 1);
    let page = getChildAssessmentPage(group.childId);
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    setChildAssessmentPage(group.childId, page);
    const start = (page - 1) * CHILD_ASSESSMENT_PAGE_SIZE;
    const pageItems = group.assessments.slice(start, start + CHILD_ASSESSMENT_PAGE_SIZE);
    const showingFrom = count ? start + 1 : 0;
    const showingTo = Math.min(start + CHILD_ASSESSMENT_PAGE_SIZE, count);

    return `
      <details class="assessment-group" data-child-group="${escapeHtml(group.childId)}"${isOpen ? ' open' : ''}>
        <summary class="assessment-group__summary">
          <span class="assessment-card__avatar assessment-card__avatar--${sevKey}" aria-hidden="true">${escapeHtml(initials)}</span>
          <div class="assessment-group__identity">
            <h4 class="assessment-group__title">${escapeHtml(name)}</h4>
            <p class="assessment-group__meta">
              ${count} assessment${count === 1 ? '' : 's'}
              · Latest ${escapeHtml(formatDate(latest.created_at))}
              · ${escapeHtml(latestSeverity)}
              ${pendingCount ? ` · ${pendingCount} pending AI` : ''}
            </p>
          </div>
          <div class="assessment-group__aside">
            <span class="count-chip">${count}</span>
            <span class="assessment-group__chevron" aria-hidden="true"></span>
          </div>
        </summary>
        <div class="assessment-group__body">
          <div class="assessment-group__toolbar">
            <button type="button" class="btn btn-secondary btn-sm" data-assessment-action="profile" data-child-id="${child.id || ''}" ${child.id ? '' : 'disabled'}>Child Profile</button>
          </div>
          <div class="assessment-grid assessment-grid--nested">
            ${pageItems.map((a) => renderAssessmentCard(a, { grouped: true })).join('')}
          </div>
          ${
            totalPages > 1
              ? `<nav class="assessment-group__pagination" aria-label="Assessments for ${escapeHtml(name)}">
                  <button type="button" class="btn btn-secondary btn-sm" data-child-page="prev" data-child-id="${escapeHtml(group.childId)}" ${page <= 1 ? 'disabled' : ''}>Previous</button>
                  <p class="assessment-group__page-meta">Page ${page} of ${totalPages} · Showing ${showingFrom}–${showingTo} of ${count}</p>
                  <button type="button" class="btn btn-secondary btn-sm" data-child-page="next" data-child-id="${escapeHtml(group.childId)}" ${page >= totalPages ? 'disabled' : ''}>Next</button>
                </nav>`
              : ''
          }
        </div>
      </details>`;
  }

  function renderSubmittedAssessments({ scrollToTop = false } = {}) {
    const empty = SC.$('#submitted-assessments-empty');
    const list = SC.$('#submitted-assessments-list');
    const totalEl = SC.$('#submitted-assessments-count');
    const toolbarCount = SC.$('#submitted-assessments-toolbar-count');
    const pendingCountEl = SC.$('#pending-recs-count');
    const pagination = SC.$('#submitted-assessments-pagination');
    const pageMeta = SC.$('#assessments-page-meta');
    const prevBtn = SC.$('#assessments-page-prev');
    const nextBtn = SC.$('#assessments-page-next');

    const allAssessments = Array.isArray(SC.state.assessmentsCache) ? SC.state.assessmentsCache : [];
    const pendingRecs = allAssessments.reduce((count, a) => {
      const recs = a.ai_recommendations || [];
      return count + recs.filter((r) => r.status === 'pending_review').length;
    }, 0);

    const mineOnly = Boolean(SC.$('#assessments-filter-mine')?.checked);
    const query = getAssessmentSearchQuery();
    const visible = getFilteredAssessments();
    const groups = groupAssessmentsByChild(visible);
    const totalPages = Math.max(1, Math.ceil(groups.length / ASSESSMENT_PAGE_SIZE) || 1);
    if (assessmentRecordsPage > totalPages) assessmentRecordsPage = totalPages;
    if (assessmentRecordsPage < 1) assessmentRecordsPage = 1;

    const start = (assessmentRecordsPage - 1) * ASSESSMENT_PAGE_SIZE;
    const pageGroups = groups.slice(start, start + ASSESSMENT_PAGE_SIZE);
    const showingFrom = groups.length ? start + 1 : 0;
    const showingTo = Math.min(start + ASSESSMENT_PAGE_SIZE, groups.length);

    if (totalEl) totalEl.textContent = String(allAssessments.length);
    if (toolbarCount) toolbarCount.textContent = String(visible.length);
    if (pendingCountEl) pendingCountEl.textContent = String(pendingRecs);
    setAssessmentStatLabels(allAssessments.length, pendingRecs);

    if (!visible.length) {
      if (empty) {
        empty.hidden = false;
        if (query) {
          empty.querySelector('h3').textContent = 'No matching assessment records';
          empty.querySelector('p').textContent = 'Try another child name, checklist, severity, or recorder.';
        } else if (mineOnly) {
          empty.querySelector('h3').textContent = 'No assessments from you yet';
          empty.querySelector('p').textContent = 'Submit a new assessment to see it listed here.';
        } else {
          empty.querySelector('h3').textContent = 'No submitted assessments yet';
          empty.querySelector('p').textContent =
            'Create a new assessment to see it listed here with checklist scores and AI recommendation status.';
        }
      }
      if (list) {
        list.hidden = true;
        list.innerHTML = '';
      }
      if (pagination) pagination.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (list) {
      list.hidden = false;
      list.innerHTML = pageGroups.map(renderAssessmentGroup).join('');
    }

    if (pagination) {
      pagination.hidden = totalPages <= 1;
    }
    if (pageMeta) {
      pageMeta.textContent = `Page ${assessmentRecordsPage} of ${totalPages} · ${showingFrom}–${showingTo} of ${groups.length} children · ${visible.length} assessments`;
    }
    if (prevBtn) prevBtn.disabled = assessmentRecordsPage <= 1;
    if (nextBtn) nextBtn.disabled = assessmentRecordsPage >= totalPages;

    if (scrollToTop) {
      SC.$('#submitted-assessments-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function loadSubmittedAssessments({ force = false } = {}) {
    if (assessmentsLoading) return;
    if (assessmentsLoaded && !force) {
      renderSubmittedAssessments();
      return;
    }

    const loading = SC.$('#submitted-assessments-loading');
    const empty = SC.$('#submitted-assessments-empty');
    const list = SC.$('#submitted-assessments-list');
    const pagination = SC.$('#submitted-assessments-pagination');

    assessmentsLoading = true;
    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    if (list) list.hidden = true;
    if (pagination) pagination.hidden = true;

    try {
      const assessments = await SmartCareAPI.get('/assessments');
      SC.state.assessmentsCache = Array.isArray(assessments) ? assessments : [];
      assessmentsLoaded = true;
      if (force) {
        assessmentRecordsPage = 1;
        childAssessmentPages.clear();
      }
    } catch (err) {
      if (loading) loading.textContent = `Could not load assessments: ${err.message}`;
      const totalEl = SC.$('#submitted-assessments-count');
      const toolbarCount = SC.$('#submitted-assessments-toolbar-count');
      const pendingCountEl = SC.$('#pending-recs-count');
      if (totalEl) totalEl.textContent = '0';
      if (toolbarCount) toolbarCount.textContent = '0';
      if (pendingCountEl) pendingCountEl.textContent = '0';
      setAssessmentStatLabels(0, 0);
      assessmentsLoading = false;
      return;
    }

    if (loading) {
      loading.hidden = true;
      loading.textContent = 'Loading assessments…';
    }

    renderSubmittedAssessments();
    assessmentsLoading = false;
  }


  SC.splitAssessmentPrompt = splitAssessmentPrompt;
  SC.loadChecklistResponses = loadChecklistResponses;
  SC.collectResponses = collectResponses;
  SC.initAssessments = initAssessments;
  SC.recommendationStatusMeta = recommendationStatusMeta;
  SC.visibleRecommendations = visibleRecommendations;
  SC.recommendationIsLocked = recommendationIsLocked;
  SC.generateLockLabel = generateLockLabel;
  SC.renderRecommendationBlock = renderRecommendationBlock;
  SC.renderRecommendationPayload = renderRecommendationPayload;
  SC.hydrateRecommendationMaterialPickers = hydrateRecommendationMaterialPickers;
  SC.collectRecommendationEdits = collectRecommendationEdits;
  SC.openAssessmentView = openAssessmentView;
  SC.generateRecommendationForAssessment = generateRecommendationForAssessment;
  SC.initAssessmentViewActions = initAssessmentViewActions;
  SC.loadSubmittedAssessments = loadSubmittedAssessments;
})(window.SmartCareApp);
