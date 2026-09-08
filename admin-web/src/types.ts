export type LoginResponse = {
  token: string;
  role: string;
  userId: string;
};

export type ShuttleRoute = {
  id: string;
  name: string;
  nameTH: string;
  color: string;
  enabled: boolean;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  revision?: number;
};

export type Station = {
  _id?: string;
  id: string;
  name: string;
  nameTH?: string;
  lat: number;
  lng: number;
  lines: string[];
  waiting?: number;
  status?: 'LOW' | 'MEDIUM' | 'HIGH';
  cameraUrl?: string;
  detectionRoi?: Array<[number, number]>;
};

export type CrowdThresholds = {
  medium: number;
  high: number;
};

export type Bus = {
  connectionStatus?: 'fresh' | 'stale' | 'unknown';
  freshness?: 'fresh' | 'stale' | 'unknown';
  feedHealthy?: boolean;
  source?: string;
  speedRaw?: number | null;
  speedUnit?: string;
  alarm?: string;
  receivedAt?: string | null;
  _id?: string;
  busId?: string;
  busNumber?: string;
  licensePlate?: string;
  line?: string | null;
  status?: string;
  currentStationIndex?: number;
  lat?: number | null;
  lng?: number | null;
  speedKph?: number | null;
  heading?: number;
  accuracy?: number;
  lastGpsAt?: string | null;
  updatedAt?: string;
  driverName?: string;
};

export type GpsStatus = {
  state: string;
  healthy: boolean;
  configured: boolean;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  invalidCount: number;
  unmappedCount: number;
  pollMs: number;
  staleAfterMs: number;
};

export type Report = {
  _id: string;
  userId?: string;
  UserId?: string;
  username?: string;
  user?: {
    _id?: string;
    username?: string;
    email?: string;
  };
  title?: string;
  description?: string;
  category?: string;
  type?: string;
  detail?: string;
  location?: string;
  status?: string;
  createdAt?: string;
  time?: string;
  feedbackRatings?: Array<{
    key?: string;
    label?: string;
    score?: number;
    description?: string;
  }>;
  feedbackAverage?: number;
};

export type User = {
  _id?: string;
  username: string;
  email?: string;
  role?: 'admin' | 'user';
};

export type AdminUserPayload = {
  username: string;
  email: string;
  password: string;
};

export type DetectorStatus = {
  stationId: string;
  running: boolean;
  startedAt?: string;
  exitedAt?: string;
  exitCode?: number | null;
  signal?: string | null;
  lastLog: string;
  lastError: string;
  hasFrame: boolean;
};
