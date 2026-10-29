/** SmartCare dashboard boot */
(async function (SC) {
  if (!SmartCareAuth.requireAuth('login.html')) return;
  if (SC.legacyHashRedirect && SC.legacyHashRedirect()) return;

  const BASE = 'partials/dashboard/';
  const SHELL = [
    { file: 'sidebar.html', slot: 'dashboard-sidebar-slot' },
    { file: 'header.html', slot: 'dashboard-header-slot' },
  ];
  const PARTIALS = [
    'section-overview.html','section-children.html','section-checklists.html','section-assessments.html',
    'section-reports.html','section-staff.html','section-therapy.html','section-medication.html',
    'section-materials.html','section-settings.html','section-help.html','section-notifications.html',
    'modal-child.html','modal-child-status.html','modal-checklist.html','modal-checklist-view.html',
    'modal-assessment.html','modal-assessment-view.html','modal-child-profile.html',
    'modal-staff.html','modal-therapy.html','modal-medication.html','modal-materials.html',
    'modal-progress-update.html','modal-assign.html',
  ];

  async function loadHtml(file) {
    const res = await fetch(BASE + file, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to load ' + file);
    return res.text();
  }

  function consumePendingAction() {
    try {
      const raw = sessionStorage.getItem('sc-pending');
      if (!raw) return;
      sessionStorage.removeItem('sc-pending');
      const pending = JSON.parse(raw);
      if (pending.action === 'child-profile') {
        SC.openChildProfile?.(pending.id, pending.tab || 'overview', {
          feedbackId: pending.feedbackId || null,
        });
      }
      if (pending.action === 'therapy-view') SC.openTherapyModal?.('view', String(pending.id));
      if (pending.action === 'medication-view') SC.openMedicationModal?.('view', String(pending.id));
      if (pending.action === 'staff-view') SC.openStaffModal?.('view', String(pending.id));
    } catch {
      /* ignore */
    }
  }
  SC.consumePendingAction = consumePendingAction;

  async function loadShell() {
    const htmls = await Promise.all(SHELL.map(async ({ file, slot }) => ({
      slot,
      html: await loadHtml(file),
    })));
    for (const { slot, html } of htmls) {
      const el = document.getElementById(slot);
      if (el) el.outerHTML = html;
    }
    SC.syncRoleChrome?.(SmartCareAuth.getStoredUser());
    SC.renderUserBadge?.(SmartCareAuth.getStoredUser());
  }

  async function loadPartials() {
    const sectionsRoot = document.getElementById('dashboard-sections');
    const modalsRoot = document.getElementById('dashboard-modals');
    const htmls = await Promise.all(PARTIALS.map(async (file) => ({
      file,
      html: await loadHtml(file),
    })));
    for (const { file, html } of htmls) {
      if (file.startsWith('section-')) sectionsRoot.insertAdjacentHTML('beforeend', html);
      else modalsRoot.insertAdjacentHTML('beforeend', html);
    }
    if (!SC.$('#dashboard-boot-loading')) {
      sectionsRoot.insertAdjacentHTML('afterbegin', '<div class="panel analytics-loading" id="dashboard-boot-loading">Loading workspace…</div>');
    }
    SC.applyNavAccess?.();
  }

  try {
    const cfg = await SmartCareAPI.get('/app-config');
    window.SmartCareConfig = {
      assetsUrl: cfg?.assets_url || '',
    };
    SC.applyAssetTheme?.();
  } catch {
    window.SmartCareConfig = window.SmartCareConfig || { assetsUrl: '' };
  }

  try {
    await loadShell();
    await loadPartials();
  } catch (err) {
    console.error(err);
    const sections = document.getElementById('dashboard-sections');
    if (sections) {
      sections.innerHTML =
        '<div class="panel alert alert-error">Could not load dashboard. ' + (err.message || '') + '</div>';
    }
    return;
  }

  SC.initNav && SC.initNav();
  SC.initSearch && SC.initSearch();
  SC.initNotifications && SC.initNotifications();
  SC.initNotificationsPage && SC.initNotificationsPage();
  SC.initSettings && SC.initSettings();
  SC.initTheme && SC.initTheme();
  SC.initHelp && SC.initHelp();
  SC.initUserChrome && SC.initUserChrome();
  SC.initModals && SC.initModals();
  SC.initOverviewActions && SC.initOverviewActions();
  SC.initProgressUpdates && SC.initProgressUpdates();
  SC.initCreateChild && SC.initCreateChild();
  SC.initChecklistBuilder && SC.initChecklistBuilder();
  SC.initChecklistFilters && SC.initChecklistFilters();
  SC.initChecklistMenuDismiss && SC.initChecklistMenuDismiss();
  SC.initAssessments && SC.initAssessments();
  SC.initAssessmentViewActions && SC.initAssessmentViewActions();
  SC.initChildProfile && SC.initChildProfile();
  SC.initReports && SC.initReports();
  SC.initStaff && SC.initStaff();
  SC.initTherapy && SC.initTherapy();
  SC.initMedication && SC.initMedication();
  SC.initMaterials && SC.initMaterials();
  SC.initChildrenSearch && SC.initChildrenSearch();
  SC.initAssign && SC.initAssign();

  try {
    await (SC.loadMe && SC.loadMe());
    if (SC.state.currentUser && SmartCareAuth.canAccessWeb(SC.state.currentUser)) {
      await (SC.restoreInitialSection && SC.restoreInitialSection());
      consumePendingAction();
      await (SC.loadSettings && SC.loadSettings());
      if (SC.getInitialSection?.() === 'dashboard') {
        await (SC.loadAnalytics && SC.loadAnalytics());
      }

      const defer = window.requestIdleCallback || function (cb) { setTimeout(cb, 120); };
      defer(function () {
        SC.loadChildren && SC.loadChildren();
        SC.loadChecklists && SC.loadChecklists();
      });
    }
  } finally {
    SC.renderUserBadge?.(SC.state.currentUser || SmartCareAuth.getStoredUser());
    SC.$('#dashboard-boot-loading')?.remove();
  }
})(window.SmartCareApp);
