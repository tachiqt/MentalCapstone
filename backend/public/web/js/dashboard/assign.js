/** SmartCare dashboard — assign children to teacher / parent / caretaker */
(function (SC) {
  const { escapeHtml, showAlert, hideAlert, openModal, closeModal, childName } = SC;

  let assigneesCache = [];
  let childrenCache = [];

  const ROLE_LABELS = {
    teacher: 'Teacher',
    parent: 'Parent',
    caretaker: 'Caretaker',
  };

  function canAssign() {
    return typeof SC.canManageChildren === 'function' ? SC.canManageChildren() : false;
  }

  function roleOf(user) {
    const role = user?.role ?? user?.roles?.[0];
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

  function currentRelation() {
    return String(SC.$('#assign-relation')?.value || 'teacher').toLowerCase();
  }

  async function ensureCaches() {
    if (!Array.isArray(SC.state.childrenCache) || !SC.state.childrenCache.length) {
      SC.state.childrenCache = await SmartCareAPI.get('/children');
      if (!Array.isArray(SC.state.childrenCache)) SC.state.childrenCache = SC.state.childrenCache.data || [];
    }
    childrenCache = SC.state.childrenCache || [];

    if (!Array.isArray(SC.state.usersCache) || !SC.state.usersCache.length) {
      try {
        const payload = await SmartCareAPI.get('/users');
        SC.state.usersCache = normalizeUsersPayload(payload);
      } catch {
        SC.state.usersCache = [];
      }
    }
    refreshAssigneesForRelation();
  }

  function refreshAssigneesForRelation() {
    const relation = currentRelation();
    assigneesCache = normalizeUsersPayload(SC.state.usersCache).filter(
      (u) => roleOf(u) === relation && (u.status || 'active') !== 'inactive'
    );
  }

  function updateAssignCopy() {
    const relation = currentRelation();
    const label = ROLE_LABELS[relation] || 'Account';
    const userLabel = SC.$('#assign-user-label');
    const hint = SC.$('#assign-user-hint');
    const subtitle = SC.$('#modal-assign-subtitle');
    if (userLabel) userLabel.textContent = `${label} account`;
    if (hint) {
      hint.textContent = `Assigned children appear on that ${label.toLowerCase()}’s mobile app after save.`;
    }
    if (subtitle) {
      subtitle.textContent = `Choose a ${label.toLowerCase()}, then select one or more children.`;
    }
  }

  function renderUserSelect(selectedId = '') {
    const el = SC.$('#assign-user');
    if (!el) return;
    const relation = currentRelation();
    const label = ROLE_LABELS[relation] || 'account';
    el.innerHTML =
      `<option value="">Select a ${label.toLowerCase()}…</option>` +
      assigneesCache
        .map(
          (u) =>
            `<option value="${u.id}" ${String(u.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(
              u.name || u.username || `${label} #${u.id}`
            )}</option>`
        )
        .join('');
  }

  function alreadyAssignedIds(userId, relation) {
    if (!userId) return new Set();
    const set = new Set();
    childrenCache.forEach((child) => {
      (child.users || []).forEach((u) => {
        if (
          String(u.id) === String(userId) &&
          String(u.pivot?.relation || '').toLowerCase() === relation
        ) {
          set.add(child.id);
        }
      });
    });
    return set;
  }

  function renderChildrenList() {
    const list = SC.$('#assign-children-list');
    if (!list) return;
    const userId = SC.$('#assign-user')?.value || '';
    const relation = currentRelation();
    const q = (SC.$('#assign-children-search')?.value || '').trim().toLowerCase();
    const assigned = alreadyAssignedIds(userId, relation);

    const rows = childrenCache
      .filter((c) => c.is_active !== false)
      .filter((c) => {
        if (!q) return true;
        const hay = `${childName(c)} ${c.id} ${c.diagnosis || ''}`.toLowerCase();
        return hay.includes(q);
      });

    if (!rows.length) {
      list.innerHTML = '<p class="form-hint">No children match this search.</p>';
      return;
    }

    list.innerHTML = rows
      .map((c) => {
        const checked = assigned.has(c.id) ? 'checked' : '';
        const note = assigned.has(c.id)
          ? '<span class="assign-child__note">Already assigned</span>'
          : '';
        return `<label class="assign-child">
          <input type="checkbox" name="assign-child" value="${c.id}" ${checked}>
          <span class="assign-child__copy">
            <strong>${escapeHtml(childName(c))}</strong>
            <span>${escapeHtml(c.diagnosis || 'No diagnosis recorded')}</span>
            ${note}
          </span>
        </label>`;
      })
      .join('');
  }

  function onRelationChange(preserveUserId = '') {
    refreshAssigneesForRelation();
    updateAssignCopy();
    const keep =
      preserveUserId && assigneesCache.some((u) => String(u.id) === String(preserveUserId))
        ? preserveUserId
        : '';
    renderUserSelect(keep);
    renderChildrenList();
  }

  /**
   * @param {string|number} [preselectUserId]
   * @param {string} [preselectRelation] teacher|parent|caretaker
   */
  async function openAssignModal(preselectUserId = '', preselectRelation = '') {
    if (!canAssign()) return;
    const alertEl = SC.$('#assign-alert');
    hideAlert(alertEl);
    try {
      await ensureCaches();
      const relationEl = SC.$('#assign-relation');
      if (relationEl) {
        const roleHint = preselectRelation
          || roleOf((SC.state.usersCache || []).find((u) => String(u.id) === String(preselectUserId)))
          || 'teacher';
        relationEl.value = ['teacher', 'parent', 'caretaker'].includes(roleHint) ? roleHint : 'teacher';
      }
      if (SC.$('#assign-children-search')) SC.$('#assign-children-search').value = '';
      onRelationChange(preselectUserId);
      openModal('modal-assign');
    } catch (err) {
      showAlert(alertEl, err.message || 'Could not load assignment options.', 'error');
      openModal('modal-assign');
    }
  }

  async function submitAssign(e) {
    e.preventDefault();
    if (!canAssign()) return;
    const alertEl = SC.$('#assign-alert');
    hideAlert(alertEl);

    const userId = Number(SC.$('#assign-user')?.value || 0);
    const relation = currentRelation();
    const label = ROLE_LABELS[relation] || 'account';
    const childIds = [...SC.$$('#assign-children-list input[name="assign-child"]:checked')].map((el) =>
      Number(el.value)
    );

    if (!userId) {
      showAlert(alertEl, `Select a ${label.toLowerCase()}.`, 'error');
      return;
    }
    if (!childIds.length) {
      showAlert(alertEl, 'Select at least one child.', 'error');
      return;
    }

    try {
      await SC.withBusy(
        {
          button: e.submitter || '#assign-submit-btn',
          busyLabel: 'Assigning…',
        },
        async () => {
          const result = await SmartCareAPI.post('/assignments', {
            user_id: userId,
            relation,
            child_ids: childIds,
          });
          showAlert(
            alertEl,
            `Assigned ${result.assigned_count || childIds.length} child${
              (result.assigned_count || childIds.length) === 1 ? '' : 'ren'
            } to the ${label.toLowerCase()}.`,
            'success'
          );
          if (typeof SC.loadChildren === 'function') await SC.loadChildren();
          if (typeof SC.loadStaff === 'function') await SC.loadStaff();
          setTimeout(() => {
            closeModal('modal-assign');
            hideAlert(alertEl);
          }, 700);
        }
      );
    } catch (err) {
      showAlert(alertEl, err.message || 'Could not assign children.', 'error');
    }
  }

  function initAssign() {
    SC.$('#open-assign-modal')?.addEventListener('click', () => openAssignModal());
    SC.$('#assign-relation')?.addEventListener('change', () => onRelationChange());
    SC.$('#assign-user')?.addEventListener('change', renderChildrenList);
    SC.$('#assign-children-search')?.addEventListener('input', renderChildrenList);
    SC.$('#assign-select-all')?.addEventListener('click', () => {
      SC.$$('#assign-children-list input[name="assign-child"]').forEach((el) => {
        el.checked = true;
      });
    });
    SC.$('#assign-clear-all')?.addEventListener('click', () => {
      SC.$$('#assign-children-list input[name="assign-child"]').forEach((el) => {
        el.checked = false;
      });
    });
    SC.$('#assign-form')?.addEventListener('submit', submitAssign);
  }

  SC.openAssignModal = openAssignModal;
  SC.initAssign = initAssign;
})(window.SmartCareApp);
