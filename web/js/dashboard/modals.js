/** SmartCare dashboard — modals */
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



  /* Modals */
  function initModals() {
    SC.$$('[data-open-modal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.id === 'open-child-modal' || btn.id === 'empty-open-child') {
          if (!canManageChildren()) return;
        }
        if (btn.id === 'open-checklist-modal' || btn.id === 'empty-open-checklist') {
          if (!canCreateChecklists()) return;
        }
        if (btn.id === 'open-assessment-modal') {
          if (!canSubmitAssessments()) return;
        }
        openModal(btn.getAttribute('data-open-modal'));
      });
    });
    SC.$$('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('dialog')?.close());
    });
    SC.$$('dialog.modal').forEach((d) => {
      d.addEventListener('click', (e) => {
        if (e.target === d) d.close();
      });
    });
  }


  SC.initModals = initModals;
})(window.SmartCareApp);
