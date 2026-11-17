const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export function setToken(token) {
  if (token) localStorage.setItem('cu_token', token);
  else localStorage.removeItem('cu_token');
}
async function request(path, options = {}) {
  const token = localStorage.getItem('cu_token');
  const response = await fetch(API_BASE + '/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
export const api = {
  signup: (body) => request('/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  signin: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/me'),
  createGame: (body) => request('/games', { method: 'POST', body: JSON.stringify(body) }),
  joinGame: (code) => request('/games/join', { method: 'POST', body: JSON.stringify({ code }) }),
  getGame: (id) => request('/games/' + id),
  move: (id, body) => request('/games/' + id + '/moves', { method: 'POST', body: JSON.stringify(body) })
};
