/** SmartCare dashboard — children */
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

  const openChildProfile = (...args) => SC.openChildProfile(...args);
  const populateChecklistSelect = (...args) => SC.populateChecklistSelect(...args);
  const updateAssessSummaryCounts = (...args) => SC.updateAssessSummaryCounts(...args);

  let childrenPage = 1;
  const CHILDREN_PAGE_SIZE = 8;
  let childrenFiltered = [];
  let pendingStatusAction = null;

  function patientId(child) {
    return `PT-${String(child.id).padStart(4, '0')}`;
  }

  function ageBandLabel(age) {
    const n = Number(age);
    if (Number.isNaN(n) || age == null || age === '') return '—';
    return String(n);
  }

  function ageBandValueFromLabel(label) {
    const n = Number(label);
    return Number.isNaN(n) ? '' : n;
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

  function userByRelation(child, relation) {
    const rel = String(relation || '').toLowerCase();
    return (child.users || []).find((u) => String(u.pivot?.relation || '').toLowerCase() === rel) || null;
  }

  function careTeamSummary(child) {
    const parts = [];
    ['teacher', 'parent', 'caretaker'].forEach((rel) => {
      const user = userByRelation(child, rel);
      if (user) {
        parts.push(`${formatRole(rel)}: ${user.name || user.username || `#${user.id}`}`);
      }
    });
    if (parts.length) return parts.join(' · ');
    const parsed = parseCaretakerFromNotes(child.condition_notes);
    if (parsed) {
      return parsed.relation ? `${parsed.name} (${parsed.relation})` : parsed.name;
    }
    return '—';
  }

  function careTeamCellHtml(child) {
    const rows = [];
    ['teacher', 'parent', 'caretaker'].forEach((rel) => {
      const user = userByRelation(child, rel);
      if (!user) return;
      const name = user.name || user.username || `#${user.id}`;
      rows.push(
        `<div class="care-team-line"><strong>${escapeHtml(formatRole(rel))}:</strong> ${escapeHtml(name)}</div>`
      );
    });
    if (rows.length) return rows.join('');
    const parsed = parseCaretakerFromNotes(child.condition_notes);
    if (parsed) {
      const label = parsed.relation
        ? `${escapeHtml(parsed.name)} (${escapeHtml(parsed.relation)})`
        : escapeHtml(parsed.name);
      return `<div class="care-team-line">${label}</div>`;
    }
    return '—';
  }

  function primaryCaretaker(child) {
    return careTeamSummary(child);
  }

  function roleOfUser(user) {
    const role = user?.role;
    if (!role) return '';
    if (typeof role === 'object') return String(role.value || role.name || '').toLowerCase();
    return String(role).toLowerCase();
  }

  function normalizeUsersPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.users)) return payload.users;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  async function ensureUsersCache(force = false) {
    if (!force && Array.isArray(SC.state.usersCache) && SC.state.usersCache.length) {
      return SC.state.usersCache;
    }
    try {
      const payload = await SmartCareAPI.get('/users');
      SC.state.usersCache = normalizeUsersPayload(payload);
    } catch {
      SC.state.usersCache = [];
    }
    return SC.state.usersCache;
  }

  function populateCareTeamSelects(selected = {}) {
    const users = normalizeUsersPayload(SC.state.usersCache);
    const configs = [
      { id: '#child-assign-teacher', role: 'teacher', selected: selected.teacher },
      { id: '#child-assign-parent', role: 'parent', selected: selected.parent },
      { id: '#child-assign-caretaker', role: 'caretaker', selected: selected.caretaker },
    ];
    configs.forEach(({ id, role, selected: selectedId }) => {
      const el = SC.$(id);
      if (!el) return;
      const matches = users.filter((u) => roleOfUser(u) === role && (u.status || 'active') !== 'inactive');
      const options = matches
        .map(
          (u) =>
            `<option value="${u.id}" ${String(u.id) === String(selectedId || '') ? 'selected' : ''}>${escapeHtml(
              u.name || u.username || `${formatRole(role)} #${u.id}`
            )}</option>`
        )
        .join('');
      const emptyLabel = matches.length
        ? `No ${role} assigned…`
        : `No registered ${role}s yet…`;
      el.innerHTML = `<option value="">${emptyLabel}</option>${options}`;
      if (selectedId) el.value = String(selectedId);
    });
  }

  async function assignCareTeam(childId, assignments) {
    const tasks = Object.entries(assignments || {})
      .filter(([, userId]) => userId)
      .map(([relation, userId]) =>
        SmartCareAPI.post(`/children/${childId}/assign`, {
          user_id: Number(userId),
          relation,
        })
      );
    if (!tasks.length) return;
    await Promise.all(tasks);
  }

  function readCareTeamSelections() {
    return {
      teacher: SC.$('#child-assign-teacher')?.value || '',
      parent: SC.$('#child-assign-parent')?.value || '',
      caretaker: SC.$('#child-assign-caretaker')?.value || '',
    };
  }

  function diagnosisNeedsAttention(diagnosis) {
    const d = String(diagnosis || '').toLowerCase();
    return d.includes('level 3') || d.includes('severe');
  }

  function getChildrenFilters() {
    return {
      query: (SC.$('#children-search')?.value || '').trim().toLowerCase(),
      diagnosis: SC.$('#children-filter-diagnosis')?.value || '',
      age: SC.$('#children-filter-age')?.value || '',
      status: SC.$('#children-filter-status')?.value || 'active',
    };
  }

  function filterChildrenList() {
    const { query, diagnosis, age } = getChildrenFilters();
    return SC.state.childrenCache.filter((c) => {
      const pid = patientId(c).toLowerCase();
      const name = childName(c).toLowerCase();
      const diag = (c.diagnosis || '').toLowerCase();
      const matchQuery = !query || name.includes(query) || pid.includes(query) || diag.includes(query) || String(c.id).includes(query);
      const matchDiag = !diagnosis || (c.diagnosis || '') === diagnosis;
      const matchAge = !age || String(c.age_band ?? '') === String(age);
      return matchQuery && matchDiag && matchAge;
    });
  }

  function statusLabel(child) {
    if (child.deleted_at) return 'Deleted';
    return child.is_active !== false ? 'Active' : 'Inactive';
  }

  function statusPillClass(child) {
    if (child.deleted_at) return 'status-pill status-pill--inactive';
    return child.is_active !== false ? 'status-pill status-pill--active' : 'status-pill status-pill--inactive';
  }

  function updateStatusFilterOptions() {
    const deletedOpt = SC.$('#children-filter-status-deleted');
    if (deletedOpt) deletedOpt.hidden = !isHeadDoctor();
  }

  function updateStatusHint() {
    const hint = SC.$('#children-status-hint');
    if (!hint) return;
    const status = getChildrenFilters().status;
    if (status === 'inactive') {
      hint.hidden = false;
      hint.textContent = 'Inactive children keep all assessments and history. Activate them to include in new assessments.';
    } else if (status === 'deleted') {
      hint.hidden = false;
      hint.textContent = 'Soft-deleted records. Restore returns the child as Inactive so you can review before activating.';
    } else if (status === 'all') {
      hint.hidden = false;
      hint.textContent = 'Showing active and inactive children. Soft-deleted records are under Deleted.';
    } else {
      hint.hidden = true;
      hint.textContent = '';
    }
  }

  function refreshDiagnosisFilterOptions() {
    const select = SC.$('#children-filter-diagnosis');
    if (!select) return;
    const current = select.value;
    const diagnoses = [...new Set(SC.state.childrenCache.map((c) => c.diagnosis).filter(Boolean))].sort();
    select.innerHTML = `<option value="">All Diagnoses</option>${diagnoses
      .map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`)
      .join('')}`;
    if (current && diagnoses.includes(current)) select.value = current;
  }

  function renderChildrenTable() {
    const empty = SC.$('#children-empty');
    const wrap = SC.$('#children-table-wrap');
    const tbody = SC.$('#children-tbody');
    const pageInfo = SC.$('#children-page-info');
    const prevBtn = SC.$('#children-page-prev');
    const nextBtn = SC.$('#children-page-next');

    childrenFiltered = filterChildrenList();
    const total = childrenFiltered.length;
    const pages = Math.max(1, Math.ceil(total / CHILDREN_PAGE_SIZE));
    if (childrenPage > pages) childrenPage = pages;
    if (childrenPage < 1) childrenPage = 1;

    if (!SC.state.childrenCache.length) {
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
      if (pageInfo) pageInfo.textContent = `Showing 0 of ${SC.state.childrenCache.length} records`;
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const start = (childrenPage - 1) * CHILDREN_PAGE_SIZE;
    const pageItems = childrenFiltered.slice(start, start + CHILDREN_PAGE_SIZE);
    const showingFrom = start + 1;
    const showingTo = start + pageItems.length;

    const viewingDeleted = getChildrenFilters().status === 'deleted';

    tbody.innerHTML = pageItems
      .map((c) => {
        const active = c.is_active !== false && !c.deleted_at;
        const warn = diagnosisNeedsAttention(c.diagnosis);
        const manage = canManageChildren();
        const name = childName(c);
        const statusActions = viewingDeleted
          ? (isHeadDoctor()
            ? `<button type="button" class="icon-btn icon-btn--sm" data-child-status="restore" data-child-id="${c.id}" title="Restore" aria-label="Restore ${escapeHtml(name)}">${SC.icon('rotate-ccw', { size: 16 })}</button>`
            : '')
          : `${
              manage
                ? active
                  ? `<button type="button" class="icon-btn icon-btn--sm" data-child-status="deactivate" data-child-id="${c.id}" title="Inactivate" aria-label="Inactivate ${escapeHtml(name)}">${SC.icon('circle-off', { size: 16 })}</button>`
                  : `<button type="button" class="icon-btn icon-btn--sm" data-child-status="activate" data-child-id="${c.id}" title="Activate" aria-label="Activate ${escapeHtml(name)}">${SC.icon('badge-check', { size: 16 })}</button>`
                : ''
            }${
              isHeadDoctor()
                ? `<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-child-status="delete" data-child-id="${c.id}" title="Delete" aria-label="Delete ${escapeHtml(name)}">${SC.icon('trash-2', { size: 16 })}</button>`
                : ''
            }`;
        return `
        <tr class="${active ? '' : 'is-inactive'}">
          <td class="mono-id">${escapeHtml(patientId(c))}</td>
          <td><strong>${escapeHtml(name)}</strong></td>
          <td>
            <span class="diag-cell${warn ? ' diag-cell--warn' : ''}">
              ${warn ? '<span class="diag-warn" aria-hidden="true">⚠</span>' : ''}
              ${escapeHtml(c.diagnosis || '—')}
            </span>
          </td>
          <td>${escapeHtml(ageBandLabel(c.age_band))}</td>
          <td class="care-team-cell">${careTeamCellHtml(c)}</td>
          <td><span class="${statusPillClass(c)}">${escapeHtml(statusLabel(c))}</span></td>
          <td>
            <div class="row-actions">
              ${
                viewingDeleted
                  ? ''
                  : `<button type="button" class="icon-btn icon-btn--sm" data-profile-child="${c.id}" title="View profile" aria-label="View profile for ${escapeHtml(name)}">
                ${SC.icon('eye', { size: 16 })}
              </button>
              <button type="button" class="icon-btn icon-btn--sm" data-edit-child="${c.id}" title="Edit" aria-label="Edit ${escapeHtml(name)}" ${manage ? '' : 'disabled'}>
                ${SC.icon('pencil', { size: 16 })}
              </button>`
              }
              ${statusActions}
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
    tbody.querySelectorAll('[data-child-status]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-child-status');
        const id = Number(btn.getAttribute('data-child-id'));
        openChildStatusModal(id, action);
      });
    });
  }

  function openChildStatusModal(childId, action) {
    const child = SC.state.childrenCache.find((c) => Number(c.id) === Number(childId));
    if (!child) return;

    const configs = {
      deactivate: {
        title: 'Inactivate child',
        subtitle: `${patientId(child)} · ${childName(child)}`,
        copy: `Mark ${childName(child)} as Inactive?`,
        hint: 'Their profile and all assessments stay preserved. They leave the Active list and cannot receive new assessments until activated again.',
        commit: 'Inactivate',
        danger: false,
      },
      activate: {
        title: 'Activate child',
        subtitle: `${patientId(child)} · ${childName(child)}`,
        copy: `Return ${childName(child)} to Active?`,
        hint: 'They reappear on the Active Children list. Previous assessments stay unchanged.',
        commit: 'Activate',
        danger: false,
      },
      delete: {
        title: 'Delete child record',
        subtitle: `${patientId(child)} · ${childName(child)}`,
        copy: `Soft-delete ${childName(child)}?`,
        hint: 'The record is removed from Active/Inactive lists but can be restored by a Head Doctor. Assessments and history are not permanently erased.',
        commit: 'Delete',
        danger: true,
      },
      restore: {
        title: 'Restore child record',
        subtitle: `${patientId(child)} · ${childName(child)}`,
        copy: `Restore ${childName(child)}?`,
        hint: 'They return as Inactive. Activate them separately when they are back at the facility.',
        commit: 'Restore',
        danger: false,
      },
    };

    const cfg = configs[action];
    if (!cfg) return;

    pendingStatusAction = { childId, action };
    const modal = SC.$('#modal-child-status');
    if (modal) modal.setAttribute('data-child-status-mode', action);
    SC.$('#modal-child-status-title').textContent = cfg.title;
    SC.$('#modal-child-status-subtitle').textContent = cfg.subtitle;
    SC.$('#child-status-copy').textContent = cfg.copy;
    SC.$('#child-status-hint').textContent = cfg.hint;
    if (SC.$('#child-status-note')) SC.$('#child-status-note').value = '';
    hideAlert(SC.$('#child-status-alert'));

    const commitBtn = SC.$('#child-status-commit');
    if (commitBtn) {
      commitBtn.textContent = cfg.commit;
      commitBtn.classList.toggle('btn-danger', cfg.danger);
      commitBtn.classList.toggle('btn-primary', !cfg.danger);
    }

    openModal('modal-child-status');
  }

  async function commitChildStatusAction() {
    if (!pendingStatusAction) return;
    const { childId, action } = pendingStatusAction;
    const note = (SC.$('#child-status-note')?.value || '').trim() || null;
    const alertEl = SC.$('#child-status-alert');
    const commitBtn = SC.$('#child-status-commit');
    const body = note ? { note } : {};

    const paths = {
      deactivate: { method: 'PATCH', url: `/children/${childId}/deactivate` },
      activate: { method: 'PATCH', url: `/children/${childId}/activate` },
      delete: { method: 'DELETE', url: `/children/${childId}` },
      restore: { method: 'POST', url: `/children/${childId}/restore` },
    };
    const req = paths[action];
    if (!req) return;

    try {
      await SC.withBusy({
        button: commitBtn,
        busyLabel: 'Saving…',
      }, async () => {
        if (req.method === 'DELETE') {
          await SmartCareAPI.delete(req.url, body);
        } else if (req.method === 'POST') {
          await SmartCareAPI.post(req.url, body);
        } else {
          await SmartCareAPI.patch(req.url, body);
        }
      });
      pendingStatusAction = null;
      closeModal('modal-child-status');
      await loadChildren();
    } catch (err) {
      showAlert(alertEl, err.message, 'error');
    }
  }

  function resetChildForm() {
    const form = SC.$('#create-child-form');
    if (form) form.reset();
    SC.$('#child-edit-id').value = '';
    SC.$('#child-is-active').checked = true;
    SC.$('#modal-child-title').textContent = 'Register Child';
    SC.$('#modal-child-subtitle').textContent = 'Add a patient profile to the facility registry.';
    SC.$('#child-submit-btn').textContent = 'Register Child';
    SC.$('#child-submit-btn').hidden = false;
    const headerIcon = document.querySelector('#modal-child .modal__header-icon img');
    if (headerIcon) {
      headerIcon.src = 'https://api.iconify.design/lucide/user-plus.svg?color=%230F3D30';
    }
    form?.querySelectorAll('input, select, textarea, button[type=submit]').forEach((el) => {
      if (el.id === 'child-submit-btn') return;
      el.disabled = false;
    });
    populateCareTeamSelects();
    hideAlert(SC.$('#create-child-alert'));
  }

  async function openChildModal(childId, mode) {
    const child = SC.state.childrenCache.find((c) => c.id === childId);
    if (!child) return;
    resetChildForm();
    await ensureUsersCache();

    const isView = mode === 'view';
    SC.$('#modal-child-title').textContent = isView ? 'View Child' : 'Edit Child';
    SC.$('#modal-child-subtitle').textContent = isView
      ? `${patientId(child)} · read-only profile`
      : `Update profile for ${patientId(child)}.`;
    SC.$('#child-submit-btn').textContent = 'Save changes';
    SC.$('#child-submit-btn').hidden = isView;
    const headerIcon = document.querySelector('#modal-child .modal__header-icon img');
    if (headerIcon) {
      headerIcon.src = isView
        ? 'https://api.iconify.design/lucide/user-round.svg?color=%230F3D30'
        : 'https://api.iconify.design/lucide/pencil.svg?color=%230F3D30';
    }
    SC.$('#child-edit-id').value = String(child.id);

    SC.$('#child-first-name').value = child.first_name || '';
    SC.$('#child-last-name').value = child.last_name || '';
    SC.$('#child-birth-date').value = child.birth_date ? String(child.birth_date).slice(0, 10) : '';
    SC.$('#child-sex').value = child.sex || '';
    SC.$('#child-age').value = child.age_band != null && child.age_band !== '' ? String(child.age_band) : '';
    SC.$('#child-diagnosis').value = child.diagnosis || '';
    SC.$('#child-is-active').checked = child.is_active !== false;

    SC.$('#child-notes').value = stripCaretakerFromNotes(child.condition_notes || '');
    populateCareTeamSelects({
      teacher: userByRelation(child, 'teacher')?.id || '',
      parent: userByRelation(child, 'parent')?.id || '',
      caretaker: userByRelation(child, 'caretaker')?.id || '',
    });

    if (isView) {
      SC.$('#create-child-form')
        .querySelectorAll('input, select, textarea')
        .forEach((el) => {
          el.disabled = true;
        });
    }

    openModal('modal-child');
  }

  function normalizeChildrenPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  async function loadChildren() {
    const loading = SC.$('#children-loading');
    updateStatusFilterOptions();
    updateStatusHint();

    const status = getChildrenFilters().status || 'active';
    const listUrl = status === 'deleted' ? '/children?trashed=1' : `/children?status=${encodeURIComponent(status)}`;

    try {
      SC.state.childrenCache = normalizeChildrenPayload(await SmartCareAPI.get(listUrl));
      // Pickers always use Active children so inactive/deleted never enter new workflows.
      if (status === 'active') {
        SC.state.childrenActiveCache = SC.state.childrenCache.slice();
      } else {
        SC.state.childrenActiveCache = normalizeChildrenPayload(await SmartCareAPI.get('/children?status=active'));
      }
    } catch (err) {
      if (loading) loading.textContent = `Could not load children: ${err.message}`;
      return;
    }

    if (loading) loading.hidden = true;
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
    const reload = () => {
      childrenPage = 1;
      loadChildren();
    };
    SC.$('#children-search')?.addEventListener('input', apply);
    SC.$('#children-filter-diagnosis')?.addEventListener('change', apply);
    SC.$('#children-filter-age')?.addEventListener('input', apply);
    SC.$('#children-filter-status')?.addEventListener('change', reload);
    SC.$('#children-filter-clear')?.addEventListener('click', () => {
      if (SC.$('#children-search')) SC.$('#children-search').value = '';
      if (SC.$('#children-filter-diagnosis')) SC.$('#children-filter-diagnosis').value = '';
      if (SC.$('#children-filter-age')) SC.$('#children-filter-age').value = '';
      if (SC.$('#children-filter-status')) SC.$('#children-filter-status').value = 'active';
      reload();
    });
    SC.$('#children-page-prev')?.addEventListener('click', () => {
      childrenPage -= 1;
      renderChildrenTable();
    });
    SC.$('#children-page-next')?.addEventListener('click', () => {
      childrenPage += 1;
      renderChildrenTable();
    });
    SC.$('#open-child-modal')?.addEventListener('click', async () => {
      if (!canManageChildren()) return;
      await ensureUsersCache();
      resetChildForm();
    });
    SC.$('#empty-open-child')?.addEventListener('click', async () => {
      if (!canManageChildren()) return;
      await ensureUsersCache();
      resetChildForm();
    });
    SC.$('#child-status-commit')?.addEventListener('click', () => {
      commitChildStatusAction();
    });
  }

  function populateChildSelects() {
    const activeChildren = Array.isArray(SC.state.childrenActiveCache)
      ? SC.state.childrenActiveCache
      : (SC.state.childrenCache || []).filter((c) => c.is_active !== false && !c.deleted_at);

    const options = activeChildren
      .map((c) => `<option value="${c.id}">${escapeHtml(childName(c))}</option>`)
      .join('');

    [
      '#assessment-child',
      '#report-child',
      '#therapy-filter-child',
      '#therapy-session-child',
      '#therapy-suggest-child',
      '#medication-filter-child',
      '#medication-child',
      '#progress-update-child',
    ].forEach((sel) => {
      const el = SC.$(sel);
      if (!el) return;
      const current = el.value;
      const placeholder = sel.includes('filter') ? 'All children' : 'Select a child…';
      el.innerHTML = `<option value="">${placeholder}</option>${options}`;
      if (current && activeChildren.some((c) => String(c.id) === String(current))) {
        el.value = current;
      }
    });
  }

  function resolveDiagnosisValue() {
    const selected = (SC.$('#child-diagnosis')?.value || '').trim();
    return selected || null;
  }

  function initCreateChild() {
    SC.$('#create-child-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canManageChildren()) return;

      const alertEl = SC.$('#create-child-alert');
      hideAlert(alertEl);

      const editId = SC.$('#child-edit-id').value;
      const careTeam = readCareTeamSelections();
      const notes = (SC.$('#child-notes').value || '').trim();
      const ageRaw = SC.$('#child-age')?.value;
      const payload = {
        first_name: SC.$('#child-first-name').value.trim(),
        last_name: SC.$('#child-last-name').value.trim(),
        birth_date: SC.$('#child-birth-date').value || null,
        sex: SC.$('#child-sex').value || null,
        age_band: ageRaw ? parseInt(ageRaw, 10) : null,
        diagnosis: resolveDiagnosisValue(),
        condition_notes: notes || null,
        is_active: SC.$('#child-is-active').checked,
      };

      try {
        await SC.withBusy({
          button: e.submitter || '#child-submit-btn',
          busyLabel: editId ? 'Saving…' : 'Registering…',
        }, async () => {
          let childId = editId ? Number(editId) : null;
          if (editId) {
            await SmartCareAPI.put(`/children/${editId}`, payload);
          } else {
            const created = await SmartCareAPI.post('/children', payload);
            childId = created?.id || created?.data?.id || null;
          }
          if (childId) {
            await assignCareTeam(childId, careTeam);
          }
          showAlert(
            alertEl,
            editId ? 'Child updated successfully.' : 'Child registered successfully.',
            'success'
          );
          e.target.reset();
          resetChildForm();
          await loadChildren();
          closeModal('modal-child');
          hideAlert(alertEl);
        });
      } catch (err) {
        showAlert(alertEl, err.message, 'error');
      }
    });
  }

  SC.patientId = patientId;
  SC.ageBandLabel = ageBandLabel;
  SC.ageBandValueFromLabel = ageBandValueFromLabel;
  SC.parseCaretakerFromNotes = parseCaretakerFromNotes;
  SC.stripCaretakerFromNotes = stripCaretakerFromNotes;
  SC.buildConditionNotes = buildConditionNotes;
  SC.userByRelation = userByRelation;
  SC.careTeamSummary = careTeamSummary;
  SC.primaryCaretaker = primaryCaretaker;
  SC.populateCareTeamSelects = populateCareTeamSelects;
  SC.ensureUsersCache = ensureUsersCache;
  SC.diagnosisNeedsAttention = diagnosisNeedsAttention;
  SC.getChildrenFilters = getChildrenFilters;
  SC.filterChildrenList = filterChildrenList;
  SC.refreshDiagnosisFilterOptions = refreshDiagnosisFilterOptions;
  SC.renderChildrenTable = renderChildrenTable;
  SC.resetChildForm = resetChildForm;
  SC.openChildModal = openChildModal;
  SC.loadChildren = loadChildren;
  SC.initChildrenSearch = initChildrenSearch;
  SC.populateChildSelects = populateChildSelects;
  SC.resolveDiagnosisValue = resolveDiagnosisValue;
  SC.initCreateChild = initCreateChild;
  SC.openChildStatusModal = openChildStatusModal;
})(window.SmartCareApp);
