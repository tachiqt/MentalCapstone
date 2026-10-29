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
  async function loadMe() {
    try {
      SC.state.currentUser = await SmartCareAuth.fetchMe();
    } catch {
      SC.state.currentUser = SmartCareAuth.getStoredUser();
      if (!SC.state.currentUser || !SmartCareAuth.canAccessWeb(SC.state.currentUser)) {
        SmartCareAuth.logout();
        return;
      }
    }

    SC.$('#user-badge').innerHTML = `
      <span class="user-avatar" aria-hidden="true">${escapeHtml(initialsFromName(SC.state.currentUser.name))}</span>
      <span class="user-badge__meta">
        <strong>${escapeHtml(SC.state.currentUser.name)}</strong>
        <span>${escapeHtml(formatRole(SC.state.currentUser.role))}</span>
      </span>
    `;
    if (!SmartCareAuth.canAccessWeb(SC.state.currentUser)) {
      SmartCareAuth.logout();
      return;
    }
    applyRoleRestrictions();
  }

  function initUserChrome() {
    SC.$('#user-badge')?.addEventListener('click', () => {
      window.location.href = 'settings.html';
    });
  }

  function applyRoleRestrictions() {
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

    const checklistRestricted = SC.$('#create-checklist-restricted');
    if (!canCreateChecklists()) {
      if (checklistRestricted) checklistRestricted.hidden = false;
      ['#open-checklist-modal', '#empty-open-checklist'].forEach((sel) => {
        const el = SC.$(sel);
        if (el) {
          el.disabled = true;
          el.hidden = true;
        }
      });
      const checklistForm = SC.$('#create-checklist-form');
      checklistForm?.querySelector('button[type=submit]')?.setAttribute('disabled', '');
      const addBtn = SC.$('#add-checklist-item-btn');
      if (addBtn) addBtn.disabled = true;
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
      SC.$('#overview-sessions-loading')?.hidden = true;
      SC.$('#overview-sessions-empty')?.hidden = true;
      SC.$('#overview-sessions-wrap')?.hidden = true;
      const search = SC.$('#global-search');
      if (search) search.placeholder = 'Search children…';
    } else {
      SC.$('#overview-layout-head')?.classList.remove('is-layout-hidden');
      SC.$('#overview-layout-psycho')?.classList.add('is-layout-hidden');
    }

    const checklistBanner = SC.$('#checklist-readonly-banner');
    if (checklistBanner) checklistBanner.hidden = canCreateChecklists();

    const assessmentsMine = SC.$('#assessments-filter-mine');
    if (assessmentsMine && SC.isPsychometrician()) assessmentsMine.checked = true;

    document.body.classList.toggle('role-psychometrician', SC.isPsychometrician());
    document.body.classList.toggle('role-head-doctor', isHeadDoctor());
  }


  SC.loadMe = loadMe;
  SC.initUserChrome = initUserChrome;
  SC.applyRoleRestrictions = applyRoleRestrictions;
})(window.SmartCareApp);
