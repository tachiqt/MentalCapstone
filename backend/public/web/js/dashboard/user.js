/** SmartCare dashboard — user */
(function (SC) {
  const showAlert = SC.showAlert;
  const hideAlert = SC.hideAlert;
  const formatRole = SC.formatRole;
  const canManageChildren = SC.canManageChildren;
  const canCreateChecklists = SC.canCreateChecklists;
  const canSubmitAssessments = SC.canSubmitAssessments;
  const canReviewRecommendations = SC.canReviewRecommendations;
  const isHeadDoctor = SC.isHeadDoctor;
  const childName = SC.childName;
  const initialsFromName = SC.initialsFromName;
  const openModal = SC.openModal;
  const closeModal = SC.closeModal;
  const escapeHtml = SC.escapeHtml;
  const formatDate = SC.formatDate;
  const truncate = SC.truncate;



  /* User */
  function renderUserBadge(user) {
    const badge = SC.$('#user-badge');
    if (!badge || !user) return;
    badge.innerHTML = `
      ${SC.avatarMarkup(user, { className: 'user-avatar', name: user.name })}
      <span class="user-badge__meta">
        <strong>${escapeHtml(user.name || user.username || 'User')}</strong>
        <span>${escapeHtml(formatRole(user.role))}</span>
      </span>
    `;
  }

  async function loadMe() {
    const stored = SmartCareAuth.getStoredUser();
    if (stored) {
      SC.state.currentUser = stored;
      renderUserBadge(stored);
    }

    try {
      SC.state.currentUser = await SmartCareAuth.fetchMe();
    } catch {
      SC.state.currentUser = SmartCareAuth.getStoredUser();
      if (!SC.state.currentUser || !SmartCareAuth.canAccessWeb(SC.state.currentUser)) {
        SmartCareAuth.logout();
        return;
      }
    }

    renderUserBadge(SC.state.currentUser);

    const prefs = SC.state.currentUser?.preferences || {};
    if (prefs.theme === 'dark' || prefs.theme === 'light') {
      SC.setTheme?.(prefs.theme);
    }

    if (!SmartCareAuth.canAccessWeb(SC.state.currentUser)) {
      SmartCareAuth.logout();
      return;
    }

    try {
      applyRoleRestrictions();
    } catch (err) {
      console.error('applyRoleRestrictions failed', err);
    }
  }

  function initUserChrome() {
    SC.$('#user-badge')?.addEventListener('click', () => {
      window.location.href = 'settings.html';
    });
  }

  function applyRoleRestrictions() {
    SC.syncRoleChrome?.();
    SC.applyNavAccess && SC.applyNavAccess();

    const childRestricted = SC.$('#create-child-restricted');
    if (!canManageChildren()) {
      if (childRestricted) childRestricted.hidden = false;
      ['#open-child-modal', '#empty-open-child'].forEach((sel) => {
        const el = SC.$(sel);
        if (el) {
          el.disabled = true;
          el.hidden = true;
        }
      });
      const childForm = SC.$('#create-child-form');
      childForm?.querySelector('button[type=submit]')?.setAttribute('disabled', '');
    }

    const checklistCreateActions = SC.$('#checklists-create-actions');
    const emptyCopy = SC.$('#checklists-empty-copy');
    if (!canCreateChecklists()) {
      if (checklistCreateActions) checklistCreateActions.hidden = true;
      ['#open-checklist-modal', '#empty-open-checklist'].forEach((sel) => {
        const el = SC.$(sel);
        if (el) {
          el.disabled = true;
          el.hidden = true;
        }
      });
      if (emptyCopy) {
        emptyCopy.innerHTML =
          'Checklists are maintained by Head Doctors and Psychometricians. You can review items here and use them when starting a new assessment.';
      }
      const checklistForm = SC.$('#create-checklist-form');
      checklistForm?.querySelector('button[type=submit]')?.setAttribute('disabled', '');
      const addBtn = SC.$('#add-checklist-item-btn');
      if (addBtn) addBtn.disabled = true;
    } else {
      if (checklistCreateActions) checklistCreateActions.hidden = false;
      if (emptyCopy) {
        emptyCopy.textContent = 'Create an assessment checklist to begin evaluations.';
      }
    }

    const assessmentRestricted = SC.$('#submit-assessment-restricted');
    if (!canSubmitAssessments()) {
      if (assessmentRestricted) assessmentRestricted.hidden = false;
      ['#open-assessment-modal'].forEach((sel) => {
        const openBtn = SC.$(sel);
        if (openBtn) {
          openBtn.disabled = true;
          openBtn.hidden = true;
        }
      });
      const assessmentForm = SC.$('#submit-assessment-form');
      if (assessmentForm) assessmentForm.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    }

    if (SC.applyReportRoleAccess) SC.applyReportRoleAccess();
    if (SC.applyHelpRoleAccess) SC.applyHelpRoleAccess();

    if (SC.isPsychometrician()) {
      SC.$('#overview-layout-head')?.classList.add('is-layout-hidden');
      SC.$('#overview-layout-psycho')?.classList.remove('is-layout-hidden');
      ['#overview-sessions-loading', '#overview-sessions-empty', '#overview-sessions-wrap'].forEach((sel) => {
        const el = SC.$(sel);
        if (el) el.hidden = true;
      });
      const search = SC.$('#global-search');
      if (search) search.placeholder = 'Search children…';
    } else {
      SC.$('#overview-layout-head')?.classList.remove('is-layout-hidden');
      SC.$('#overview-layout-psycho')?.classList.add('is-layout-hidden');
    }

    const assessmentsMine = SC.$('#assessments-filter-mine');
    if (assessmentsMine && SC.isPsychometrician()) assessmentsMine.checked = true;

    document.body.classList.toggle('role-psychometrician', SC.isPsychometrician());
    document.body.classList.toggle('role-head-doctor', isHeadDoctor());
  }


  SC.loadMe = loadMe;
  SC.renderUserBadge = renderUserBadge;
  SC.initUserChrome = initUserChrome;
  SC.applyRoleRestrictions = applyRoleRestrictions;
})(window.SmartCareApp);
