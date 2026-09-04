export type Station = {
  id: string;
  name: string;
  nameTH?: string;
  lat: number;
  lng: number;
  lines?: string[];
  waiting?: number;
  status?: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type Bus = {
  id?: string;
  busId?: string;
  name?: string;
  line?: string;
  status?: string;
  lat?: number;
  lng?: number;
};

export type LoginResponse = {
  token: string;
  role: string;
  userId: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5101';
const TOKEN_KEY = 'mfu_user_token';
const ROLE_KEY = 'mfu_user_role';
const USER_ID_KEY = 'mfu_user_id';

type RequestOptions = RequestInit & {
  auth?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = localStorage.getItem(TOKEN_KEY);

  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.auth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const contentType = response.headers.get('content-type');
  const data = contentType?.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data
      ? String(data.error)
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  baseUrl: API_BASE_URL,

  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(USER_ID_KEY);
  },

  async login(username: string, password: string) {
    const result = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(ROLE_KEY, result.role);
    localStorage.setItem(USER_ID_KEY, result.userId);
    return result;
  },

  register(username: string, email: string, password: string) {
    return request<{ message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    });
  },

  getProfile() {
    return request<{ username: string; email: string }>('/auth/user', { auth: true });
  },

  updateProfile(username: string, email: string, password: string, newPassword = '') {
    return request<{ message: string }>('/auth/update', {
      method: 'PUT',
      auth: true,
      body: JSON.stringify({ username, email, password, new_password: newPassword }),
    });
  },

  getStations(line: 'line1' | 'line2') {
    return request<Station[]>(`/station/${line}`);
  },

  getBuses() {
    return request<Bus[]>('/api/buses');
  },

  sendReport(type: string, detail: string, location: string) {
    return request('/api/report', {
      method: 'POST',
      body: JSON.stringify({ type, detail, location }),
    });
  },
};
