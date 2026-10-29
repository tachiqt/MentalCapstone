/** SmartCare dashboard — learning materials */
(function (SC) {
  const isHeadDoctor = SC.isHeadDoctor;
  const openModal = SC.openModal;
  const closeModal = SC.closeModal;
  const escapeHtml = SC.escapeHtml;
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;
  const formatDateTime = (...args) => SC.formatDateTime(...args);

  const TYPE_LABELS = {
    worksheet: 'Worksheet',
    visual: 'Visual aid',
    video: 'Video',
    audio: 'Audio',
    activity: 'Activity',
    guide: 'Guide',
  };
  const ICONS = {
    form: 'book-open',
    view: 'file-text',
    remove: 'trash-2',
  };

  let materialCache = [];
  let activeMaterialId = null;
  let materialsPage = 1;
  const MATERIALS_PAGE_SIZE = 10;

  function typeLabel(type) {
    if (!type) return 'Unspecified';
    return TYPE_LABELS[type] || String(type).replace(/_/g, ' ');
  }

  function tagsOf(material) {
    return Array.isArray(material?.tags) ? material.tags.filter(Boolean) : [];
  }

  function fileName(material) {
    const path = material?.file_path || material?.file_url || '';
    if (!path) return '';
    const clean = String(path).split('?')[0];
    return clean.split('/').pop() || 'Attached file';
  }

  function hasFile(material) {
    return Boolean(material?.file_url || material?.file_path);
  }

  function fileExtension(material) {
    const path = String(material?.file_path || material?.file_url || '').split('?')[0].toLowerCase();
    const match = path.match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }

  function isImageMaterial(material) {
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(fileExtension(material));
  }

  function isPdfMaterial(material) {
    return fileExtension(material) === 'pdf';
  }

  function isVideoMaterial(material) {
    return ['mp4', 'webm', 'mov', 'm4v'].includes(fileExtension(material)) || material?.type === 'video';
  }

  function isAudioMaterial(material) {
    return ['mp3', 'wav', 'm4a', 'aac'].includes(fileExtension(material)) || material?.type === 'audio';
  }

  function resolveMaterialUrl(material) {
    const raw = String(material?.file_url || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw);
        if (/^(127\.0\.0\.1|localhost)$/i.test(parsed.hostname)) {
          return `${window.location.origin}${parsed.pathname}${parsed.search}`;
        }
      } catch {
        /* keep raw */
      }
      return raw;
    }
    if (raw.startsWith('/')) return `${window.location.origin}${raw}`;
    return `${window.location.origin}/storage/${raw.replace(/^\/+/, '')}`;
  }

  function mediaPreviewHtml(material) {
    const url = resolveMaterialUrl(material);
    if (!url) return '';

    if (isImageMaterial(material)) {
      return `
        <a class="materials-view__preview" href="${escapeHtml(url)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.closest('.materials-view__preview')?.classList.add('is-broken')">
        </a>`;
    }

    if (isPdfMaterial(material)) {
      return `
        <div class="materials-view__preview materials-view__preview--doc">
          <iframe class="materials-view__pdf" src="${escapeHtml(url)}#toolbar=0" title="${escapeHtml(material.title || 'PDF preview')}" loading="lazy"></iframe>
        </div>`;
    }

    if (isVideoMaterial(material)) {
      return `
        <div class="materials-view__preview materials-view__preview--media">
          <video controls preload="metadata" src="${escapeHtml(url)}"></video>
        </div>`;
    }

    if (isAudioMaterial(material)) {
      return `
        <div class="materials-view__preview materials-view__preview--audio">
          <audio controls preload="metadata" src="${escapeHtml(url)}"></audio>
        </div>`;
    }

    return '';
  }

  function fileKindLabel(material) {
    if (isImageMaterial(material)) return 'Image file';
    if (isPdfMaterial(material)) return 'PDF document';
    if (isVideoMaterial(material)) return 'Video file';
    if (isAudioMaterial(material)) return 'Audio file';
    return 'Open or download from the footer';
  }

  function findMaterial(id) {
    return materialCache.find((m) => String(m.id) === String(id));
  }

  function errorMessage(err) {
    const errors = err?.data?.errors;
    if (errors && typeof errors === 'object') return Object.values(errors).flat().join(' ');
    return err.message || 'Request failed.';
  }

  function setPanel(name) {
    SC.$$('.materials-modal-panel').forEach((panel) => {
      panel.hidden = panel.id !== `materials-panel-${name}`;
    });
  }

  function setFooter(html) {
    const actions = SC.$('#materials-modal-actions');
    if (actions) actions.innerHTML = html;
  }

  function setMaterialsIcon(action) {
    const wrap = SC.$('#modal-materials-icon-wrap');
    if (wrap) wrap.innerHTML = SC.icon(ICONS[action] || ICONS.form, { size: 22 });
  }

  function selectedType() {
    return SC.$('#material-types button.is-active')?.dataset.type || 'visual';
  }

  function setType(type) {
    const value = type || 'visual';
    SC.$$('#material-types [data-type]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.type === value);
    });
  }

  function selectedTags() {
    return [...SC.$$('#material-tags [data-tag].is-active')].map((btn) => btn.dataset.tag);
  }

  function setTags(tags) {
    const values = (Array.isArray(tags) ? tags : []).map((t) => String(t).toLowerCase());
    SC.$$('#material-tags [data-tag]').forEach((btn) => {
      btn.classList.toggle('is-active', values.includes(String(btn.dataset.tag).toLowerCase()));
    });
  }

  function filteredMaterials() {
    const query = (SC.$('#materials-search')?.value || '').trim().toLowerCase();
    const type = SC.$('#materials-filter-type')?.value || '';
    const file = SC.$('#materials-filter-file')?.value || '';
    return materialCache.filter((m) => {
      if (type && m.type !== type) return false;
      if (file === 'with_file' && !hasFile(m)) return false;
      if (file === 'metadata' && hasFile(m)) return false;
      if (query) {
        const hay = `${m.title || ''} ${m.description || ''} ${tagsOf(m).join(' ')} ${typeLabel(m.type)}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }

  function renderSummary() {
    const hint = SC.$('#materials-summary-line');
    const chip = SC.$('#materials-toolbar-count');
    const withFile = materialCache.filter(hasFile).length;
    if (hint) {
      hint.textContent = materialCache.length
        ? `${materialCache.length} in catalog · ${withFile} with files`
        : 'Upload guides and therapy resources for AI and classroom use';
    }
    if (chip) chip.textContent = String(filteredMaterials().length);
  }

  function renderMaterials({ scrollToTop = false } = {}) {
    const wrap = SC.$('#materials-table-wrap');
    const tbody = SC.$('#materials-tbody');
    const empty = SC.$('#materials-empty');
    const pagination = SC.$('#materials-pagination');
    if (!wrap || !tbody || !empty) return;
    const rows = filteredMaterials();
    const pageData = SC.paginate(rows, materialsPage, MATERIALS_PAGE_SIZE);
    materialsPage = pageData.page;
    renderSummary();
    const emptyBtn = SC.$('#empty-open-material');
    if (!rows.length) {
      wrap.hidden = true;
      empty.hidden = false;
      if (pagination) pagination.hidden = true;
      empty.querySelector('h3').textContent = materialCache.length ? 'No matching materials' : 'No materials yet';
      empty.querySelector('p').textContent = materialCache.length
        ? 'Try another search or filter.'
        : 'Upload guides and therapy resources so AI recommendations can suggest them.';
      if (emptyBtn) emptyBtn.hidden = materialCache.length > 0;
      return;
    }
    empty.hidden = true;
    wrap.hidden = false;
    tbody.innerHTML = pageData.items
      .map((m) => {
        const tags = tagsOf(m);
        const attached = hasFile(m);
        const who = m.uploader?.name || m.uploader?.username || '—';
        return `
          <tr data-material-id="${m.id}">
            <td>
              <div class="staff-identity">
                <span class="staff-avatar" aria-hidden="true">${escapeHtml((m.title || 'M').slice(0, 2).toUpperCase())}</span>
                <span>
                  <strong>${escapeHtml(m.title || 'Untitled')}</strong>
                  <small>${escapeHtml(who)}</small>
                </span>
              </div>
            </td>
            <td><span class="badge badge-neutral">${escapeHtml(typeLabel(m.type))}</span></td>
            <td>${tags.length ? escapeHtml(tags.join(', ')) : '<span class="staff-table__muted">No tags</span>'}</td>
            <td>${attached ? `<strong>${escapeHtml(fileName(m) || 'Attached')}</strong>` : '<span class="staff-table__muted">None</span>'}</td>
            <td>${escapeHtml(formatDateTime(m.created_at))}</td>
            <td>
              <div class="row-actions">
                <button type="button" class="icon-btn icon-btn--sm" data-mat-action="view" data-material-id="${m.id}" title="View details" aria-label="View material">
                  ${SC.icon('eye', { size: 16 })}
                </button>
                <button type="button" class="icon-btn icon-btn--sm" data-mat-action="edit" data-material-id="${m.id}" title="Edit material" aria-label="Edit material">
                  ${SC.icon('pencil', { size: 16 })}
                </button>
                <button type="button" class="icon-btn icon-btn--sm" data-mat-action="remove" data-material-id="${m.id}" title="Remove material" aria-label="Remove material">
                  ${SC.icon('trash-2', { size: 16 })}
                </button>
              </div>
            </td>
          </tr>`;
      })
      .join('');

    SC.renderPaginationControls({
      nav: pagination,
      prev: SC.$('#materials-page-prev'),
      next: SC.$('#materials-page-next'),
      meta: SC.$('#materials-page-meta'),
      page: pageData.page,
      totalPages: pageData.totalPages,
      from: pageData.from,
      to: pageData.to,
      total: pageData.total,
    });

    if (scrollToTop) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fillDetails(material) {
    const toolbar = SC.$('#materials-view-toolbar');
    const list = SC.$('#materials-detail-list');
    const fileEl = SC.$('#materials-view-file');
    const notes = SC.$('#materials-view-notes');
    const attached = hasFile(material);
    const tags = tagsOf(material);
    const name = fileName(material);
    const uploader = material.uploader?.name || material.uploader?.username || '—';

    if (toolbar) {
      toolbar.innerHTML = `
        <span class="materials-view__type">${escapeHtml(typeLabel(material.type))}</span>
        <span class="badge-status${attached ? '' : ' badge-status--inactive'}">${escapeHtml(attached ? 'File attached' : 'Metadata only')}</span>`;
    }

    if (list) {
      const tagsHtml = tags.length
        ? `<ul class="materials-view__tags">${tags.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
        : `<span class="materials-view__muted">No tags</span>`;
      list.innerHTML = `
        <div class="materials-view__row">
          <dt>Tags</dt>
          <dd>${tagsHtml}</dd>
        </div>
        <div class="materials-view__row">
          <dt>Uploaded by</dt>
          <dd>${escapeHtml(uploader)}</dd>
        </div>
        <div class="materials-view__row">
          <dt>Uploaded</dt>
          <dd>${escapeHtml(formatDateTime(material.created_at))}</dd>
        </div>`;
    }

    if (fileEl) {
      if (attached) {
        const url = resolveMaterialUrl(material);
        const href = url ? ` href="${escapeHtml(url)}" target="_blank" rel="noopener"` : '';
        const tag = url ? 'a' : 'div';
        fileEl.innerHTML = `
          ${mediaPreviewHtml(material)}
          <${tag} class="materials-view__file"${href}>
            <span class="materials-view__file-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </span>
            <span class="materials-view__file-body">
              <strong title="${escapeHtml(name || 'Attached file')}">${escapeHtml(name || 'Attached file')}</strong>
              <span>${escapeHtml(url ? fileKindLabel(material) : 'Stored with this resource')}</span>
            </span>
          </${tag}>`;
      } else {
        fileEl.innerHTML = `<p class="materials-view__empty">No file — metadata only for the AI catalog.</p>`;
      }
    }

    if (notes) {
      notes.innerHTML = `
        <p class="materials-view__desc${material.description ? '' : ' is-empty'}">${escapeHtml(material.description || 'No description provided.')}</p>`;
    }
  }

  function openMaterialsModal(action, materialId) {
    const alertEl = SC.$('#materials-modal-alert');
    hideAlert(alertEl);
    const title = SC.$('#modal-materials-title');
    const subtitle = SC.$('#modal-materials-subtitle');
    const dismiss = SC.$('#materials-modal-dismiss');
    const material = materialId ? findMaterial(materialId) : null;
    activeMaterialId = material?.id || null;
    const modal = SC.$('#modal-materials');
    if (modal) modal.dataset.materialMode = action;
    setMaterialsIcon(action === 'edit' ? 'form' : action);
    if (dismiss) dismiss.textContent = action === 'view' ? 'Close' : 'Cancel';

    if (action === 'form' || action === 'edit') {
      SC.$('#material-id').value = material?.id || '';
      SC.$('#material-title').value = material?.title || '';
      SC.$('#material-description').value = material?.description || '';
      SC.$('#material-file').value = '';
      setType(material?.type || 'visual');
      setTags(tagsOf(material));
      const hint = SC.$('#material-file-hint');
      if (hint) {
        hint.textContent = material && hasFile(material)
          ? `Current file: ${fileName(material)}. Choose a new file to replace it. Max 10 MB.`
          : 'PDF, image, audio, video, or document. Max 10 MB. Metadata-only items still appear in the AI catalog.';
      }
      if (title) title.textContent = material ? 'Edit material' : 'Add material';
      if (subtitle) {
        subtitle.textContent = material
          ? 'Update title, tags, or replace the file.'
          : 'Add a resource the AI catalog and teachers can use.';
      }
      setPanel('form');
      setFooter(`<button type="submit" class="btn btn-primary" form="materials-panel-form">${material ? 'Save changes' : 'Save material'}</button>`);
    } else if (action === 'view' && material) {
      if (title) title.textContent = material.title || 'Material details';
      if (subtitle) subtitle.textContent = 'Resource library';
      setPanel('view');
      fillDetails(material);
      setFooter(
        hasFile(material) && resolveMaterialUrl(material)
          ? `<a class="btn btn-primary" href="${escapeHtml(resolveMaterialUrl(material))}" target="_blank" rel="noopener">Download file</a>`
          : ''
      );
    } else if (action === 'remove' && material) {
      if (title) title.textContent = 'Remove material';
      if (subtitle) subtitle.textContent = material.title || '';
      const copy = SC.$('#materials-remove-copy');
      const hint = SC.$('#materials-remove-hint');
      if (copy) copy.textContent = `Remove ${material.title || 'this material'} from the library?`;
      if (hint) hint.textContent = 'It will no longer appear in the catalog or new AI recommendations.';
      setPanel('remove');
      setFooter('<button type="button" class="btn btn-danger" data-mat-commit="remove">Remove</button>');
    }
    openModal('modal-materials');
  }

  async function saveMaterial(e) {
    e.preventDefault();
    const alertEl = SC.$('#materials-modal-alert');
    const id = SC.$('#material-id')?.value;
    const title = SC.$('#material-title')?.value.trim();
    if (!title) {
      showAlert(alertEl, 'Add a title.', 'error');
      return;
    }
    const body = new FormData();
    body.append('title', title);
    body.append('description', SC.$('#material-description')?.value.trim() || '');
    body.append('type', selectedType());
    body.append('tags', JSON.stringify(selectedTags()));
    const file = SC.$('#material-file')?.files?.[0];
    if (file) body.append('file', file);
    try {
      await SC.withBusy({ button: e.submitter, busyLabel: 'Saving…' }, async () => {
        if (id) {
          body.append('_method', 'PUT');
          await SmartCareAPI.post(`/learning-materials/${id}`, body);
        } else {
          await SmartCareAPI.post('/learning-materials', body);
        }
        closeModal('modal-materials');
        await loadMaterials();
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function commitRemove(button) {
    const material = findMaterial(activeMaterialId);
    const alertEl = SC.$('#materials-modal-alert');
    if (!material) return;
    try {
      await SC.withBusy({ button, busyLabel: 'Removing…' }, async () => {
        await SmartCareAPI.delete(`/learning-materials/${material.id}`);
        closeModal('modal-materials');
        await loadMaterials();
      });
    } catch (err) {
      showAlert(alertEl, errorMessage(err), 'error');
    }
  }

  async function loadMaterials() {
    const loading = SC.$('#materials-loading');
    const empty = SC.$('#materials-empty');
    const wrap = SC.$('#materials-table-wrap');
    if (!loading) return;
    if (!isHeadDoctor()) {
      loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.querySelector('h3').textContent = 'Restricted';
        empty.querySelector('p').textContent = 'Only Head Doctors can manage the resource library on web.';
      }
      if (wrap) wrap.hidden = true;
      const addBtn = SC.$('#open-material');
      if (addBtn) addBtn.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (wrap) wrap.hidden = true;

    try {
      await SC.withBusy({ section: loading }, async () => {
        const rows = await SmartCareAPI.get('/learning-materials');
        materialCache = Array.isArray(rows) ? rows : rows.data || [];
        loading.hidden = true;
        renderMaterials();
      });
    } catch (err) {
      loading.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.querySelector('h3').textContent = 'Unable to load materials';
        empty.querySelector('p').textContent = err.message || 'Request failed.';
        const emptyBtn = SC.$('#empty-open-material');
        if (emptyBtn) emptyBtn.hidden = true;
      }
    }
  }

  function initMaterials() {
    SC.$('#open-material')?.addEventListener('click', () => openMaterialsModal('form'));
    SC.$('#empty-open-material')?.addEventListener('click', () => openMaterialsModal('form'));
    const resetMaterialsPage = () => {
      materialsPage = 1;
      renderMaterials();
    };
    SC.$('#materials-search')?.addEventListener('input', resetMaterialsPage);
    SC.$('#materials-filter-type')?.addEventListener('change', resetMaterialsPage);
    SC.$('#materials-filter-file')?.addEventListener('change', resetMaterialsPage);
    SC.bindPaginationControls({
      prevId: '#materials-page-prev',
      nextId: '#materials-page-next',
      getPage: () => materialsPage,
      setPage: (page) => {
        materialsPage = page;
      },
      getTotalPages: () => SC.paginate(filteredMaterials(), materialsPage, MATERIALS_PAGE_SIZE).totalPages,
      onChange: renderMaterials,
    });
    SC.$('#materials-table-wrap')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mat-action]');
      if (!btn) return;
      openMaterialsModal(btn.dataset.matAction, btn.dataset.materialId);
    });
    SC.$('#materials-panel-form')?.addEventListener('submit', saveMaterial);
    SC.$('#material-types')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-type]');
      if (!btn) return;
      setType(btn.dataset.type);
    });
    SC.$('#material-tags')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tag]');
      if (!btn) return;
      btn.classList.toggle('is-active');
    });
    SC.$('#materials-modal-actions')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-mat-commit]');
      if (!btn) return;
      commitRemove(btn);
    });
  }

  SC.loadMaterials = loadMaterials;
  SC.initMaterials = initMaterials;
})(window.SmartCareApp);
