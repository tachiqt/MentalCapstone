/**
 * SmartCare API client — vanilla fetch with Bearer token.
 * Base URL: localStorage SMARTCARE_API override, else same-origin /api/v1.
 */
(function (global) {
  const TOKEN_KEY = 'smartcare_token';
  const API_OVERRIDE_KEY = 'SMARTCARE_API';

  function getBaseUrl() {
    const override = localStorage.getItem(API_OVERRIDE_KEY);
    if (override) {
      return override.replace(/\/$/, '');
    }
    return `${location.origin}/api/v1`;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  async function request(path, options = {}) {
    const url = `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = {
      Accept: 'application/json',
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    };

    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      body:
        options.body && typeof options.body === 'object' && !(options.body instanceof FormData)
          ? JSON.stringify(options.body)
          : options.body,
    });

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else if (response.status !== 204) {
      data = await response.text();
    }

    if (!response.ok) {
      const message =
        (data && data.message) ||
        (typeof data === 'string' ? data : null) ||
        `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  const api = {
    getBaseUrl,
    getToken,
    setToken,
    get: (path) => request(path, { method: 'GET' }),
    post: (path, body) => request(path, { method: 'POST', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    delete: (path, body) => request(path, { method: 'DELETE', body }),
  };

  global.SmartCareAPI = api;
})(window);
