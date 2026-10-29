/** SmartCare dashboard — parent progress updates (Head Doctor) */
(function (SC) {
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;
  const openModal = SC.openModal;
  const closeModal = SC.closeModal;
  const childName = SC.childName;
  const isHeadDoctor = SC.isHeadDoctor;

  function todayIsoDate() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function errorMessage(err) {
    return err?.message || err?.error || 'Request failed.';
  }

  async function ensureChildrenOptions() {
    const select = SC.$('#progress-update-child');
    if (!select) return;
    if (!SC.state.childrenActiveCache?.length && SC.loadChildren) {
      try {
        await SC.loadChildren();
      } catch {
        /* keep empty options */
      }
    }
    const children = Array.isArray(SC.state.childrenActiveCache)
      ? SC.state.childrenActiveCache
      : (SC.state.childrenCache || []).filter((c) => c.is_active !== false && !c.deleted_at);
    const previous = select.value;
    select.innerHTML =
      '<option value="">Select a child…</option>' +
      children
        .map((c) => `<option value="${c.id}">${SC.escapeHtml(childName(c))}</option>`)
        .join('');
    if (previous && [...select.options].some((o) => o.value === previous)) {
      select.value = previous;
    }
  }

  async function openProgressUpdateModal(childId = null) {
    if (!isHeadDoctor()) return;
    const alertEl = SC.$('#progress-modal-alert');
    hideAlert(alertEl);
    await ensureChildrenOptions();
    const form = SC.$('#progress-update-form');
    form?.reset();
    const dateEl = SC.$('#progress-update-date');
    if (dateEl) dateEl.value = todayIsoDate();
    const childEl = SC.$('#progress-update-child');
    if (childEl && childId) {
      childEl.value = String(childId);
      childEl.disabled = Boolean(childId);
    } else if (childEl) {
      childEl.disabled = false;
    }
    openModal('modal-progress-update');
  }

  async function submitProgressUpdate(event) {
    event?.preventDefault?.();
    if (!isHeadDoctor()) return;
    const alertEl = SC.$('#progress-modal-alert');
    const childId = SC.$('#progress-update-child')?.value;
    const title = (SC.$('#progress-update-title')?.value || '').trim();
    const summary = (SC.$('#progress-update-summary')?.value || '').trim();
    const milestone = (SC.$('#progress-update-milestone')?.value || '').trim();
    const recordedOn = SC.$('#progress-update-date')?.value || todayIsoDate();
    hideAlert(alertEl);

    if (!childId) {
      showAlert(alertEl, 'Select a child.', 'error');
      return;
    }
    if (!title) {
      showAlert(alertEl, 'Title is required.', 'error');
      return;
    }

    const button = SC.$('#progress-update-submit');
    try {
      await SC.withBusy({ button, busyLabel: 'Sending…' }, async () => {
        await SmartCareAPI.post(`/children/${childId}/progress`, {
          title,
          summary: summary || null,
          milestone: milestone || null,
          recorded_on: recordedOn,
        });
      });
      closeModal('modal-progress-update');
      SC.showToast?.('Progress update sent to parent and care team.');
      if (SC.state.childProfileId && String(SC.state.childProfileId) === String(childId) && SC.openChildProfile) {
        const activeTab = SC.$('.profile-tab.is-active')?.dataset?.profileTab || 'progress';
        await SC.openChildProfile(SC.state.childProfileId, activeTab);
      }
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  function initProgressUpdates() {
    SC.$('#open-progress-update')?.addEventListener('click', () => openProgressUpdateModal());
    SC.$('#progress-update-form')?.addEventListener('submit', submitProgressUpdate);

    SC.$('#child-profile-content')?.addEventListener('click', (e) => {
      const btn = e.target.closest('#profile-open-progress-update');
      if (!btn) return;
      const childId = btn.dataset.childId || SC.state.childProfileId;
      openProgressUpdateModal(childId ? Number(childId) : null);
    });
  }

  SC.openProgressUpdateModal = openProgressUpdateModal;
  SC.submitProgressUpdate = submitProgressUpdate;
  SC.initProgressUpdates = initProgressUpdates;
})(window.SmartCareApp);
