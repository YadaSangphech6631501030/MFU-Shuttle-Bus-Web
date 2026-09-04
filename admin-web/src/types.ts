export type LoginResponse = {
  token: string;
  role: string;
  userId: string;
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
  _id?: string;
  busId?: string;
  busNumber?: string;
  licensePlate?: string;
  line?: string;
  status?: string;
  currentStationIndex?: number;
  lat?: number;
  lng?: number;
  speedKph?: number;
  heading?: number;
  accuracy?: number;
  lastGpsAt?: string;
  updatedAt?: string;
  driverName?: string;
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
