import type { AdminUserPayload, Bus, DetectorStatus, LoginResponse, Report, Station, User } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
const TOKEN_KEY = 'mfu_admin_token';
const ROLE_KEY = 'mfu_admin_role';

type RequestOptions = RequestInit & {
  auth?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers);

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

async function requestBlob(path: string, options: RequestOptions = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers);

  if (options.auth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.blob();
}

export const api = {
  baseUrl: API_BASE_URL,

  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },

  get role() {
    return localStorage.getItem(ROLE_KEY);
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
  },

  async login(username: string, password: string) {
    const result = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(ROLE_KEY, result.role);
    return result;
  },

  getStations() {
    return request<Station[]>('/station/admin/all', { auth: true });
  },

  createStation(station: Station) {
    return request<{ message: string }>('/station/admin', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(station),
    });
  },

  updateStation(id: string, station: Station) {
    return request<{ message: string }>(`/station/admin/${id}`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify(station),
    });
  },

  deleteStation(id: string) {
    return request<{ message: string }>(`/station/admin/${id}`, {
      method: 'DELETE',
      auth: true,
    });
  },

  getBuses() {
    return request<Bus[]>('/api/buses');
  },

  getReports() {
    return request<Report[]>('/api/report');
  },

  updateReportStatus(id: string, status: string) {
    return request<Report>(`/api/report/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  },

  deleteReport(id: string) {
    return request<{ message: string }>(`/api/report/${id}`, {
      method: 'DELETE',
    });
  },

  getUsers() {
    return request<User[]>('/auth/admin/users', { auth: true });
  },

  createAdminUser(payload: AdminUserPayload) {
    return request<{ message: string }>('/auth/admin/users', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    });
  },

  updateUserRole(username: string, role: 'admin' | 'user') {
    return request<{ message: string }>(`/auth/admin/user/${encodeURIComponent(username)}/role`, {
      method: 'PUT',
      auth: true,
      body: JSON.stringify({ role }),
    });
  },

  deleteUser(username: string) {
    return request<{ message: string }>(`/auth/admin/user/${encodeURIComponent(username)}`, {
      method: 'DELETE',
      auth: true,
    });
  },

  getDetectorStatus(stationId: string) {
    return request<DetectorStatus>(`/api/detector/${encodeURIComponent(stationId)}/status`, {
      auth: true,
    });
  },

  startDetector(stationId: string) {
    return request<DetectorStatus>(`/api/detector/${encodeURIComponent(stationId)}/start`, {
      method: 'POST',
      auth: true,
    });
  },

  stopDetector(stationId: string) {
    return request<DetectorStatus>(`/api/detector/${encodeURIComponent(stationId)}/stop`, {
      method: 'POST',
      auth: true,
    });
  },

  getDetectorFrame(stationId: string) {
    return requestBlob(`/api/detector/${encodeURIComponent(stationId)}/frame`, {
      auth: true,
    });
  },

  getDetectorStreamUrl(stationId: string) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    return `${API_BASE_URL}/api/detector/${encodeURIComponent(stationId)}/stream?token=${encodeURIComponent(token)}`;
  },
};
