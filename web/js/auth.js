/**
 * SmartCare authentication helpers.
 */
(function (global) {
  const USER_KEY = 'smartcare_user';
  const WEB_ROLES = ['head_doctor', 'psychometrician'];
  const MOBILE_DENIED_MESSAGE =
    'This account is for the SmartCare mobile app. Teachers, caretakers, and parents cannot sign in on the web.';

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setStoredUser(user) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }

  function isAuthenticated() {
    return Boolean(global.SmartCareAPI.getToken());
  }

  function roleValue(user) {
    if (!user || user.role == null) return '';
    if (typeof user.role === 'string') return user.role.trim().toLowerCase();
    if (typeof user.role === 'object') {
      if (user.role.value) return String(user.role.value).trim().toLowerCase();
      if (user.role.name) {
        return String(user.role.name)
          .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
          .trim()
          .toLowerCase();
      }
    }
    return String(user.role).trim().toLowerCase();
  }

  function hasRole(user, ...roles) {
    return roles.includes(roleValue(user));
  }

  function canAccessWeb(user) {
    return hasRole(user, ...WEB_ROLES);
  }

  function clearSession() {
    global.SmartCareAPI.setToken(null);
    setStoredUser(null);
  }

  function denyWebAccess(redirectTo) {
    clearSession();
    const base = redirectTo || 'login.html';
    const sep = base.includes('?') ? '&' : '?';
    window.location.href = `${base}${sep}denied=mobile`;
  }

  function requireAuth(redirectTo) {
    if (!isAuthenticated()) {
      window.location.href = redirectTo || 'login.html';
      return false;
    }
    const user = getStoredUser();
    if (user && !canAccessWeb(user)) {
      denyWebAccess(redirectTo || 'login.html');
      return false;
    }
    return true;
  }

  function homePageForUser(user) {
    return roleValue(user) === 'psychometrician' ? 'assessments.html' : 'dashboard.html';
  }

  function redirectIfAuthenticated(target) {
    if (!isAuthenticated()) return false;
    const user = getStoredUser();
    if (user && !canAccessWeb(user)) {
      clearSession();
      return false;
    }
    window.location.href = target || homePageForUser(user);
    return true;
  }

  async function login(username, password) {
    const result = await global.SmartCareAPI.post('/login', {
      username,
      password,
      client: 'web',
    });
    if (!canAccessWeb(result.user)) {
      clearSession();
      const error = new Error(MOBILE_DENIED_MESSAGE);
      error.status = 403;
      throw error;
    }
    global.SmartCareAPI.setToken(result.token);
    setStoredUser(result.user);
    return result.user;
  }

  async function googleLogin(idToken) {
    const result = await global.SmartCareAPI.post('/auth/google', {
      id_token: idToken,
      client: 'web',
    });
    if (!canAccessWeb(result.user)) {
      clearSession();
      const error = new Error(MOBILE_DENIED_MESSAGE);
      error.status = 403;
      throw error;
    }
    global.SmartCareAPI.setToken(result.token);
    setStoredUser(result.user);
    return result.user;
  }

  async function logout() {
    try {
      if (isAuthenticated()) {
        await global.SmartCareAPI.post('/logout');
      }
    } catch {
      /* clear local session even if server call fails */
    } finally {
      clearSession();
      window.location.href = 'login.html';
    }
  }

  async function fetchMe() {
    const user = await global.SmartCareAPI.get('/me');
    if (!canAccessWeb(user)) {
      denyWebAccess('login.html');
      throw new Error(MOBILE_DENIED_MESSAGE);
    }
    setStoredUser(user);
    return user;
  }

  function formatRole(role) {
    if (!role) return 'User';
    return String(role)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const auth = {
    WEB_ROLES,
    MOBILE_DENIED_MESSAGE,
    login,
    googleLogin,
    logout,
    fetchMe,
    getStoredUser,
    setStoredUser,
    isAuthenticated,
    requireAuth,
    redirectIfAuthenticated,
    formatRole,
    hasRole,
    canAccessWeb,
    roleValue,
    homePageForUser,
    clearSession,
  };

  global.SmartCareAuth = auth;
})(window);
