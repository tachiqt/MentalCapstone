/** SmartCare dashboard — child photo gallery (auto + custom albums, inline preview) */
(function (SC) {
  const escapeHtml = SC.escapeHtml;
  const childName = SC.childName;
  const PER_PAGE = 20;

  let albumsCache = [];
  let activeKind = null;
  let activeChildId = null;
  let activeAlbumId = null;
  let activeAlbumName = '';
  let activePage = 1;
  let lightboxObjectUrl = null;

  function setAlbumsVisible(showAlbums) {
    const albumsView = SC.$('#gallery-albums-view');
    const albumView = SC.$('#gallery-album-view');
    if (albumsView) albumsView.hidden = !showAlbums;
    if (albumView) albumView.hidden = showAlbums;
    const title = SC.$('#gallery-panel-title');
    const hint = SC.$('#gallery-panel-hint');
    const newBtn = SC.$('#gallery-new-album-btn');
    if (showAlbums) {
      if (title) title.textContent = 'Facility albums';
      if (hint) {
        hint.textContent = 'Facility photo albums and per-child auto albums.';
      }
      if (newBtn) newBtn.hidden = false;
    } else if (newBtn) {
      newBtn.hidden = true;
    }
  }

  function revokeLightboxUrl() {
    if (lightboxObjectUrl) {
      try {
        URL.revokeObjectURL(lightboxObjectUrl);
      } catch {
        /* ignore */
      }
      lightboxObjectUrl = null;
    }
  }

  async function hydrateAuthImages(root) {
    const nodes = root?.querySelectorAll?.('img[data-auth-src]') || [];
    await Promise.all(
      Array.from(nodes).map(async (img) => {
        const path = img.getAttribute('data-auth-src');
        if (!path || img.dataset.hydrated === '1') return;
        try {
          const url = await SC.fetchAuthorizedBlobUrl(path);
          img.src = url;
          img.dataset.hydrated = '1';
          img.hidden = false;
          img.closest('.gallery-thumb-wrap')?.querySelector('.gallery-thumb-fallback')?.setAttribute('hidden', '');
        } catch {
          img.hidden = true;
        }
      })
    );
  }

  function albumCardHtml(album) {
    const kind = album.kind || 'auto';
    const count = Number(album.photo_count) || 0;
    const name =
      kind === 'custom'
        ? album.name || 'Album'
        : childName({ first_name: album.first_name, last_name: album.last_name });
    const meta =
      kind === 'custom'
        ? `Facility · ${count} photo${count === 1 ? '' : 's'}`
        : `All photos · ${count}`;
    const coverPath = album.cover?.download_path || '';
    const openAttrs =
      kind === 'custom'
        ? `data-open-custom="${album.id}" data-album-name="${escapeHtml(album.name || '')}"`
        : `data-open-auto="${album.child_id}"`;

    return `
      <button type="button" class="gallery-album-card" role="listitem" ${openAttrs}>
        <span class="gallery-thumb-wrap gallery-thumb-wrap--album">
          ${
            coverPath
              ? `<img class="gallery-album-cover" data-auth-src="${escapeHtml(coverPath)}" alt="" hidden>
                 <span class="gallery-thumb-fallback" aria-hidden="true"></span>`
              : `<span class="gallery-thumb-fallback gallery-thumb-fallback--empty" aria-hidden="true"></span>`
          }
          <span class="gallery-album-kind badge ${kind === 'custom' ? 'badge-approved' : 'badge-neutral'}">${kind === 'custom' ? 'Facility' : 'Auto'}</span>
        </span>
        <span class="gallery-album-card__body">
          <span class="gallery-album-card__title">${escapeHtml(name)}</span>
          <span class="gallery-album-card__meta">${escapeHtml(meta)}</span>
        </span>
      </button>`;
  }

  function photoCardHtml(item) {
    const caption = item.caption || item.original_filename || 'Photo';
    const path = item.download_path || '';
    const sourceLabel =
      item.source === 'document' ? 'Document' : item.source === 'gallery_photo' ? 'Album' : 'Progress';
    return `
      <button type="button" class="gallery-photo-card" role="listitem"
        data-preview-path="${escapeHtml(path)}"
        data-preview-caption="${escapeHtml(caption)}"
        data-preview-meta="${escapeHtml([sourceLabel, item.recorded_on].filter(Boolean).join(' · '))}">
        <span class="gallery-thumb-wrap">
          <img class="gallery-photo-thumb" data-auth-src="${escapeHtml(path)}" alt="${escapeHtml(caption)}" hidden>
          <span class="gallery-thumb-fallback" aria-hidden="true"></span>
        </span>
        <span class="gallery-photo-card__caption">${escapeHtml(caption)}</span>
      </button>`;
  }

  function pagerHtml(meta) {
    const page = meta.page || 1;
    const last = meta.last_page || 1;
    const total = meta.total || 0;
    if (total <= PER_PAGE) return '';
    return `
      <div class="profile-list-pagination__row">
        <button type="button" class="btn btn-secondary btn-sm" data-gallery-page-dir="-1" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span class="profile-list-pagination__label">Page ${page} of ${last} · ${total} photos</span>
        <button type="button" class="btn btn-secondary btn-sm" data-gallery-page-dir="1" ${page >= last ? 'disabled' : ''}>Next</button>
      </div>`;
  }

  async function loadGalleryAlbums() {
    const loading = SC.$('#gallery-albums-loading');
    const empty = SC.$('#gallery-albums-empty');
    const grid = SC.$('#gallery-albums-grid');
    const countChip = SC.$('#gallery-toolbar-count');
    if (!grid) return;

    setAlbumsVisible(true);
    activeKind = null;
    activeChildId = null;
    activeAlbumId = null;
    activeAlbumName = '';
    const customActions = SC.$('#gallery-custom-actions');
    if (customActions) customActions.hidden = true;

    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    grid.innerHTML = '';

    try {
      const albums = await SmartCareAPI.get('/gallery/albums');
      albumsCache = Array.isArray(albums) ? albums : [];
      if (countChip) countChip.textContent = String(albumsCache.length);
      if (!albumsCache.length) {
        if (empty) empty.hidden = false;
        return;
      }
      grid.innerHTML = albumsCache.map(albumCardHtml).join('');
      await hydrateAuthImages(grid);
    } catch (err) {
      grid.innerHTML = `<p class="gallery-empty">${escapeHtml(err.message || 'Could not load albums.')}</p>`;
    } finally {
      if (loading) loading.hidden = true;
    }
  }

  async function openAutoAlbum(childId, page = 1) {
    await openAlbumDetail({ kind: 'auto', childId, page });
  }

  async function openCustomAlbum(albumId, name, page = 1) {
    await openAlbumDetail({ kind: 'custom', albumId, name, page });
  }

  async function openAlbumDetail({ kind, childId, albumId, name, page = 1 }) {
    const loading = SC.$('#gallery-photos-loading');
    const empty = SC.$('#gallery-photos-empty');
    const grid = SC.$('#gallery-photos-grid');
    const pager = SC.$('#gallery-photos-pager');
    const title = SC.$('#gallery-album-title');
    const subtitle = SC.$('#gallery-album-subtitle');
    const countChip = SC.$('#gallery-toolbar-count');
    const customActions = SC.$('#gallery-custom-actions');
    if (!grid) return;

    activeKind = kind;
    activeChildId = childId ? Number(childId) : null;
    activeAlbumId = albumId ? Number(albumId) : null;
    activeAlbumName = name || '';
    activePage = page;
    setAlbumsVisible(false);
    if (customActions) customActions.hidden = false;
    const renameBtn = SC.$('#gallery-rename-btn');
    const deleteBtn = SC.$('#gallery-delete-btn');
    if (renameBtn) renameBtn.hidden = kind !== 'custom';
    if (deleteBtn) deleteBtn.hidden = kind !== 'custom';
    if (loading) loading.hidden = false;
    if (empty) empty.hidden = true;
    grid.innerHTML = '';
    if (pager) {
      pager.hidden = true;
      pager.innerHTML = '';
    }

    try {
      const data =
        kind === 'custom'
          ? await SmartCareAPI.get(
              `/gallery/custom-albums/${activeAlbumId}/photos?page=${activePage}&per_page=${PER_PAGE}`
            )
          : await SmartCareAPI.get(
              `/gallery/albums/${activeChildId}?page=${activePage}&per_page=${PER_PAGE}`
            );

      const child = data?.child || {};
      const meta = data?.meta || {};
      const items = Array.isArray(data?.items) ? data.items : [];
      const displayName =
        kind === 'custom'
          ? data?.album?.name || activeAlbumName || 'Album'
          : childName(child);

      activeAlbumName = displayName;
      if (title) title.textContent = displayName;
      if (subtitle) {
        const totalLabel = `${meta.total || 0} photo${(meta.total || 0) === 1 ? '' : 's'} · page ${meta.page || 1}`;
        subtitle.textContent =
          kind === 'custom' ? `Facility album · ${totalLabel}` : totalLabel;
      }
      if (countChip) countChip.textContent = String(meta.total || 0);
      const panelTitle = SC.$('#gallery-panel-title');
      const panelHint = SC.$('#gallery-panel-hint');
      if (panelTitle) panelTitle.textContent = displayName;
      if (panelHint) {
        panelHint.textContent =
          kind === 'custom'
            ? 'Upload and browse photos in this album.'
            : 'Upload photos for this child, or browse progress and document images.';
      }

      if (!items.length) {
        if (empty) {
          empty.hidden = false;
          empty.textContent =
            kind === 'custom'
              ? 'No photos in this album yet. Use Upload photos to add images.'
              : 'No photos yet. Use Upload photos to add images for this child.';
        }
        return;
      }
      grid.innerHTML = items.map(photoCardHtml).join('');
      await hydrateAuthImages(grid);
      if (pager) {
        const html = pagerHtml(meta);
        pager.innerHTML = html;
        pager.hidden = !html;
      }
    } catch (err) {
      grid.innerHTML = `<p class="gallery-empty">${escapeHtml(err.message || 'Could not load photos.')}</p>`;
    } finally {
      if (loading) loading.hidden = true;
    }
  }

  async function openLightbox(path, caption, meta) {
    const dialog = SC.$('#modal-gallery-lightbox');
    const img = SC.$('#gallery-lightbox-image');
    const captionEl = SC.$('#gallery-lightbox-caption');
    const metaEl = SC.$('#gallery-lightbox-meta');
    if (!dialog || !img || !path) return;

    revokeLightboxUrl();
    if (captionEl) captionEl.textContent = caption || 'Photo';
    if (metaEl) metaEl.textContent = meta || '';
    img.removeAttribute('src');
    img.alt = caption || 'Photo';

    try {
      lightboxObjectUrl = await SC.fetchAuthorizedBlobUrl(path);
      img.src = lightboxObjectUrl;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch (err) {
      SC.showToast?.(err.message || 'Could not open photo.', 'error');
    }
  }

  function closeLightbox() {
    const dialog = SC.$('#modal-gallery-lightbox');
    if (dialog?.open) dialog.close();
    else dialog?.removeAttribute('open');
    revokeLightboxUrl();
    const img = SC.$('#gallery-lightbox-image');
    if (img) img.removeAttribute('src');
  }

  function openNewAlbumModal() {
    const nameInput = SC.$('#gallery-new-album-name');
    const alertEl = SC.$('#gallery-new-album-alert');
    if (nameInput) nameInput.value = '';
    if (alertEl) {
      alertEl.hidden = true;
      alertEl.textContent = '';
    }
    SC.openModal?.('modal-gallery-new-album');
  }

  function initGallery() {
    SC.$('#gallery-back-albums')?.addEventListener('click', () => loadGalleryAlbums());
    SC.$('#gallery-new-album-btn')?.addEventListener('click', () => openNewAlbumModal());

    SC.$('#gallery-albums-grid')?.addEventListener('click', (e) => {
      const customBtn = e.target.closest('[data-open-custom]');
      if (customBtn) {
        openCustomAlbum(
          customBtn.getAttribute('data-open-custom'),
          customBtn.getAttribute('data-album-name') || '',
          1
        );
        return;
      }
      const autoBtn = e.target.closest('[data-open-auto]');
      if (autoBtn) openAutoAlbum(autoBtn.getAttribute('data-open-auto'), 1);
    });

    SC.$('#gallery-photos-grid')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preview-path]');
      if (!btn) return;
      openLightbox(
        btn.getAttribute('data-preview-path'),
        btn.getAttribute('data-preview-caption'),
        btn.getAttribute('data-preview-meta')
      );
    });

    SC.$('#gallery-photos-pager')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-gallery-page-dir]');
      if (!btn || btn.disabled) return;
      const dir = Number(btn.getAttribute('data-gallery-page-dir')) || 0;
      const next = Math.max(1, activePage + dir);
      if (activeKind === 'custom' && activeAlbumId) openCustomAlbum(activeAlbumId, activeAlbumName, next);
      else if (activeKind === 'auto' && activeChildId) openAutoAlbum(activeChildId, next);
    });

    SC.$('#gallery-upload-btn')?.addEventListener('click', () => {
      if (activeKind === 'custom' && activeAlbumId) {
        SC.$('#gallery-upload-input')?.click();
        return;
      }
      if (activeKind === 'auto' && activeChildId) {
        SC.$('#gallery-upload-input')?.click();
        return;
      }
      SC.showToast?.('Open a child or facility album before uploading photos.');
    });

    SC.$('#gallery-upload-input')?.addEventListener('change', async (e) => {
      const input = e.target;
      const files = Array.from(input.files || []);
      input.value = '';
      if (!files.length) return;

      const isCustom = activeKind === 'custom' && activeAlbumId;
      const isChild = activeKind === 'auto' && activeChildId;
      if (!isCustom && !isChild) {
        SC.showToast?.('Open a child or facility album before uploading photos.');
        return;
      }
      if (files.length > 12) {
        SC.showToast?.('You can upload up to 12 photos at a time.');
        return;
      }
      const maxBytes = 5 * 1024 * 1024;
      for (const file of files) {
        const okType =
          /^image\/(jpeg|jpg|png)$/i.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
        if (!okType) {
          SC.showToast?.(`“${file.name}” must be JPG or PNG.`);
          return;
        }
        if (file.size > maxBytes) {
          SC.showToast?.(`“${file.name}” exceeds the 5 MB limit.`);
          return;
        }
      }

      const albumId = activeAlbumId;
      const albumName = activeAlbumName;
      const childId = activeChildId;
      const kind = activeKind;
      const endpoint = isCustom
        ? `/gallery/custom-albums/${albumId}/photos`
        : `/gallery/albums/${childId}/photos`;
      const body = new FormData();
      files.forEach((file) => body.append('photos[]', file));
      try {
        await SC.withBusy(
          { button: SC.$('#gallery-upload-btn'), busyLabel: 'Uploading…' },
          async () => {
            await SmartCareAPI.post(endpoint, body);
          }
        );
        SC.showToast?.(`${files.length} photo${files.length === 1 ? '' : 's'} uploaded.`);
        if (kind === 'custom') await openCustomAlbum(albumId, albumName, 1);
        else await openAutoAlbum(childId, 1);
      } catch (err) {
        const details = err?.data?.errors
          ? Object.values(err.data.errors).flat().join(' ')
          : '';
        SC.showToast?.(details || err.message || 'Could not upload photos.');
      }
    });

    SC.$('#gallery-rename-btn')?.addEventListener('click', async () => {
      if (!activeAlbumId) return;
      const next = window.prompt('Album name', activeAlbumName || '');
      if (next == null) return;
      const name = String(next).trim();
      if (!name) {
        SC.showToast?.('Name is required.', 'error');
        return;
      }
      try {
        const album = await SmartCareAPI.patch(`/gallery/custom-albums/${activeAlbumId}`, { name });
        activeAlbumName = album?.name || name;
        SC.showToast?.('Album renamed.', 'success');
        await openCustomAlbum(activeAlbumId, activeAlbumName, activePage);
      } catch (err) {
        SC.showToast?.(err.message || 'Could not rename album.', 'error');
      }
    });

    SC.$('#gallery-delete-btn')?.addEventListener('click', async () => {
      if (!activeAlbumId) return;
      if (!window.confirm(`Delete album “${activeAlbumName || 'Album'}”? Photos in this album will be removed.`)) {
        return;
      }
      try {
        await SmartCareAPI.delete(`/gallery/custom-albums/${activeAlbumId}`);
        SC.showToast?.('Album deleted.', 'success');
        await loadGalleryAlbums();
      } catch (err) {
        SC.showToast?.(err.message || 'Could not delete album.', 'error');
      }
    });

    SC.$('#gallery-new-album-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = String(SC.$('#gallery-new-album-name')?.value || '').trim();
      const alertEl = SC.$('#gallery-new-album-alert');
      const submitBtn = SC.$('#gallery-new-album-submit');
      if (!name) {
        if (alertEl) {
          alertEl.hidden = false;
          alertEl.textContent = 'Enter an album name.';
        }
        return;
      }
      try {
        const album = await SC.withBusy?.(
          { button: submitBtn, busyLabel: 'Creating…' },
          async () => SmartCareAPI.post('/gallery/custom-albums', { name })
        );
        SC.closeModal?.('modal-gallery-new-album');
        SC.showToast?.('Album created.', 'success');
        await loadGalleryAlbums();
        if (album?.id) await openCustomAlbum(album.id, album.name || name, 1);
      } catch (err) {
        if (alertEl) {
          alertEl.hidden = false;
          alertEl.textContent = err.message || 'Could not create album.';
        }
      }
    });

    document.querySelectorAll('[data-close-modal="modal-gallery-new-album"]').forEach((btn) => {
      btn.addEventListener('click', () => SC.closeModal?.('modal-gallery-new-album'));
    });

    SC.$('#gallery-lightbox-close')?.addEventListener('click', closeLightbox);
    SC.$('#modal-gallery-lightbox')?.addEventListener('click', (e) => {
      if (e.target?.id === 'modal-gallery-lightbox') closeLightbox();
    });
  }

  SC.loadGallery = loadGalleryAlbums;
  SC.initGallery = initGallery;
})(window.SmartCareApp);
