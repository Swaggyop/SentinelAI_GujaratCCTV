import axios from 'axios';

/**
 * Axios instance — all API calls go through here.
 *
 * Auth strategy (per security-architecture.md):
 * - Access token stored in module-level memory (not localStorage — XSS risk)
 * - Refresh token similarly in memory; caller (AuthContext) re-injects after page load
 * - Request interceptor attaches Bearer token header
 * - Response interceptor catches 401 → attempts silent refresh → retries
 * - If refresh fails → clears tokens → emits 'sentinel:logout' event for AuthContext to catch
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
});

// In-memory token store — not exposed to window
let _accessToken  = null;
let _refreshToken = null;
let _refreshing   = null; // ongoing refresh promise to coalesce parallel 401s

export const tokenStore = {
  set(access, refresh) {
    _accessToken  = access;
    _refreshToken = refresh;
  },
  clear() {
    _accessToken  = null;
    _refreshToken = null;
  },
  get access()  { return _accessToken; },
  get refresh() { return _refreshToken; },
};

// ── Request interceptor: attach access token ──────────────
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// ── Response interceptor: silent token refresh on 401 ─────
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }

    original._retry = true;

    // Coalesce concurrent 401s to a single refresh call
    if (!_refreshing) {
      _refreshing = axios
        .post(`${BASE_URL}/auth/refresh`, { refreshToken: _refreshToken })
        .then((res) => {
          tokenStore.set(res.data.accessToken, res.data.refreshToken || _refreshToken);
          _refreshing = null;
        })
        .catch(() => {
          tokenStore.clear();
          _refreshing = null;
          window.dispatchEvent(new Event('sentinel:logout'));
        });
    }

    try {
      await _refreshing;
      // Retry with new token
      original.headers.Authorization = `Bearer ${_accessToken}`;
      return api(original);
    } catch {
      return Promise.reject(err);
    }
  }
);

// ── Typed API helpers ─────────────────────────────────────

export const authApi = {
  login:   (email, password) => api.post('/auth/login', { email, password }),
  refresh: (refreshToken)    => api.post('/auth/refresh', { refreshToken }),
};

export const camerasApi = {
  list:     (params = {}) => api.get('/cameras', { params }),
  get:      (id)          => api.get(`/cameras/${id}`),
  onboard:  (body)        => api.post('/cameras', body),
  update:   (id, body)    => api.patch(`/cameras/${id}`, body),
};

export const alertsApi = {
  list:   (params = {}) => api.get('/alerts', { params }),
  get:    (id)          => api.get(`/alerts/${id}`),
  review: (id)          => api.patch(`/alerts/${id}/review`),
};

export const watchlistApi = {
  list:       ()           => api.get('/watchlist'),
  add:        (body)       => api.post('/watchlist', body),
  deactivate: (id)         => api.patch(`/watchlist/${id}/deactivate`),
};

export const auditApi = {
  list: (params = {}) => api.get('/audit-log', { params }),
};

export default api;
