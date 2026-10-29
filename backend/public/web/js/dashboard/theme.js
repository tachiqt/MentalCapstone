/** SmartCare dashboard — light/dark theme */
(function (SC) {
  const STORAGE_KEY = 'sc-theme';

  function normalizeTheme(value) {
    return value === 'dark' ? 'dark' : 'light';
  }

  function getStoredTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY));
    } catch {
      return 'light';
    }
  }

  function syncThemeControls(theme) {
    const light = SC.$('#settings-theme-light');
    const dark = SC.$('#settings-theme-dark');
    if (light) light.checked = theme === 'light';
    if (dark) dark.checked = theme === 'dark';
    document.querySelectorAll('.settings-theme__option').forEach((el) => {
      const input = el.querySelector('input[type="radio"]');
      el.classList.toggle('is-selected', Boolean(input?.checked));
    });
  }

  function setTheme(theme, { persist = true } = {}) {
    const next = normalizeTheme(theme);
    document.documentElement.dataset.theme = next;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore quota / private mode */
      }
    }
    syncThemeControls(next);
    return next;
  }

  function initTheme() {
    const applied = setTheme(getStoredTheme(), { persist: false });
    document.documentElement.dataset.theme = applied;

    document.querySelectorAll('input[name="settings-theme"]').forEach((input) => {
      if (input.dataset.bound === '1') return;
      input.dataset.bound = '1';
      input.addEventListener('change', () => {
        if (!input.checked) return;
        setTheme(input.value);
      });
    });
  }

  SC.getStoredTheme = getStoredTheme;
  SC.setTheme = setTheme;
  SC.syncThemeControls = syncThemeControls;
  SC.initTheme = initTheme;
})(window.SmartCareApp = window.SmartCareApp || {});

/* Apply immediately when this file loads (before paint when deferred after inline FOUC). */
try {
  var _scTheme = localStorage.getItem('sc-theme');
  document.documentElement.dataset.theme = _scTheme === 'dark' ? 'dark' : 'light';
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
