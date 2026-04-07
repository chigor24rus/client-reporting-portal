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

export async function apiImpersonate(userId: string, masterPassword: string) {
  const { status, data } = await request('auth', '/?action=impersonate', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, master_password: masterPassword }),
  });
  if (status === 200 && (data as { token: string }).token) {
    setToken((data as { token: string }).token);
  }
  return { status, data };
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

export async function apiUpdateUser(id: string, payload: { password?: string; active?: boolean; phone?: string }) {
  return request('users', `/?id=${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function apiDeleteUser(id: string) {
  return request('users', `/?id=${id}`, { method: 'DELETE' });
}

// Upload
export async function apiUploadTxt(filename: string, content: string) {
  return request('upload', '/', {
    method: 'POST',
    body: JSON.stringify({ filename, content }),
  });
}

// Clients
export async function apiGetClients(params?: { user_id?: string; status?: string; include_excluded?: string; include_all?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
  return request('clients', `/${qs}`);
}

export async function apiSearchClients(query: string) {
  return request('clients', `/?search=${encodeURIComponent(query)}`);
}

export async function apiGetMastersStats(month?: string) {
  const qs = month ? `&month=${month}` : '';
  return request('clients', `/?masters_stats=true${qs}`);
}

export async function apiGetPendingCount() {
  return request('clients', '/?pending_count=true');
}

export async function apiGetSummaryStats() {
  return request('clients', '/?summary_stats=true');
}

export async function apiGetDailyStats(month?: string) {
  return request('clients', `/?daily_stats=true${month ? `&month=${month}` : ''}`);
}

export async function apiGetResultsStats(month?: string) {
  return request('clients', `/?results_stats=true${month ? `&month=${month}` : ''}`);
}

export async function apiResetClient(id: string) {
  return request('clients', `/?id=${id}&action=reset`, { method: 'POST', body: JSON.stringify({}) });
}

export async function apiLockClient(id: string, user_id: string) {
  return request('clients', `/?id=${id}&action=lock`, { method: 'POST', body: JSON.stringify({ user_id }) });
}

export async function apiUnlockClient(id: string, user_id: string) {
  return request('clients', `/?id=${id}&action=unlock`, { method: 'POST', body: JSON.stringify({ user_id }) });
}

export async function apiUpdateClient(id: string, payload: {
  result?: string;
  result_note?: string;
  callback_date?: string;
  user_id?: string;
}) {
  return request('clients', `/?id=${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

// Calls report
export async function apiUploadCallsReport(userId: string, file: string) {
  return request('parse-calls', '/', {
    method: 'POST',
    body: JSON.stringify({ userId, file }),
  });
}

export async function apiGetCallsStats(month?: string) {
  const qs = month ? `?month=${month}` : '';
  return request('calls-stats', `/${qs}`);
}

export { getToken };