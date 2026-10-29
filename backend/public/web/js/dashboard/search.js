/** SmartCare dashboard — global search */
(function (SC) {
  const escapeHtml = SC.escapeHtml;
  const formatDateTime = SC.formatDateTime;
  let timer = null;

  function resultsEl() {
    return SC.$('#global-search-results');
  }

  function inputEl() {
    return SC.$('#global-search');
  }

  function hideResults() {
    const box = resultsEl();
    const input = inputEl();
    if (box) box.hidden = true;
    if (input) input.setAttribute('aria-expanded', 'false');
  }

  function showResults() {
    const box = resultsEl();
    const input = inputEl();
    if (box) box.hidden = false;
    if (input) input.setAttribute('aria-expanded', 'true');
  }

  function groupHtml(title, items, renderItem) {
    if (!items.length) return '';
    return `
      <p class="search-popover__label">${escapeHtml(title)}</p>
      ${items.map(renderItem).join('')}`;
  }

  function render(data, query) {
    const box = resultsEl();
    if (!box) return;
    const children = data.children || [];
    const sessions = data.sessions || [];
    const staff = data.staff || [];
    if (!children.length && !sessions.length && !staff.length) {
      box.innerHTML = `<p class="search-popover__empty">No matches for “${escapeHtml(query)}”.</p>`;
      showResults();
      return;
    }

    box.innerHTML = [
      groupHtml('Children', children, (c) => `
        <button type="button" class="search-popover__item" data-search-kind="child" data-search-id="${c.id}">
          <strong>${escapeHtml(`${c.first_name} ${c.last_name}`.trim())}</strong>
          <span>${escapeHtml(c.diagnosis || (c.is_active ? 'Active' : 'Inactive'))}</span>
        </button>`),
      groupHtml('Sessions', sessions, (s) => {
        const child = s.child ? `${s.child.first_name} ${s.child.last_name}` : 'Session';
        return `
        <button type="button" class="search-popover__item" data-search-kind="session" data-search-id="${s.id}" data-child-id="${s.child_id || s.child?.id || ''}">
          <strong>${escapeHtml(child.trim())}</strong>
          <span>${escapeHtml(formatDateTime(s.scheduled_at))} · ${escapeHtml(s.status || 'scheduled')}</span>
        </button>`;
      }),
      groupHtml('Staff', staff, (u) => `
        <button type="button" class="search-popover__item" data-search-kind="staff" data-search-id="${u.id}">
          <strong>${escapeHtml(u.name)}</strong>
          <span>${escapeHtml(u.username || u.email || '')}</span>
        </button>`),
    ].join('');
    showResults();
  }

  async function runSearch(query) {
    const box = resultsEl();
    if (!box) return;
    if (query.length < 2) {
      hideResults();
      return;
    }
    box.innerHTML = `<p class="search-popover__empty">Searching…</p>`;
    showResults();
    try {
      const data = await SmartCareAPI.get(`/search?q=${encodeURIComponent(query)}`);
      render(data, query);
    } catch (err) {
      box.innerHTML = `<p class="search-popover__empty">${escapeHtml(err.message || 'Search failed.')}</p>`;
      showResults();
    }
  }

  function currentPageName() {
    return (location.pathname.split('/').pop() || '').toLowerCase();
  }

  async function openChildProfileResult(childId, tab = 'overview') {
    const targetPage = SC.sectionPage?.('children') || 'children.html';
    const alreadyThere = currentPageName() === String(targetPage).toLowerCase();
    if (alreadyThere) {
      await SC.showSection?.('children', { updateRoute: false });
      await SC.openChildProfile?.(Number(childId), tab);
      return;
    }
    sessionStorage.setItem('sc-pending', JSON.stringify({ action: 'child-profile', id: Number(childId), tab }));
    await SC.navigateToSection?.('children');
  }

  function openResult(kind, id, childId) {
    hideResults();
    const input = inputEl();
    if (input) input.value = '';
    const open = async () => {
      if (kind === 'child') {
        await openChildProfileResult(id);
        return;
      }
      if (kind === 'session') {
        if (SC.isPsychometrician?.()) {
          if (childId) {
            await openChildProfileResult(childId);
          } else {
            await SC.navigateToSection?.('assessments');
          }
          return;
        }
        sessionStorage.setItem('sc-pending', JSON.stringify({ action: 'therapy-view', id: String(id), childId: childId ? Number(childId) : null }));
        await SC.navigateToSection?.('therapy');
        return;
      }
      if (kind === 'staff' && SC.isHeadDoctor?.()) {
        sessionStorage.setItem('sc-pending', JSON.stringify({ action: 'staff-view', id: String(id) }));
        await SC.navigateToSection?.('staff');
      }
    };
    open();
  }

  function initSearch() {
    const input = inputEl();
    const box = resultsEl();
    if (!input || input.dataset.bound === '1') return;
    input.dataset.bound = '1';

    input.addEventListener('input', () => {
      const query = input.value.trim();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => runSearch(query), 220);
    });
    input.addEventListener('focus', () => {
      if (input.value.trim().length >= 2) runSearch(input.value.trim());
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideResults();
    });
    box?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-search-kind]');
      if (!btn) return;
      openResult(btn.dataset.searchKind, btn.dataset.searchId, btn.dataset.childId);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.topbar-search-wrap')) hideResults();
    });
  }

  SC.initSearch = initSearch;
})(window.SmartCareApp);
