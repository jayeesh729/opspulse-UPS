// Single fetch client. The active role travels as a header on every request and the
// API enforces permissions server-side - the UI switcher only changes who we claim
// to be, never what we are allowed to do.

const BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, { role = 'manager', method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Role': role },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Bad response from server (${res.status})`);
  }

  if (!res.ok) {
    const detail = data.details?.map((d) => `${d.field}: ${d.message}`).join('; ') || data.detail || data.error;
    const err = new Error(detail || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  meta: (role) => request('/meta', { role }),
  overview: (site, scenario, role, days = 30) =>
    request(`/overview?site=${site}&scenario=${scenario}&days=${days}`, { role }),
  forecast: (site, fn, horizon, role) =>
    request(`/forecast?site=${site}&function=${fn}&horizon=${horizon}`, { role }),
  explain: (site, scenario, role) => request('/explain', { role, method: 'POST', body: { site, scenario } }),
  resetDemo: (role) => request('/admin/reset-demo', { role, method: 'POST' }),
};
