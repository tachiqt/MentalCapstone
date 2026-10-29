/** SmartCare dashboard — nav */
(function (SC) {
  const loadAnalytics = (...args) => SC.loadAnalytics(...args);
  const renderAnalytics = (...args) => SC.renderAnalytics(...args);
  const loadChildren = (...args) => SC.loadChildren(...args);
  const loadChecklists = (...args) => SC.loadChecklists(...args);
  const loadSubmittedAssessments = (...args) => SC.loadSubmittedAssessments(...args);
  const loadFacilityReport = (...args) => SC.loadFacilityReport(...args);
  const loadStaff = (...args) => SC.loadStaff(...args);
  const loadTherapySessions = (...args) => SC.loadTherapySessions(...args);
  const loadMedicationSchedules = (...args) => SC.loadMedicationSchedules(...args);
  const loadMaterials = (...args) => SC.loadMaterials(...args);

  const sectionMeta = {
    dashboard: {
      title: 'My workspace',
      subtitle: 'Sessions, reviews, and facility status',
      psychoSubtitle: 'Your assessments, AI drafts, and child records',
    },
    children: {
      title: 'Children Registry',
      subtitle: 'Manage active and inactive patient records',
    },
    checklists: {
      title: 'Checklists Library',
      subtitle: 'Manage and access clinical assessment checklists',
    },
    assessments: {
      title: 'Assessments Hub',
      subtitle: 'Encoding, severity & AI suggestions',
    },
    reports: {
      title: 'Reports',
      subtitle: 'Preview and export official facility and child records',
    },
    staff: {
      title: 'Staff Directory',
      subtitle: 'Review registrations, assign roles, and manage access',
    },
    therapy: {
      title: 'Therapy Sessions',
      subtitle: 'Schedule, manage, and track therapy sessions',
    },
    medication: {
      title: 'Medication Schedules',
      subtitle: 'Create and review plans caretakers administer',
    },
    materials: {
      title: 'Resource Library',
      subtitle: 'Learning materials for therapy support',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Profile, credentials, and facility defaults',
    },
    help: {
      title: 'Staff manual',
      subtitle: 'How to use the SmartCare web workspace',
    },
    notifications: {
      title: 'Notifications',
      subtitle: 'All workspace activity and schedule reminders',
    },
  };

  function currentPage() {
    return location.pathname.split('/').pop() || 'dashboard.html';
  }

  function sectionPage(section) {
    return section === 'dashboard' ? 'dashboard.html' : `${section}.html`;
  }

  function getInitialSection() {
    const routed = window.SC_ROUTE_SECTION;
    if (routed && sectionMeta[routed]) return routed;
    const file = currentPage().replace(/\.html$/i, '');
    if (file && sectionMeta[file]) return file;
    const hash = (location.hash || '').replace(/^#/, '').trim().toLowerCase();
    if (hash && sectionMeta[hash]) return hash;
    return 'dashboard';
  }

  function legacyHashRedirect() {
    const hash = (location.hash || '').replace(/^#/, '').trim().toLowerCase();
    if (!hash || hash === 'dashboard' || !sectionMeta[hash]) return false;
    if (currentPage() !== 'dashboard.html') return false;
    location.replace(`${sectionPage(hash)}${location.search}`);
    return true;
  }

  function setNavCollapsed(collapsed) {
    const shell = SC.$('.shell--dashboard');
    const btn = SC.$('#sidebar-toggle');
    shell?.classList.toggle('is-nav-collapsed', Boolean(collapsed));
    try {
      localStorage.setItem('sc-nav-collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!btn) return;
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
    const img = btn.querySelector('img');
    if (img) {
      img.src = collapsed
        ? 'https://api.iconify.design/lucide/chevron-right.svg?color=%230F4C4A'
        : 'https://api.iconify.design/lucide/chevron-left.svg?color=%230F4C4A';
    }
  }

  function activateSectionPanel(section) {
    SC.$$('.section-panel').forEach((panel) => {
      const isTarget = panel.id === `section-${section}`;
      panel.classList.toggle('is-visible', isTarget);
      if (isTarget) panel.hidden = false;
    });
    const btn = SC.$(`.nav-link[data-section="${section}"]`);
    SC.$$('.nav-link[data-section]').forEach((b) => b.classList.toggle('is-active', Boolean(btn && b === btn)));
  }

  function showSection(section, options = {}) {
    const { updateRoute = true } = options;
    if (!sectionMeta[section]) return Promise.resolve(false);

    SC.$('#dashboard-boot-loading')?.remove();

    if (updateRoute && currentPage() !== sectionPage(section)) {
      if (SC.canAccessSection && !SC.canAccessSection(section)) {
        location.replace(`${SC.homePageForUser?.(SC.currentUserRef()) || 'dashboard.html'}${location.search}`);
        return Promise.resolve(false);
      }
      location.href = `${sectionPage(section)}${location.search}`;
      return Promise.resolve(false);
    }

    if (SC.canAccessSection && !SC.canAccessSection(section)) {
      return Promise.resolve(false);
    }

    activateSectionPanel(section);
    const meta = sectionMeta[section] || { title: 'SmartCare', subtitle: '' };
    const title = SC.$('#topbar-title');
    const subtitle = SC.$('#topbar-subtitle');
    if (title) {
      title.textContent = section === 'dashboard' && SC.isPsychometrician?.()
        ? 'My workspace'
        : meta.title;
    }
    if (subtitle) {
      subtitle.textContent = section === 'dashboard' && SC.isPsychometrician?.()
        ? (meta.psychoSubtitle || meta.subtitle)
        : meta.subtitle;
    }
    document.title = `${meta.title} — SmartCare`;

    let loading = Promise.resolve();
    if (section === 'dashboard') {
      if (!window.__facilityReport) loading = Promise.resolve(loadAnalytics());
      else renderAnalytics(window.__facilityReport);
    }
    if (section === 'children' && !SC.state.childrenCache.length) loading = Promise.resolve(loadChildren());
    if (section === 'checklists' && !SC.state.checklistsCache.length) loading = Promise.resolve(loadChecklists());
    if (section === 'assessments') loading = Promise.resolve(loadSubmittedAssessments());
    if (section === 'reports') {
      if (!SC.state.childrenCache.length && SC.loadChildren) SC.loadChildren();
      loading = Promise.resolve(loadFacilityReport());
    }
    if (section === 'staff') loading = Promise.resolve(loadStaff());
    if (section === 'therapy') loading = Promise.resolve(loadTherapySessions());
    if (section === 'medication') loading = Promise.resolve(loadMedicationSchedules());
    if (section === 'materials') loading = Promise.resolve(loadMaterials());
    if (section === 'settings') loading = Promise.resolve(SC.loadSettings?.());
    if (section === 'notifications') loading = Promise.resolve(SC.loadNotificationsPage?.());
    return Promise.resolve(loading).then(() => true);
  }

  function navigateToSection(section) {
    if (!sectionMeta[section]) return Promise.resolve(false);
    return showSection(section, { updateRoute: true });
  }

  function applyNavAccess() {
    const role = SC.syncRoleChrome?.() || SmartCareAuth.roleValue(SC.currentUserRef());
    if (!role) return;

    SC.$$('.nav-link[data-section]').forEach((el) => {
      const allowed = SC.navRoles(el);
      const show = allowed.includes(role);
      el.hidden = !show;
      el.classList.toggle('is-nav-hidden', !show);
    });

    SC.$$('.section-panel[data-web-roles]').forEach((panel) => {
      const allowed = SC.navRoles(panel);
      const show = allowed.includes(role);
      panel.hidden = !show;
      if (!show) panel.classList.remove('is-visible');
    });

    const intended = getInitialSection();
    if (!SC.canAccessSection(intended)) {
      const home = SC.homePageForUser?.(SC.currentUserRef()) || 'dashboard.html';
      if (currentPage() !== home) {
        location.replace(`${home}${location.search}`);
        return;
      }
    }
  }

  function firstAllowedSection() {
    const role = SmartCareAuth.roleValue(SC.currentUserRef());
    if (!role) return getInitialSection();
    for (const section of Object.keys(sectionMeta)) {
      if (SC.canAccessSection(section)) return section;
    }
    return role === 'psychometrician' ? 'assessments' : 'dashboard';
  }

  function restoreInitialSection() {
    SC.applyNavAccess?.();
    const intended = getInitialSection();
    return showSection(intended, { updateRoute: false }).then((ok) => {
      if (ok) return true;
      const fallback = firstAllowedSection();
      return showSection(fallback, { updateRoute: false }).then((ok2) => {
        if (ok2) return true;
        if (SC.canAccessSection?.(intended)) {
          activateSectionPanel(intended);
          return true;
        }
        return false;
      });
    });
  }

  function ensureNavBackdrop() {
    let backdrop = document.getElementById('nav-backdrop');
    if (backdrop) return backdrop;
    backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.id = 'nav-backdrop';
    backdrop.className = 'nav-backdrop';
    backdrop.setAttribute('aria-label', 'Close navigation');
    backdrop.hidden = true;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', () => setMobileNavOpen(false));
    return backdrop;
  }

  function setMobileNavOpen(open) {
    const shell = SC.$('.shell--dashboard');
    const menuBtn = SC.$('#topbar-menu');
    const backdrop = ensureNavBackdrop();
    shell?.classList.toggle('is-nav-open', Boolean(open));
    document.body.classList.toggle('is-nav-drawer-open', Boolean(open));
    if (menuBtn) menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    backdrop.hidden = !open;
    backdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function initNav() {
    try {
      setNavCollapsed(localStorage.getItem('sc-nav-collapsed') === '1');
    } catch {
      setNavCollapsed(false);
    }
    ensureNavBackdrop();

    SC.$('#sidebar-toggle')?.addEventListener('click', () => {
      setNavCollapsed(!SC.$('.shell--dashboard')?.classList.contains('is-nav-collapsed'));
    });

    document.addEventListener('click', (e) => {
      const menuBtn = e.target.closest?.('#topbar-menu');
      if (menuBtn) {
        e.preventDefault();
        setMobileNavOpen(true);
        return;
      }
      if (e.target.closest?.('#sidebar-close')) {
        e.preventDefault();
        setMobileNavOpen(false);
      }
    });

    SC.$$('.nav-link[data-section]').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const section = link.dataset.section;
        if (!SC.canAccessSection?.(section)) return;
        setMobileNavOpen(false);
        SC.navigateToSection?.(section);
      });
    });

    window.addEventListener('resize', () => {
      if (window.matchMedia('(min-width: 901px)').matches) setMobileNavOpen(false);
    });

    SC.$('#logout-btn')?.addEventListener('click', () => SmartCareAuth.logout());
  }

  SC.sectionMeta = sectionMeta;
  SC.sectionPage = sectionPage;
  SC.getInitialSection = getInitialSection;
  SC.legacyHashRedirect = legacyHashRedirect;
  SC.initNav = initNav;
  SC.showSection = showSection;
  SC.navigateToSection = navigateToSection;
  SC.restoreInitialSection = restoreInitialSection;
  SC.setNavCollapsed = setNavCollapsed;
  SC.setMobileNavOpen = setMobileNavOpen;
  SC.applyNavAccess = applyNavAccess;
})(window.SmartCareApp);
