let token = localStorage.getItem('token');
let onAuthError = () => {};

export const setToken = (t) => {
  token = t;
  t ? localStorage.setItem('token', t) : localStorage.removeItem('token');
};
export const hasToken = () => !!token;
export const setAuthErrorHandler = (fn) => { onAuthError = fn; };

async function call(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  // an expired/invalid token on a normal request sends the user back to the login screen
  if (r.status === 401 && token && !path.startsWith('/api/auth/login')) { setToken(null); onAuthError(); }
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}

export const api = {
  login: (username, password) => call('/api/auth/login', { method: 'POST', body: { username, password } }),
  register: (username, password) => call('/api/auth/register', { method: 'POST', body: { username, password } }),
  me: () => call('/api/auth/me'),
  list: () => call('/api/diagrams'),
  get: (id) => call(`/api/diagrams/${id}`),
  save: (id, body) => call(id ? `/api/diagrams/${id}` : '/api/diagrams', { method: id ? 'PUT' : 'POST', body }),
  remove: (id) => call(`/api/diagrams/${id}`, { method: 'DELETE' }),
};
