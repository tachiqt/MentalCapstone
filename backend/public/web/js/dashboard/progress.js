/** SmartCare dashboard — parent progress updates (Head Doctor) */
(function (SC) {
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;
  const openModal = SC.openModal;
  const closeModal = SC.closeModal;
  const childName = SC.childName;
  const isHeadDoctor = SC.isHeadDoctor;
  const escapeHtml = SC.escapeHtml;

  const MAX_PHOTOS = 6;
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  let selectedPhotoFiles = [];

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

  function renderPhotoPreviews() {
    const wrap = SC.$('#progress-update-photo-previews');
    if (!wrap) return;
    if (!selectedPhotoFiles.length) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = selectedPhotoFiles
      .map((file, index) => {
        const url = URL.createObjectURL(file);
        return `
          <figure class="progress-photo-preview" data-photo-index="${index}">
            <img src="${url}" alt="${escapeHtml(file.name)}" data-blob-url="${url}">
            <button type="button" class="progress-photo-preview__remove" data-remove-photo="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button>
            <figcaption>${escapeHtml(file.name)}</figcaption>
          </figure>`;
      })
      .join('');
  }

  function clearPhotoSelection() {
    const wrap = SC.$('#progress-update-photo-previews');
    wrap?.querySelectorAll('img[data-blob-url]').forEach((img) => {
      try {
        URL.revokeObjectURL(img.getAttribute('data-blob-url'));
      } catch {
        /* ignore */
      }
    });
    selectedPhotoFiles = [];
    const input = SC.$('#progress-update-photos');
    if (input) input.value = '';
    renderPhotoPreviews();
  }

  function onPhotosSelected(event) {
    const alertEl = SC.$('#progress-modal-alert');
    const incoming = Array.from(event.target.files || []);
    hideAlert(alertEl);

    for (const file of incoming) {
      if (!/^image\/(jpeg|jpg|png)$/i.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
        showAlert(alertEl, 'Photos must be JPG or PNG.', 'error');
        event.target.value = '';
        return;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        showAlert(alertEl, `"${file.name}" exceeds the 5 MB limit.`, 'error');
        event.target.value = '';
        return;
      }
    }

    const next = selectedPhotoFiles.concat(incoming);
    if (next.length > MAX_PHOTOS) {
      showAlert(alertEl, `You can attach at most ${MAX_PHOTOS} photos.`, 'error');
      event.target.value = '';
      return;
    }

    selectedPhotoFiles = next;
    event.target.value = '';
    renderPhotoPreviews();
    SC.showToast?.(
      `${incoming.length} photo${incoming.length === 1 ? '' : 's'} attached. Click “Send to parent” to upload.`,
      'success'
    );
  }

  async function openProgressUpdateModal(childId = null) {
    if (!isHeadDoctor()) return;
    const alertEl = SC.$('#progress-modal-alert');
    hideAlert(alertEl);
    await ensureChildrenOptions();
    const form = SC.$('#progress-update-form');
    form?.reset();
    clearPhotoSelection();
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
        if (selectedPhotoFiles.length) {
          const body = new FormData();
          body.append('title', title);
          if (summary) body.append('summary', summary);
          if (milestone) body.append('milestone', milestone);
          body.append('recorded_on', recordedOn);
          selectedPhotoFiles.forEach((file) => body.append('photos[]', file));
          await SmartCareAPI.post(`/children/${childId}/progress`, body);
        } else {
          await SmartCareAPI.post(`/children/${childId}/progress`, {
            title,
            summary: summary || null,
            milestone: milestone || null,
            recorded_on: recordedOn,
          });
        }
      });
      closeModal('modal-progress-update');
      clearPhotoSelection();
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
    SC.$('#progress-update-photos')?.addEventListener('change', onPhotosSelected);
    SC.$('#progress-update-photo-previews')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-photo]');
      if (!btn) return;
      const index = Number(btn.getAttribute('data-remove-photo'));
      if (!Number.isFinite(index)) return;
      selectedPhotoFiles.splice(index, 1);
      renderPhotoPreviews();
    });

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
