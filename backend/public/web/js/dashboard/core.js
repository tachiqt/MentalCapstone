/**
 * SmartCare dashboard core — shared state and helpers.
 */
window.SmartCareApp = window.SmartCareApp || {};
(function (SC) {
  SC.state = {
    currentUser: null,
    childrenCache: [],
    checklistsCache: [],
    assessmentsCache: [],
    workspace: {},
    lastAssessmentChildId: null,
    lastAssessmentId: null,
    viewingAssessmentId: null,
    childProfileCache: null,
    childProfileId: null,
  };

  SC.$ = (sel) => document.querySelector(sel);
  SC.$$ = (sel) => document.querySelectorAll(sel);

  SC.showAlert = function (el, message, type) {
    el.textContent = message;
    el.className = 'alert alert-' + (type || 'info');
    el.hidden = false;
  };
  SC.hideAlert = function (el) { el.hidden = true; };
  SC.formatRole = function (role) {
    return SmartCareAuth.formatRole(typeof role === 'object' ? role.value || role : role);
  };
  SC.canAccessWeb = () => SmartCareAuth.canAccessWeb(SC.currentUserRef());
  SC.canManageChildren = () => SmartCareAuth.hasRole(SC.currentUserRef(), 'head_doctor', 'psychometrician');
  SC.canCreateChecklists = () => SmartCareAuth.hasRole(SC.currentUserRef(), 'head_doctor', 'psychometrician');
  SC.canSubmitAssessments = () => SmartCareAuth.hasRole(SC.currentUserRef(), 'head_doctor', 'psychometrician');
  SC.canReviewRecommendations = () => SmartCareAuth.hasRole(SC.currentUserRef(), 'head_doctor');
  SC.canGenerateRecommendations = () => SmartCareAuth.hasRole(SC.currentUserRef(), 'head_doctor', 'psychometrician');
  SC.canExportFacilityReport = () => SmartCareAuth.hasRole(SC.currentUserRef(), 'head_doctor');
  SC.isHeadDoctor = () => SmartCareAuth.hasRole(SC.currentUserRef(), 'head_doctor');
  SC.isPsychometrician = () => SmartCareAuth.hasRole(SC.currentUserRef(), 'psychometrician');
  SC.homePageForUser = function (user) {
    const role = SmartCareAuth.roleValue(user || SC.state.currentUser || SmartCareAuth.getStoredUser());
    return role === 'psychometrician' ? 'assessments.html' : 'dashboard.html';
  };
  SC.currentUserRef = function () {
    return SC.state.currentUser || SmartCareAuth.getStoredUser();
  };
  SC.syncRoleChrome = function (user) {
    const subject = user || SC.currentUserRef();
    if (!subject) return '';
    SC.state.currentUser = SC.state.currentUser || subject;
    const role = SmartCareAuth.roleValue(subject);
    document.body.classList.toggle('role-psychometrician', role === 'psychometrician');
    document.body.classList.toggle('role-head-doctor', role === 'head_doctor');
    return role;
  };
  SC.navRoles = function (el) {
    return (el?.getAttribute('data-web-roles') || 'head_doctor,psychometrician')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  };
  SC.canAccessSection = function (section) {
    const role = SmartCareAuth.roleValue(SC.currentUserRef());
    if (!role) return false;
    const link = SC.$(`.nav-link[data-section="${section}"]`);
    const panel = SC.$('#section-' + section);
    const el = link || panel;
    if (!el) return false;
    return SC.navRoles(el).includes(role);
  };
  SC.childName = (child) => child.first_name + ' ' + child.last_name;
  SC.initialsFromName = function (name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'SC';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  SC.roleValueOf = function (userOrRole) {
    if (userOrRole == null) return '';
    if (typeof userOrRole === 'object') {
      if (Object.prototype.hasOwnProperty.call(userOrRole, 'role')) {
        const role = userOrRole.role;
        if (!role) return '';
        if (typeof role === 'object') return role.value || '';
        return String(role);
      }
      return userOrRole.value || '';
    }
    return String(userOrRole);
  };
  SC.assetsBase = function () {
    return String(window.SmartCareConfig?.assetsUrl || '').replace(/\/$/, '');
  };
  SC.assetUrl = function (path) {
    const raw = String(path || '');
    const base = SC.assetsBase();
    if (!base) return raw;
    const cleaned = raw.replace(/^\.\.\//, '').replace(/^\.\//, '');
    const under = cleaned.replace(/^assets\//, '');
    return `${base}/${under}`;
  };
  SC.applyAssetTheme = function () {
    const banner = SC.assetUrl('assets/bannerbackground.png');
    if (SC.assetsBase()) {
      document.documentElement.style.setProperty('--sc-banner-bg', `url("${banner}")`);
    }
  };
  SC.userAvatarUrl = function (user) {
    if (!user) return '';
    const custom = user.avatar_url || user.photo_url || user.profile_photo || '';
    if (custom) return String(custom);
    const role = SC.roleValueOf(user);
    if (role === 'head_doctor') return SC.assetUrl('assets/avatars/head-doctor.png');
    if (role === 'psychometrician') return SC.assetUrl('assets/avatars/psychometrician.png');
    return '';
  };
  SC.avatarMarkup = function (user, { className = 'staff-avatar', name } = {}) {
    const label = name || user?.name || 'User';
    const url = SC.userAvatarUrl(user);
    const base = String(className || 'staff-avatar').trim();
    if (url) {
      return `<span class="${SC.escapeHtml(base)} has-photo" aria-hidden="true"><img src="${SC.escapeHtml(url)}" alt=""></span>`;
    }
    return `<span class="${SC.escapeHtml(base)}" aria-hidden="true">${SC.escapeHtml(SC.initialsFromName(label))}</span>`;
  };
  SC.fillAvatarEl = function (el, user, { name } = {}) {
    if (!el) return;
    const label = name || user?.name || 'User';
    const url = SC.userAvatarUrl(user);
    el.classList.toggle('has-photo', Boolean(url));
    if (url) {
      el.innerHTML = `<img src="${SC.escapeHtml(url)}" alt="">`;
    } else {
      el.textContent = SC.initialsFromName(label);
    }
  };
  SC.openModal = function (id) {
    const d = SC.$('#' + id);
    if (d && d.showModal) d.showModal();
  };
  SC.closeModal = function (id) {
    const d = SC.$('#' + id);
    if (d && d.open) d.close();
  };

  SC.escapeHtml = function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseDisplayDate(iso) {
    if (!iso) return null;
    let value = String(iso).trim();
    // Laravel may emit 6-digit fractional seconds; trim to millis for broad Date support.
    value = value.replace(/(\.\d{3})\d+(Z|[+-]\d{2}:?\d{2})?$/i, '$1$2');
    // Date-only values: parse at local noon so the calendar day does not shift.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      value = `${value}T12:00:00`;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  SC.formatDate = function formatDate(iso) {
    if (!iso) return '—';
    try {
      const date = parseDisplayDate(iso);
      if (!date) return String(iso);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return String(iso);
    }
  };

  SC.formatDateTime = function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      const date = parseDisplayDate(iso);
      if (!date) return String(iso);
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return String(iso);
    }
  };

  SC.truncate = function truncate(str, len) {
    if (!str || str.length <= len) return str;
    return `${str.slice(0, len)}…`;
  };

  SC.pluralLabel = function (count, singular, plural) {
    return Number(count) === 1 ? singular : (plural || `${singular}s`);
  };

  SC.paginate = function (items, page, pageSize) {
    const rows = Array.isArray(items) ? items : [];
    const size = Math.max(1, Number(pageSize) || 10);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / size) || 1);
    const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
    const start = (safePage - 1) * size;
    return {
      page: safePage,
      pageSize: size,
      totalPages,
      total,
      items: rows.slice(start, start + size),
      from: total ? start + 1 : 0,
      to: Math.min(start + size, total),
    };
  };

  SC.renderPaginationControls = function ({ nav, prev, next, meta, page, totalPages, from, to, total }) {
    if (nav) nav.hidden = totalPages <= 1;
    if (meta) {
      meta.textContent = total
        ? `Page ${page} of ${totalPages} · Showing ${from}–${to} of ${total}`
        : 'No results';
    }
    if (prev) prev.disabled = page <= 1;
    if (next) next.disabled = page >= totalPages;
  };

  SC.bindPaginationControls = function ({ prevId, nextId, getPage, setPage, getTotalPages, onChange }) {
    SC.$(prevId)?.addEventListener('click', () => {
      const page = getPage();
      if (page <= 1) return;
      setPage(page - 1);
      onChange?.({ scrollToTop: true });
    });
    SC.$(nextId)?.addEventListener('click', () => {
      const page = getPage();
      const totalPages = getTotalPages();
      if (page >= totalPages) return;
      setPage(page + 1);
      onChange?.({ scrollToTop: true });
    });
  };

  SC.withBusy = async function (opts, fn) {
    const button = typeof opts?.button === 'string' ? SC.$(opts.button) : opts?.button;
    const overlay = typeof opts?.overlay === 'string' ? SC.$(opts.overlay) : opts?.overlay;
    const sectionLoading = typeof opts?.section === 'string' ? SC.$(opts.section) : opts?.section;
    const prevDisabled = button ? button.disabled : false;
    const prevText = button ? button.textContent : '';
    try {
      if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.classList.add('is-busy');
        if (opts?.busyLabel) button.textContent = opts.busyLabel;
      }
      if (overlay) overlay.hidden = false;
      if (sectionLoading) sectionLoading.hidden = false;
      return await fn();
    } finally {
      if (button) {
        button.disabled = prevDisabled;
        button.removeAttribute('aria-busy');
        button.classList.remove('is-busy');
        if (opts?.busyLabel) button.textContent = prevText;
      }
      if (overlay) overlay.hidden = true;
      // do not auto-hide sectionLoading — callers manage list loaders
    }
  };
})(window.SmartCareApp);
