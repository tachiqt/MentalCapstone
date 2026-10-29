/** SmartCare dashboard — checklists */
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

  function checklistCategoryKey(category) {
    const value = String(category || '').toLowerCase();
    if (value.includes('motor')) return 'motor';
    if (value.includes('social')) return 'social';
    if (value.includes('cognitive')) return 'cognitive';
    if (value.includes('behavior')) return 'behavioral';
    return 'general';
  }

  function checklistCategoryIcon(key) {
    const icons = {
      motor: 'person-standing',
      social: 'users',
      cognitive: 'brain',
      behavioral: 'heart-handshake',
      general: 'clipboard-list',
    };
    return icons[key] || icons.general;
  }

  function checklistCardCopy(cl) {
    const raw = cl.description || '';
    const purposeMatch = raw.match(/^Purpose:\s*(.+?)\s*(?:\n|$)/im);
    const body = stripChecklistCategory(raw)
      .replace(/^Age focus:.*?(?:\n|$)/gim, '')
      .replace(/^Diagnosis focus:.*?(?:\n|$)/gim, '')
      .replace(/^Purpose:.*?(?:\n|$)/gim, '')
      .replace(/^Scoring guide:.*?(?:\n|$)/gim, '')
      .replace(/^---\s*/m, '')
      .trim();
    const purpose = purposeMatch ? purposeMatch[1].trim() : '';
    return {
      purpose,
      body: body || purpose || 'No description provided.',
    };
  }

  const PENDING_ASSESSMENT_CHECKLIST_KEY = 'sc_pending_assessment_checklist';

  function splitChecklistPrompt(rawPrompt) {
    const text = String(rawPrompt || '').trim();
    const match = text.match(/^(.*?)(?:\s*\[Hint:\s*([\s\S]*?)\s*\])\s*$/i);
    if (match) return { prompt: match[1].trim(), hint: match[2].trim() };
    return { prompt: text, hint: '' };
  }

  function parseChecklistDefineMeta(cl) {
    const desc = cl.description || '';
    const ageMatch = desc.match(/^Age focus:\s*(.+?)\s*(?:\n|$)/im);
    const diagMatch = desc.match(/^Diagnosis focus:\s*(.+?)\s*(?:\n|$)/im);
    const purposeMatch = desc.match(/^Purpose:\s*(.+?)\s*(?:\n|$)/im);
    const scoringMatch = desc.match(/^Scoring guide:\s*(.+?)\s*(?:\n|$)/im);
    const body = stripChecklistCategory(desc)
      .replace(/^Age focus:.*?(?:\n|$)/gim, '')
      .replace(/^Diagnosis focus:.*?(?:\n|$)/gim, '')
      .replace(/^Purpose:.*?(?:\n|$)/gim, '')
      .replace(/^Scoring guide:.*?(?:\n|$)/gim, '')
      .replace(/^---\s*/m, '')
      .trim();
    return {
      category: parseChecklistCategory(cl),
      age_band: ageMatch ? ageMatch[1].trim() : '',
      diagnosis_focus: diagMatch ? diagMatch[1].trim() : '',
      purpose: purposeMatch ? purposeMatch[1].trim() : '',
      scoring_guide: scoringMatch ? scoringMatch[1].trim() : '',
      description: body,
    };
  }

  function currentDashboardPage() {
    return (location.pathname.split('/').pop() || 'dashboard.html').toLowerCase();
  }

  function applyAssessmentChecklistSelection(checklistId) {
    const select = SC.$('#assessment-checklist');
    if (!select) return false;
    select.value = String(checklistId);
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (canSubmitAssessments()) openModal('modal-assessment');
    return true;
  }

  function consumePendingAssessmentChecklist() {
    try {
      const raw = sessionStorage.getItem(PENDING_ASSESSMENT_CHECKLIST_KEY);
      if (!raw) return;
      const select = SC.$('#assessment-checklist');
      if (!select) return;
      const hasOption = Array.from(select.options).some((o) => o.value === raw);
      if (!hasOption) return;
      sessionStorage.removeItem(PENDING_ASSESSMENT_CHECKLIST_KEY);
      applyAssessmentChecklistSelection(raw);
    } catch {
      /* ignore */
    }
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
    const q = (SC.$('#checklists-search')?.value || '').trim().toLowerCase();
    const category = SC.$('#checklists-filter-category')?.value || '';
    return SC.state.checklistsCache.filter((cl) => {
      const title = (cl.title || '').toLowerCase();
      const desc = stripChecklistCategory(cl.description || '').toLowerCase();
      const cat = parseChecklistCategory(cl);
      const matchQ = !q || title.includes(q) || desc.includes(q);
      const matchCat = !category || cat.toLowerCase() === category.toLowerCase();
      return matchQ && matchCat;
    });
  }

  let checklistsPage = 1;
  const CHECKLISTS_PAGE_SIZE = 15;

  function renderChecklistsLibrary({ scrollToTop = false } = {}) {
    const empty = SC.$('#checklists-empty');
    const list = SC.$('#checklists-list');
    const pagination = SC.$('#checklists-pagination');
    const filtered = filterChecklists();
    const pageData = SC.paginate(filtered, checklistsPage, CHECKLISTS_PAGE_SIZE);
    checklistsPage = pageData.page;

    if (!SC.state.checklistsCache.length) {
      empty.hidden = false;
      list.hidden = true;
      if (pagination) pagination.hidden = true;
      return;
    }

    empty.hidden = true;
    list.hidden = false;

    if (!filtered.length) {
      list.innerHTML = `<p class="form-hint" style="padding:1.5rem;text-align:center">No checklists match your search.</p>`;
      if (pagination) pagination.hidden = true;
      return;
    }

    list.innerHTML = pageData.items
      .map((cl) => {
        const itemCount = cl.items_count ?? (cl.items ? cl.items.length : 0);
        const category = parseChecklistCategory(cl);
        const catKey = checklistCategoryKey(category);
        const copy = checklistCardCopy(cl);
        const isAi = /ai[- ]?generated/i.test(copy.body) || /ai[- ]?generated/i.test(cl.title || '');
        const active = cl.is_active !== false;
        const icon = checklistCategoryIcon(catKey);
        return `
        <article class="checklist-card checklist-card--${catKey}${isAi ? ' checklist-card--ai' : ''}${active ? '' : ' is-inactive'}" data-checklist-id="${cl.id}">
          <div class="checklist-card__top">
            <div class="checklist-card__identity">
              <span class="checklist-card__icon" aria-hidden="true">
                <img src="https://api.iconify.design/lucide/${icon}.svg?color=%230F4C4A" alt="" width="22" height="22">
              </span>
              <div class="checklist-card__tags">
                <span class="cat-pill cat-pill--${catKey}">${escapeHtml(category)}</span>
                ${isAi ? '<span class="ai-pill" title="AI-assisted">AI draft</span>' : ''}
              </div>
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
                    ? `<button type="button" data-checklist-action="edit" data-id="${cl.id}">Edit checklist</button>
                       <button type="button" data-checklist-action="toggle" data-id="${cl.id}">${active ? 'Deactivate' : 'Activate'}</button>
                       <button type="button" class="is-danger" data-checklist-action="delete" data-id="${cl.id}">Delete</button>`
                    : ''
                }
              </div>
            </div>
          </div>
          <h4 class="checklist-card__title">${escapeHtml(cl.title)}</h4>
          ${copy.purpose ? `<p class="checklist-card__purpose">${escapeHtml(copy.purpose)}</p>` : ''}
          <p class="checklist-card__desc">${escapeHtml(copy.body)}</p>
          <div class="checklist-card__foot">
            <span class="checklist-card__meta">
              <img src="https://api.iconify.design/lucide/list.svg?color=%230F4C4A" alt="" width="15" height="15">
              ${itemCount} item${itemCount === 1 ? '' : 's'}
            </span>
            <span class="checklist-card__status ${active ? 'is-active' : 'is-inactive'}">${active ? 'Active' : 'Inactive'}</span>
            <span class="checklist-card__meta checklist-card__meta--date">
              ${
                isAi
                  ? '<span class="checklist-card__ai-label">AI-generated</span>'
                  : `<img src="https://api.iconify.design/lucide/clock.svg?color=%235C6775" alt="" width="15" height="15"> ${escapeHtml(checklistDateLabel(cl))}`
              }
            </span>
          </div>
        </article>`;
      })
      .join('');

    SC.renderPaginationControls({
      nav: pagination,
      prev: SC.$('#checklists-page-prev'),
      next: SC.$('#checklists-page-next'),
      meta: SC.$('#checklists-page-meta'),
      page: pageData.page,
      totalPages: pageData.totalPages,
      from: pageData.from,
      to: pageData.to,
      total: pageData.total,
    });

    bindChecklistMenus();
    if (scrollToTop) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeAllChecklistMenus() {
    SC.$$('.checklist-menu').forEach((menu) => {
      menu.classList.remove('is-open');
      menu.hidden = true;
    });
    SC.$$('.checklist-card__menu').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
  }

  async function openChecklistView(id) {
    let cl = SC.state.checklistsCache.find((c) => String(c.id) === String(id));
    if (!cl) return;

    if (!Array.isArray(cl.items) || !cl.items.length) {
      try {
        const full = await SmartCareAPI.get(`/checklists/${id}`);
        cl = { ...cl, ...full };
        SC.state.checklistsCache = SC.state.checklistsCache.map((c) => (String(c.id) === String(id) ? cl : c));
      } catch {
        /* keep summary-only view */
      }
    }

    const category = parseChecklistCategory(cl);
    const copy = checklistCardCopy(cl);
    const items = cl.items || [];
    const splitPrompt = splitChecklistPrompt;

    SC.$('#modal-checklist-view-title').textContent = cl.title || 'Checklist details';
    SC.$('#modal-checklist-view-meta').textContent = `${category} · ${items.length || cl.items_count || 0} item${(items.length || cl.items_count || 0) === 1 ? '' : 's'}`;

    const summary = SC.$('#modal-checklist-view-summary');
    if (summary) {
      summary.innerHTML = `
        <section class="assessment-section">
          <h4 class="assessment-section__title">
            <img src="https://api.iconify.design/lucide/info.svg?color=%230F3D30" alt="" width="16" height="16">
            Checklist summary
          </h4>
          <div class="publish-summary">
            <div class="publish-summary__card">
              <span class="publish-summary__label">Category</span>
              <strong class="publish-summary__value">${escapeHtml(category)}</strong>
            </div>
            <div class="publish-summary__card">
              <span class="publish-summary__label">Items</span>
              <strong class="publish-summary__value">${items.length || cl.items_count || 0}</strong>
            </div>
            <div class="publish-summary__card">
              <span class="publish-summary__label">Status</span>
              <strong class="publish-summary__value">${cl.is_active === false ? 'Inactive' : 'Active'}</strong>
            </div>
            <div class="publish-summary__card">
              <span class="publish-summary__label">Updated</span>
              <strong class="publish-summary__value">${escapeHtml(checklistDateLabel(cl))}</strong>
            </div>
          </div>
          ${copy.purpose ? `<p class="publish-summary__purpose"><span>Purpose</span>${escapeHtml(copy.purpose)}</p>` : ''}
          ${copy.body && copy.body !== copy.purpose ? `<p class="assessment-section__hint" style="margin-top:0.85rem">${escapeHtml(copy.body)}</p>` : ''}
        </section>`;
    }

    const itemsRoot = SC.$('#modal-checklist-view-items');
    if (itemsRoot) {
      itemsRoot.innerHTML = items.length
        ? items
            .map((item, index) => {
              const parts = splitPrompt(item.prompt || 'Untitled prompt');
              const hint = item.scoring_hint || parts.hint;
              return `
              <article class="response-row">
                <div class="response-row__head">
                  <span class="response-row__index">Item ${index + 1}</span>
                  ${item.domain ? `<span class="domain-tag">${escapeHtml(item.domain)}</span>` : ''}
                </div>
                <p class="response-row__prompt">${escapeHtml(parts.prompt)}</p>
                ${hint ? `<p class="response-row__hint">${escapeHtml(hint)}</p>` : ''}
              </article>`;
            })
            .join('')
        : '<p class="profile-empty">No items in this checklist.</p>';
    }

    const useBtn = SC.$('#checklist-view-use-btn');
    if (useBtn) {
      useBtn.onclick = () => {
        closeModal('modal-checklist-view');
        useChecklistInAssessment(id);
      };
    }
    openModal('modal-checklist-view');
  }

  function useChecklistInAssessment(id) {
    const checklistId = String(id);
    const page = currentDashboardPage();

    if (page === 'checklists.html') {
      sessionStorage.setItem(PENDING_ASSESSMENT_CHECKLIST_KEY, checklistId);
      window.location.href = 'assessments.html';
      return;
    }

    if (page === 'dashboard.html') {
      SC.showSection?.('assessments', { updateRoute: false }).then(() => {
        applyAssessmentChecklistSelection(checklistId);
      });
      return;
    }

    if (!SC.$('#assessment-checklist') || !SC.$('#modal-assessment')) {
      sessionStorage.setItem(PENDING_ASSESSMENT_CHECKLIST_KEY, checklistId);
      window.location.href = 'assessments.html';
      return;
    }

    applyAssessmentChecklistSelection(checklistId);
  }

  async function openChecklistEdit(id) {
    if (!canCreateChecklists()) return;
    if (typeof SC.loadChecklistIntoWizard === 'function') {
      await SC.loadChecklistIntoWizard(id);
    }
  }

  async function toggleChecklistActive(id, button) {
    if (!canCreateChecklists()) return;
    const cl = SC.state.checklistsCache.find((c) => String(c.id) === String(id));
    if (!cl) return;
    try {
      await SC.withBusy({ button, busyLabel: 'Updating…' }, async () => {
        await SmartCareAPI.put(`/checklists/${id}`, { is_active: !(cl.is_active !== false) });
        await loadChecklists();
      });
    } catch (err) {
      window.alert(err.message || 'Could not update checklist.');
    }
  }

  async function deleteChecklist(id, button) {
    if (!canCreateChecklists()) return;
    const cl = SC.state.checklistsCache.find((c) => String(c.id) === String(id));
    if (!cl) return;
    if (!window.confirm(`Delete checklist "${cl.title}"? This cannot be undone.`)) return;
    try {
      await SC.withBusy({ button, busyLabel: 'Deleting…' }, async () => {
        await SmartCareAPI.delete(`/checklists/${id}`);
        await loadChecklists();
      });
    } catch (err) {
      window.alert(err.message || 'Could not delete checklist.');
    }
  }

  function bindChecklistMenus() {
    SC.$$('[data-checklist-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-checklist-menu');
        const menu = SC.$(`#checklist-menu-${id}`);
        const wasOpen = menu?.classList.contains('is-open');
        closeAllChecklistMenus();
        if (!wasOpen && menu) {
          menu.hidden = false;
          menu.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    SC.$$('[data-checklist-action]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-checklist-action');
        const id = btn.getAttribute('data-id');
        closeAllChecklistMenus();
        if (action === 'view') openChecklistView(id);
        if (action === 'use') useChecklistInAssessment(id);
        if (action === 'edit') await openChecklistEdit(id);
        if (action === 'toggle') await toggleChecklistActive(id, btn);
        if (action === 'delete') await deleteChecklist(id, btn);
      });
    });
  }

  function initChecklistMenuDismiss() {
    document.addEventListener('click', () => closeAllChecklistMenus());
  }

  async function loadChecklists() {
    const loading = SC.$('#checklists-loading');
    const empty = SC.$('#checklists-empty');
    const list = SC.$('#checklists-list');

    if (!canManageChildren() && !canCreateChecklists()) {
      if (loading) loading.textContent = 'Checklists require Head Doctor or Psychometrician access.';
      return;
    }

    try {
      await SC.withBusy({ section: loading }, async () => {
        SC.state.checklistsCache = await SmartCareAPI.get('/checklists');
        if (!Array.isArray(SC.state.checklistsCache)) SC.state.checklistsCache = SC.state.checklistsCache.data || [];
      });
    } catch (err) {
      if (loading) loading.textContent = `Could not load checklists: ${err.message}`;
      return;
    }

    if (loading) loading.hidden = true;
    populateChecklistSelect();
    updateAssessSummaryCounts();
    renderChecklistsLibrary();
    consumePendingAssessmentChecklist();
  }

  function initChecklistFilters() {
    const apply = () => {
      checklistsPage = 1;
      renderChecklistsLibrary();
    };
    SC.$('#checklists-search')?.addEventListener('input', apply);
    SC.$('#checklists-filter-category')?.addEventListener('change', apply);
    SC.bindPaginationControls({
      prevId: '#checklists-page-prev',
      nextId: '#checklists-page-next',
      getPage: () => checklistsPage,
      setPage: (page) => {
        checklistsPage = page;
      },
      getTotalPages: () => SC.paginate(filterChecklists(), checklistsPage, CHECKLISTS_PAGE_SIZE).totalPages,
      onChange: renderChecklistsLibrary,
    });
  }

  function updateAssessSummaryCounts() {
    const childrenCount = SC.$('#assess-children-count');
    const childrenLabel = SC.$('#assess-children-label');
    const checklistsCount = SC.$('#assess-checklists-count');
    const checklistsLabel = SC.$('#assess-checklists-label');
    const childTotal = SC.state.childrenCache.length;
    const activeChecklists = SC.state.checklistsCache.filter((c) => c.is_active !== false).length;
    if (childrenCount) childrenCount.textContent = String(childTotal);
    if (childrenLabel) childrenLabel.textContent = SC.pluralLabel(childTotal, 'Child available', 'Children available');
    if (checklistsCount) checklistsCount.textContent = String(activeChecklists);
    if (checklistsLabel) checklistsLabel.textContent = SC.pluralLabel(activeChecklists, 'Active checklist', 'Active checklists');
  }

  function populateChecklistSelect() {
    const el = SC.$('#assessment-checklist');
    if (!el) return;
    const current = el.value;
    el.innerHTML =
      '<option value="">Select a checklist…</option>' +
      SC.state.checklistsCache
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
    const form = SC.$('#create-checklist-form');
    const container = SC.$('#checklist-items-container');
    const addBtn = SC.$('#add-checklist-item-btn');
    if (!form || !container || !addBtn) return;

    let checklistStep = 1;
    let hasDraft = false;
    let editingChecklistId = null;
    let lastScoringGuide = '0 not observed · 1 emerging · 2 developing · 3 consistent';

    function syncChecklistModalChrome() {
      const titleEl = SC.$('#modal-checklist-title');
      const publishBtn = SC.$('#checklist-publish-btn');
      const isEdit = Boolean(editingChecklistId);
      if (titleEl) titleEl.textContent = isEdit ? 'Edit Checklist' : 'Create Checklist';
      if (publishBtn) publishBtn.textContent = isEdit ? 'Save changes' : 'Publish checklist';
    }

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
      SC.$$('#checklist-wizard-steps li').forEach((li) => {
        const n = Number(li.dataset.step);
        li.classList.toggle('is-active', n === step);
        li.classList.toggle('is-done', n < step);
      });
      SC.$$('#create-checklist-form .wizard-pane').forEach((pane) => {
        const n = Number(pane.dataset.pane);
        const active = n === step;
        pane.classList.toggle('is-active', active);
        pane.hidden = !active;
      });
      hideAlert(SC.$('#create-checklist-alert'));
      if (step === 2) renderAiSummary();
      if (step === 3) {
        requestAnimationFrame(() => autoResizeTextareas(container));
      }
      if (step === 4) renderPublishPreview();
      syncWizardFooter(step);
    }

    function syncWizardFooter(step) {
      const show = {
        1: ['checklist-footer-cancel', 'checklist-step-to-ai'],
        2: ['checklist-footer-back', 'checklist-skip-ai-btn', 'checklist-generate-ai-btn', 'checklist-step-to-review'],
        3: ['checklist-footer-back', 'checklist-step-to-publish'],
        4: ['checklist-footer-back', 'checklist-publish-btn'],
      }[step] || [];
      [
        'checklist-footer-cancel',
        'checklist-footer-back',
        'checklist-step-to-ai',
        'checklist-skip-ai-btn',
        'checklist-generate-ai-btn',
        'checklist-step-to-review',
        'checklist-step-to-publish',
        'checklist-publish-btn',
      ].forEach((id) => {
        const el = SC.$('#' + id);
        if (el) el.hidden = !show.includes(id);
      });
      const back = SC.$('#checklist-footer-back');
      if (back) back.setAttribute('data-checklist-step', String(Math.max(1, step - 1)));
    }

    function setScoringGuide(text) {
      const guideEl = SC.$('#checklist-scoring-guide .assessment-score-guide__text');
      if (guideEl) guideEl.textContent = text;
    }

    function collectDefineFields() {
      return {
        title: (SC.$('#checklist-title')?.value || '').trim(),
        category: SC.$('#checklist-category')?.value || '',
        age_band: SC.$('#checklist-age-band')?.value || '',
        diagnosis_focus: SC.$('#checklist-diagnosis')?.value || '',
        purpose: (SC.$('#checklist-purpose')?.value || '').trim(),
        description: (SC.$('#checklist-description')?.value || '').trim(),
        item_count: Number(SC.$('#checklist-item-count')?.value || 8),
      };
    }

    function validateDefine() {
      const alertEl = SC.$('#create-checklist-alert');
      clearAllFieldErrors();
      const data = collectDefineFields();
      let firstInvalid = null;

      if (!data.title) {
        setFieldError(SC.$('#checklist-title'), 'Title is required.');
        firstInvalid = firstInvalid || SC.$('#checklist-title');
      }
      if (!data.category) {
        setFieldError(SC.$('#checklist-category'), 'Category is required.');
        firstInvalid = firstInvalid || SC.$('#checklist-category');
      }
      if (!data.purpose) {
        setFieldError(SC.$('#checklist-purpose'), 'Clinical purpose is required.');
        firstInvalid = firstInvalid || SC.$('#checklist-purpose');
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
      const alertEl = SC.$('#create-checklist-alert');
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
      const el = SC.$('#checklist-ai-summary');
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
      const reviewBtn = SC.$('#checklist-step-to-review');
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
      const el = SC.$('#checklist-publish-preview');
      if (!el) return;
      const statusLabel = SC.$('#checklist-is-active')?.checked ? 'Active' : 'Inactive';
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
      const alertEl = SC.$('#create-checklist-alert');
      const statusEl = SC.$('#checklist-ai-status');
      const data = validateDefine();
      if (!data) return;

      const generateBtn = SC.$('#checklist-generate-ai-btn');
      const regenerateBtn = SC.$('#checklist-regenerate-ai-btn');
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

        if (draft.title && !SC.$('#checklist-title').value.trim()) {
          SC.$('#checklist-title').value = draft.title;
        }
        if (draft.description && !SC.$('#checklist-description').value.trim()) {
          SC.$('#checklist-description').value = draft.description;
        }
        if (draft.scoring_guide) {
          lastScoringGuide = draft.scoring_guide;
          setScoringGuide(`Score guide: ${draft.scoring_guide} Use scoring hints as reviewer cues — edit prompts so they stay clear and complete.`);
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

    async function loadChecklistIntoWizard(id) {
      let cl = SC.state.checklistsCache.find((c) => String(c.id) === String(id));
      if (!cl) return;

      if (!Array.isArray(cl.items) || !cl.items.length) {
        try {
          const full = await SmartCareAPI.get(`/checklists/${id}`);
          cl = { ...cl, ...full };
          SC.state.checklistsCache = SC.state.checklistsCache.map((c) => (String(c.id) === String(id) ? cl : c));
        } catch (err) {
          window.alert(err.message || 'Could not load checklist for editing.');
          return;
        }
      }

      const meta = parseChecklistDefineMeta(cl);
      hideAlert(SC.$('#create-checklist-alert'));
      clearAllFieldErrors();
      form.reset();

      SC.$('#checklist-title').value = cl.title || '';
      SC.$('#checklist-category').value = meta.category || '';
      SC.$('#checklist-age-band').value = meta.age_band || '';
      SC.$('#checklist-diagnosis').value = meta.diagnosis_focus || '';
      SC.$('#checklist-purpose').value = meta.purpose || '';
      SC.$('#checklist-description').value = meta.description || '';
      SC.$('#checklist-item-count').value = String(cl.items?.length || 8);
      SC.$('#checklist-scoring').value = '0–3 observation scale';
      SC.$('#checklist-is-active').checked = cl.is_active !== false;
      SC.$('#checklist-open-assessment').checked = false;

      if (meta.scoring_guide) {
        lastScoringGuide = meta.scoring_guide;
        setScoringGuide(
          `Score guide: ${meta.scoring_guide} Use scoring hints as reviewer cues — edit prompts so they stay clear and complete.`
        );
      } else {
        lastScoringGuide = '0 not observed · 1 emerging · 2 developing · 3 consistent';
        setScoringGuide('Use scoring hints as reviewer cues — edit prompts so they stay clear and complete.');
      }

      const statusEl = SC.$('#checklist-ai-status');
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.textContent = '';
      }

      const builderItems = (cl.items || [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((item) => {
          const parts = splitChecklistPrompt(item.prompt);
          return {
            prompt: parts.prompt,
            domain: item.domain || '',
            scoring_hint: item.scoring_hint || parts.hint,
          };
        });

      setItems(builderItems.length ? builderItems : [{}]);
      hasDraft = true;
      editingChecklistId = cl.id;
      const reviewBtn = SC.$('#checklist-step-to-review');
      if (reviewBtn) reviewBtn.disabled = false;
      syncChecklistModalChrome();
      autoResizeTextareas(form);
      setChecklistStep(1);
      openModal('modal-checklist');
    }

    function resetChecklistWizard() {
      form.reset();
      editingChecklistId = null;
      syncChecklistModalChrome();
      clearAllFieldErrors();
      SC.$('#checklist-item-count').value = '8';
      SC.$('#checklist-scoring').value = '0–3 observation scale';
      SC.$('#checklist-is-active').checked = true;
      SC.$('#checklist-open-assessment').checked = false;
      lastScoringGuide = '0 not observed · 1 emerging · 2 developing · 3 consistent';
      setScoringGuide('Use scoring hints as reviewer cues — edit prompts so they stay clear and complete.');
      const statusEl = SC.$('#checklist-ai-status');
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.textContent = '';
      }
      setItems([{}]);
      hasDraft = false;
      const reviewBtn = SC.$('#checklist-step-to-review');
      if (reviewBtn) reviewBtn.disabled = true;
      hideAlert(SC.$('#create-checklist-alert'));
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
      const reviewBtn = SC.$('#checklist-step-to-review');
      if (reviewBtn) reviewBtn.disabled = false;
      row.querySelector('.item-prompt')?.focus();
    });

    container.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-item-btn')) {
        e.target.closest('.checklist-item-row')?.remove();
        updateRemoveButtons();
      }
    });

    SC.$('#checklist-step-to-ai')?.addEventListener('click', () => {
      if (!validateDefine()) return;
      setChecklistStep(2);
    });

    SC.$$('[data-checklist-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = Number(btn.getAttribute('data-checklist-step'));
        if (!Number.isNaN(step)) setChecklistStep(step);
      });
    });

    SC.$('#checklist-generate-ai-btn')?.addEventListener('click', () => generateAiDraft({ advance: true }));
    SC.$('#checklist-regenerate-ai-btn')?.addEventListener('click', () => generateAiDraft({ advance: false }));

    SC.$('#checklist-skip-ai-btn')?.addEventListener('click', () => {
      if (!hasDraft || !container.querySelector('.item-prompt')?.value.trim()) {
        setItems([{}]);
      }
      const reviewBtn = SC.$('#checklist-step-to-review');
      if (reviewBtn) reviewBtn.disabled = false;
      setChecklistStep(3);
    });

    SC.$('#checklist-step-to-review')?.addEventListener('click', () => {
      if (!hasDraft) {
        showAlert(SC.$('#create-checklist-alert'), 'Generate an AI draft or start blank first.', 'error');
        return;
      }
      setChecklistStep(3);
    });

    SC.$('#checklist-step-to-publish')?.addEventListener('click', () => {
      const data = validateDefine();
      if (!data) return;
      if (!validateItems(data.category)) return;
      setChecklistStep(4);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canCreateChecklists()) return;

      const alertEl = SC.$('#create-checklist-alert');
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
        is_active: !!SC.$('#checklist-is-active')?.checked,
        items,
      };

      const publishBtn = e.submitter || SC.$('#checklist-publish-btn');

      const busyLabel = editingChecklistId ? 'Saving…' : 'Publishing…';

      try {
        await SC.withBusy({ button: publishBtn, busyLabel }, async () => {
          let saved;
          if (editingChecklistId) {
            saved = await SmartCareAPI.put(`/checklists/${editingChecklistId}`, payload);
          } else {
            saved = await SmartCareAPI.post('/checklists', payload);
          }
          const openAssessment = !!SC.$('#checklist-open-assessment')?.checked;
          const checklistId = saved?.id || editingChecklistId;
          await loadChecklists();
          resetChecklistWizard();
          closeModal('modal-checklist');
          if (openAssessment && checklistId) {
            useChecklistInAssessment(checklistId);
          }
        });
      } catch (err) {
        showAlert(alertEl, err.message, 'error');
      }
    });

    const modal = SC.$('#modal-checklist');
    if (modal) {
      modal.addEventListener('close', () => {
        resetChecklistWizard();
      });
    }

    SC.loadChecklistIntoWizard = loadChecklistIntoWizard;
    syncChecklistModalChrome();

    setItems([{}]);
    hasDraft = false;
    const reviewBtn = SC.$('#checklist-step-to-review');
    if (reviewBtn) reviewBtn.disabled = true;
    setChecklistStep(1);
  }


  SC.parseChecklistCategory = parseChecklistCategory;
  SC.stripChecklistCategory = stripChecklistCategory;
  SC.buildChecklistDescription = buildChecklistDescription;
  SC.checklistDateLabel = checklistDateLabel;
  SC.filterChecklists = filterChecklists;
  SC.renderChecklistsLibrary = renderChecklistsLibrary;
  SC.closeAllChecklistMenus = closeAllChecklistMenus;
  SC.openChecklistView = openChecklistView;
  SC.openChecklistEdit = openChecklistEdit;
  SC.useChecklistInAssessment = useChecklistInAssessment;
  SC.consumePendingAssessmentChecklist = consumePendingAssessmentChecklist;
  SC.toggleChecklistActive = toggleChecklistActive;
  SC.deleteChecklist = deleteChecklist;
  SC.bindChecklistMenus = bindChecklistMenus;
  SC.initChecklistMenuDismiss = initChecklistMenuDismiss;
  SC.loadChecklists = loadChecklists;
  SC.initChecklistFilters = initChecklistFilters;
  SC.updateAssessSummaryCounts = updateAssessSummaryCounts;
  SC.populateChecklistSelect = populateChecklistSelect;
  SC.autoResizeTextarea = autoResizeTextarea;
  SC.autoResizeTextareas = autoResizeTextareas;
  SC.checklistItemRowHtml = checklistItemRowHtml;
  SC.initChecklistBuilder = initChecklistBuilder;
})(window.SmartCareApp);
