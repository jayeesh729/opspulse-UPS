// Single fetch client.
//
// Identity travels as a signed JWT in the Authorization header. The server decides
// what the token is allowed to see - the UI only decides what to render. A user who
// edits localStorage still gets a 403 from the API.

const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'opspulse.token';

export const session = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  save(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* private mode - session stays in memory */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing to clear */ }
  },
};

async function request(path, { method = 'GET', body, authenticated = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = session.token;
  if (authenticated && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Bad response from server (${res.status})`);
  }

  if (res.status === 401 && authenticated) {
    // Expired or tampered token: drop it and let the app fall back to the login screen.
    session.clear();
    window.dispatchEvent(new CustomEvent('opspulse:signed-out'));
  }

  if (!res.ok) {
    const detail =
      data.details?.map((d) => `${d.field}: ${d.message}`).join('; ') || data.detail || data.error;
    const err = new Error(detail || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password }, authenticated: false }),
  me: () => request('/auth/me'),
  meta: () => request('/meta'),
  overview: (site, scenario, days = 30) => request(`/overview?site=${site}&scenario=${scenario}&days=${days}`),
  forecast: (site, fn, horizon) => request(`/forecast?site=${site}&function=${fn}&horizon=${horizon}`),
  explain: (site, scenario) => request('/explain', { method: 'POST', body: { site, scenario } }),
  resetDemo: () => request('/admin/reset-demo', { method: 'POST' }),
};
