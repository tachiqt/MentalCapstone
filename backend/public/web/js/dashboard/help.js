/** SmartCare dashboard — help manual */
(function (SC) {
  function setActiveSection(id) {
    SC.$$('.help-toc-link:not(.is-help-hidden)').forEach((link) => {
      link.classList.toggle('is-active', link.dataset.helpSection === id);
    });
  }

  function applyHelpRoleAccess() {
    const psycho = SC.isPsychometrician?.();
    SC.$$('.help-toc-link[data-help-roles], .help-nav__link[data-help-roles]').forEach((link) => {
      const roles = (link.getAttribute('data-help-roles') || '').split(',').map((r) => r.trim()).filter(Boolean);
      const show = !roles.length || (psycho ? roles.includes('psychometrician') : roles.includes('head_doctor'));
      link.hidden = !show;
      link.classList.toggle('is-help-hidden', !show);
    });
    SC.$$('.help-chapter[data-help-roles], .help-topic[data-help-roles]').forEach((topic) => {
      const roles = (topic.getAttribute('data-help-roles') || '').split(',').map((r) => r.trim()).filter(Boolean);
      const show = !roles.length || (psycho ? roles.includes('psychometrician') : roles.includes('head_doctor'));
      topic.hidden = !show;
    });
    const first = SC.$('.help-toc-link:not(.is-help-hidden)') || SC.$('.help-nav__link:not(.is-help-hidden)');
    if (first) setActiveSection(first.dataset.helpSection);
  }

  function initHelp() {
    const section = SC.$('#section-help');
    const links = SC.$$('.help-toc-link');
    if (!section || !links.length || section.dataset.bound === '1') return;
    section.dataset.bound = '1';
    applyHelpRoleAccess();

    links.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (link.hidden) return;
        const id = link.dataset.helpSection;
        const target = SC.$(`#${id}`);
        setActiveSection(id);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    const chapters = SC.$$('.help-chapter:not([hidden])');
    if (!chapters.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveSection(visible.target.id);
      },
      { root: null, rootMargin: '-18% 0px -55% 0px', threshold: [0.15, 0.4, 0.7] }
    );
    chapters.forEach((chapter) => observer.observe(chapter));
  }

  SC.initHelp = initHelp;
  SC.applyHelpRoleAccess = applyHelpRoleAccess;
})(window.SmartCareApp);
