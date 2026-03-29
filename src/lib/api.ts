import func2url from '../../backend/func2url.json';

const URLS = func2url as Record<string, string>;

function getToken(): string {
  return localStorage.getItem('session_token') || '';
}

function setToken(token: string) {
  localStorage.setItem('session_token', token);
}

function removeToken() {
  localStorage.removeItem('session_token');
}

async function request(fn: string, path: string, options: RequestInit = {}) {
  const base = URLS[fn];
  const url = base + (path === '/' ? '' : path);
  const token = getToken();

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Session-Id': token } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { status: res.status, data };
}

// Auth
export async function apiLogin(phone: string, password: string) {
  const { status, data } = await request('auth', '/', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });
  if (status === 200 && (data as { token: string }).token) {
    setToken((data as { token: string }).token);
  }
  return { status, data };
}

export async function apiLogout() {
  await request('auth', '/', { method: 'DELETE' });
  removeToken();
}

export async function apiGetMe() {
  return request('auth', '/', { method: 'GET' });
}

// Users
export async function apiGetUsers(role?: string) {
  const qs = role ? `?role=${role}` : '';
  return request('users', `/${qs}`);
}

export async function apiCreateUser(payload: {
  name: string; phone: string; password: string; role: string;
}) {
  return request('users', '/', { method: 'POST', body: JSON.stringify(payload) });
}

export async function apiUpdateUser(id: string, payload: { password?: string; active?: boolean }) {
  return request('users', `/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function apiDeleteUser(id: string) {
  return request('users', `/${id}`, { method: 'DELETE' });
}

// Upload
export async function apiUploadTxt(filename: string, content: string) {
  return request('upload', '/', {
    method: 'POST',
    body: JSON.stringify({ filename, content }),
  });
}

// Clients
export async function apiGetClients(params?: { user_id?: string; status?: string; include_excluded?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
  return request('clients', `/${qs}`);
}

export async function apiLockClient(id: string, user_id: string) {
  return request('clients', `/${id}/lock`, { method: 'POST', body: JSON.stringify({ user_id }) });
}

export async function apiUnlockClient(id: string, user_id: string) {
  return request('clients', `/${id}/unlock`, { method: 'POST', body: JSON.stringify({ user_id }) });
}

export async function apiUpdateClient(id: string, payload: {
  result?: string;
  result_note?: string;
  callback_date?: string;
}) {
  return request('clients', `/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export { getToken };