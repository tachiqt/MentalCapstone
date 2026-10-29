/** SmartCare dashboard — notifications */
(function (SC) {
  const escapeHtml = SC.escapeHtml;
  const formatDateTime = SC.formatDateTime;
  const PANEL_PREVIEW_LIMIT = 8;
  const PAGE_SIZE = 10;

  let pollTimer = null;
  let lastUnread = 0;
  let primed = false;
  let hooked = false;
  let cachedItems = [];
  let pageFilter = 'all';
  let notificationsPage = 1;
  let pageBound = false;

  function panelEl() {
    return SC.$('#notify-panel');
  }

  function isOpen() {
    return panelEl() && !panelEl().hidden;
  }

  function setOpen(open) {
    const panel = panelEl();
    const btn = SC.$('#topbar-notify');
    if (panel) {
      panel.hidden = !open;
      panel.classList.toggle('is-open', Boolean(open));
    }
    if (btn) {
      btn.setAttribute('aria-expanded', String(Boolean(open)));
      btn.classList.toggle('is-active', Boolean(open));
    }
    if (!open) return;
    loadNotifications({ silent: true });
  }

  function showToast(message) {
    const el = SC.$('#sc-toast');
    if (!el || !message) return;
    el.textContent = message;
    el.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      el.hidden = true;
    }, 4200);
  }

  function relativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return formatDateTime(iso);
  }

  function notifyItemHtml(n, extraClass) {
    const cls = ['notify-item', n.read_at ? '' : 'is-unread', extraClass || ''].filter(Boolean).join(' ');
    return `
      <button type="button" class="${cls}" data-notify-id="${n.id}" data-section="${escapeHtml(n.data?.section || '')}" data-record="${n.data?.id || ''}" data-tab="${escapeHtml(n.data?.tab || '')}" data-type="${escapeHtml(n.type || '')}" data-feedback-id="${n.data?.feedback_id || ''}" role="listitem">
        <strong>${escapeHtml(n.title)}</strong>
        <span>${escapeHtml(n.body || '')}</span>
        <em>${escapeHtml(relativeTime(n.created_at))}</em>
      </button>`;
  }

  function renderList(items) {
    const list = SC.$('#notify-list');
    const markAll = SC.$('#notify-mark-all');
    const summary = SC.$('#notify-summary');
    const seeAll = SC.$('#notify-see-all');
    if (!list) return;

    const unread = items.filter((n) => !n.read_at).length;
    if (markAll) markAll.hidden = unread < 1;
    if (summary) {
      summary.textContent = items.length
        ? (unread ? `${unread} unread · ${items.length} total` : `${items.length} notifications`)
        : 'Activity from your workspace';
    }
    if (seeAll) seeAll.hidden = items.length < 1;

    if (!items.length) {
      list.innerHTML = `
        <div class="notify-empty">
          <img src="https://api.iconify.design/lucide/bell-off.svg?color=%235C6775" alt="" width="28" height="28">
          <strong>All caught up</strong>
          <p>Record changes and due schedules will appear here when you open the bell.</p>
        </div>`;
      return;
    }

    const preview = items.slice(0, PANEL_PREVIEW_LIMIT);
    list.innerHTML = preview.map((n) => notifyItemHtml(n)).join('');
  }

  function setDot(unread) {
    const dot = SC.$('#topbar-notify-dot');
    if (dot) dot.hidden = unread < 1;
    const btn = SC.$('#topbar-notify');
    if (btn) btn.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
  }

  function filteredPageItems() {
    if (pageFilter === 'unread') return cachedItems.filter((n) => !n.read_at);
    return cachedItems;
  }

  function renderNotificationsPage() {
    const loading = SC.$('#notifications-page-loading');
    const empty = SC.$('#notifications-page-empty');
    const list = SC.$('#notifications-page-list');
    const count = SC.$('#notifications-page-count');
    const markAll = SC.$('#notifications-page-mark-all');
    const emptyTitle = SC.$('#notifications-page-empty-title');
    const emptyCopy = SC.$('#notifications-page-empty-copy');
    const pagination = SC.$('#notifications-page-pagination');
    if (!list) return;

    const items = filteredPageItems();
    const unreadTotal = cachedItems.filter((n) => !n.read_at).length;
    const pageData = SC.paginate(items, notificationsPage, PAGE_SIZE);
    notificationsPage = pageData.page;

    if (loading) loading.hidden = true;
    if (markAll) markAll.hidden = unreadTotal < 1;
    if (count) {
      count.textContent = items.length
        ? `${pageData.from}–${pageData.to} of ${pageData.total}${pageFilter === 'unread' ? ' unread' : ''}${unreadTotal ? ` · ${unreadTotal} unread total` : ''}`
        : '';
    }

    SC.$$('.notify-page-filter').forEach((btn) => {
      const active = btn.dataset.filter === pageFilter;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    if (!items.length) {
      list.hidden = true;
      if (empty) {
        empty.hidden = false;
        if (emptyTitle) {
          emptyTitle.textContent = pageFilter === 'unread' && cachedItems.length
            ? 'No unread notifications'
            : 'All caught up';
        }
        if (emptyCopy) {
          emptyCopy.textContent = pageFilter === 'unread' && cachedItems.length
            ? 'Switch to All to review earlier activity.'
            : 'New activity from your workspace will appear here.';
        }
      }
      list.innerHTML = '';
      if (pagination) pagination.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    list.hidden = false;
    list.innerHTML = pageData.items.map((n) => notifyItemHtml(n, 'notify-item--page')).join('');

    SC.renderPaginationControls({
      nav: pagination,
      prev: SC.$('#notifications-page-prev'),
      next: SC.$('#notifications-page-next'),
      meta: SC.$('#notifications-page-meta'),
      page: pageData.page,
      totalPages: pageData.totalPages,
      from: pageData.from,
      to: pageData.to,
      total: pageData.total,
    });
  }

  async function loadNotifications(options = {}) {
    try {
      const data = await SmartCareAPI.get('/notifications');
      const items = data.notifications || [];
      const unread = Number(data.unread || 0);
      cachedItems = items;
      renderList(items);
      setDot(unread);
      if (SC.$('#notifications-page-list')) renderNotificationsPage();
      if (primed && unread > lastUnread && items[0]?.title && !options.silent) {
        showToast(items[0].title);
      }
      primed = true;
      lastUnread = unread;
      return items;
    } catch {
      if (SC.$('#notifications-page-loading')) {
        SC.$('#notifications-page-loading').textContent = 'Could not load notifications.';
      }
      return cachedItems;
    }
  }

  function currentPageName() {
    return (location.pathname.split('/').pop() || '').toLowerCase();
  }

  async function openChildFromNotify(recordId, tab, feedbackId) {
    const targetPage = SC.sectionPage?.('children') || 'children.html';
    const alreadyThere = currentPageName() === String(targetPage).toLowerCase();
    const pending = {
      action: 'child-profile',
      id: Number(recordId),
      tab,
      feedbackId: feedbackId ? Number(feedbackId) : null,
    };

    if (alreadyThere) {
      await SC.showSection?.('children', { updateRoute: false });
      await SC.openChildProfile?.(pending.id, pending.tab, { feedbackId: pending.feedbackId });
      return;
    }

    sessionStorage.setItem('sc-pending', JSON.stringify(pending));
    await SC.navigateToSection?.('children');
  }

  async function openItem(btn) {
    const id = btn.dataset.notifyId;
    const section = btn.dataset.section;
    const record = btn.dataset.record;
    const feedbackId = btn.dataset.feedbackId || '';
    const tab = btn.dataset.tab || (btn.dataset.type === 'record.feedback' ? 'progress' : 'overview');
    try {
      if (id) await SmartCareAPI.patch(`/notifications/${id}/read`);
    } catch {
      /* still navigate */
    }
    setOpen(false);
    await loadNotifications({ silent: true });
    if (!section || !SC.canAccessSection?.(section)) return;

    if (record && section === 'children') {
      await openChildFromNotify(record, tab, feedbackId);
      return;
    }

    if (record) {
      if (section === 'therapy') {
        if (SC.isPsychometrician?.()) {
          await openChildFromNotify(record, 'overview', '');
          return;
        }
        sessionStorage.setItem('sc-pending', JSON.stringify({ action: 'therapy-view', id: String(record) }));
      }
      if (section === 'medication') sessionStorage.setItem('sc-pending', JSON.stringify({ action: 'medication-view', id: String(record) }));
      if (section === 'staff') sessionStorage.setItem('sc-pending', JSON.stringify({ action: 'staff-view', id: String(record) }));
    }
    await SC.navigateToSection?.(section);
  }

  async function markAllRead() {
    await SmartCareAPI.post('/notifications/read-all');
    await loadNotifications({ silent: true });
  }

  function hookMutations() {
    if (hooked || !window.SmartCareAPI) return;
    hooked = true;
    ['post', 'put', 'patch', 'delete'].forEach((method) => {
      const orig = SmartCareAPI[method].bind(SmartCareAPI);
      SmartCareAPI[method] = async (...args) => {
        const result = await orig(...args);
        const path = String(args[0] || '');
        if (!path.startsWith('/notifications')) {
          window.setTimeout(() => loadNotifications({ silent: true }), 350);
        }
        return result;
      };
    });
  }

  function initNotifications() {
    const btn = SC.$('#topbar-notify');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    hookMutations();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!isOpen());
    });
    SC.$('#notify-mark-all')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await markAllRead();
      } catch {
        /* ignore */
      }
    });
    SC.$('#notify-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-notify-id]');
      if (item) openItem(item);
    });
    SC.$('#notify-see-all')?.addEventListener('click', () => setOpen(false));
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.topbar-notify-wrap')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) setOpen(false);
    });

    loadNotifications({ silent: true });
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(() => loadNotifications({ silent: true }), 45000);
  }

  function initNotificationsPage() {
    if (pageBound) return;
    pageBound = true;

    SC.$('#notifications-page-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('[data-notify-id]');
      if (item) openItem(item);
    });

    SC.$('#notifications-page-mark-all')?.addEventListener('click', async () => {
      try {
        await markAllRead();
      } catch {
        /* ignore */
      }
    });

    SC.$$('.notify-page-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        pageFilter = btn.dataset.filter || 'all';
        notificationsPage = 1;
        renderNotificationsPage();
      });
    });

    SC.bindPaginationControls({
      prevId: '#notifications-page-prev',
      nextId: '#notifications-page-next',
      getPage: () => notificationsPage,
      setPage: (page) => {
        notificationsPage = page;
      },
      getTotalPages: () => SC.paginate(filteredPageItems(), notificationsPage, PAGE_SIZE).totalPages,
      onChange: () => renderNotificationsPage(),
    });
  }

  async function loadNotificationsPage() {
    initNotificationsPage();
    const loading = SC.$('#notifications-page-loading');
    if (loading) {
      loading.hidden = false;
      loading.textContent = 'Loading notifications…';
    }
    notificationsPage = 1;
    await loadNotifications({ silent: true });
  }

  SC.initNotifications = initNotifications;
  SC.initNotificationsPage = initNotificationsPage;
  SC.loadNotificationsPage = loadNotificationsPage;
  SC.refreshNotifications = loadNotifications;
  SC.showToast = showToast;
})(window.SmartCareApp);
