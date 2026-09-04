<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { api } from './services/api';
import BusesPage from './page/Buses.vue';
import DashboardPage from './page/Dashboard.vue';
import ReportsPage from './page/Reports.vue';
import StationCCTVPage from './page/StationCCTV.vue';
import StationsPage from './page/Stations.vue';
import UsersPage from './page/Users.vue';
import type { AdminUserPayload, Bus, CrowdThresholds, DetectorStatus, Report, Station, User } from './types';
import mfuLogoUrl from './assets/mfu_logo.png';

type Lang = 'en' | 'th';
type TabKey = 'dashboard' | 'stations' | 'cctv' | 'buses' | 'reports' | 'users';
type LatLng = { lat: number; lng: number };
type CameraPreviewKind = 'none' | 'rtsp' | 'image' | 'video' | 'link';
type DensityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type NavIcon = {
  paths?: string[];
  circles?: Array<{ cx: number; cy: number; r: number }>;
  rects?: Array<{ x: number; y: number; width: number; height: number; rx?: number }>;
};

type GoogleLatLngValue = {
  lat: () => number;
  lng: () => number;
};

type GoogleMapMouseEvent = {
  latLng?: GoogleLatLngValue;
};

type GoogleMapEventListener = {
  remove: () => void;
};

type GoogleMap = {
  addListener: (eventName: string, handler: (event: GoogleMapMouseEvent) => void) => GoogleMapEventListener;
  setCenter: (position: LatLng) => void;
  fitBounds: (bounds: GoogleLatLngBounds) => void;
};

type GoogleMarker = {
  addListener: (eventName: string, handler: () => void) => void;
  getPosition: () => GoogleLatLngValue | undefined;
  setMap: (map: GoogleMap | null) => void;
  setPosition: (position: LatLng) => void;
};

type GoogleInfoWindow = {
  close: () => void;
  open: (options: { anchor: GoogleMarker; map: GoogleMap }) => void;
  setContent: (content: HTMLElement | string) => void;
};

type GoogleLatLngBounds = {
  extend: (position: LatLng) => void;
};

type GoogleMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  InfoWindow: new (options?: Record<string, unknown>) => GoogleInfoWindow;
  LatLngBounds: new () => GoogleLatLngBounds;
  SymbolPath: {
    CIRCLE: number;
  };
};

declare global {
  interface Window {
    google?: {
      maps: GoogleMapsApi;
    };
    gm_authFailure?: () => void;
    initMfuStationMap?: () => void;
  }
}

const LANGUAGE_KEY = 'mfu_admin_language';
const USERNAME_KEY = 'mfu_admin_username';
const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const MFU_CENTER: LatLng = { lat: 20.0446, lng: 99.8957 };
const GOOGLE_MAPS_AUTH_ERROR = 'Google Maps API key is invalid or blocked. Check billing, Maps JavaScript API, and HTTP referrer settings in Google Cloud.';
const ADMIN_MAP_STYLES = [
  { featureType: 'all', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#eef4ea' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#e3ecd9' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#5f6f61' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#cfd8dc' }, { weight: 0.7 }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#52616b' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#b9d7e8' }] },
] as const;
const ADMIN_MAP_OPTIONS = {
  clickableIcons: false,
  fullscreenControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  styles: ADMIN_MAP_STYLES,
};
let googleMapsPromise: Promise<void> | null = null;

const DEFAULT_CROWD_THRESHOLDS: CrowdThresholds = {
  medium: 6,
  high: 10,
};

const lang = ref<Lang>(savedLanguage === 'th' ? 'th' : 'en');
const tabs: Array<{ key: TabKey }> = [
  { key: 'dashboard' },
  { key: 'stations' },
  { key: 'cctv' },
  { key: 'buses' },
  { key: 'reports' },
  { key: 'users' },
];
const tabIcons: Record<TabKey, NavIcon> = {
  dashboard: {
    rects: [
      { x: 3, y: 3, width: 7, height: 7, rx: 1.5 },
      { x: 14, y: 3, width: 7, height: 7, rx: 1.5 },
      { x: 3, y: 14, width: 7, height: 7, rx: 1.5 },
      { x: 14, y: 14, width: 7, height: 7, rx: 1.5 },
    ],
  },
  stations: {
    paths: [
      'M12 22s7-5.02 7-12a7 7 0 1 0-14 0c0 6.98 7 12 7 12',
    ],
    circles: [{ cx: 12, cy: 10, r: 2.5 }],
  },
  cctv: {
    paths: [
      'M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14',
    ],
    rects: [{ x: 3, y: 6, width: 12, height: 12, rx: 2 }],
  },
  buses: {
    paths: [
      'M7 16h.01',
      'M17 16h.01',
      'M7 20v-2',
      'M17 20v-2',
      'M5 11h14',
      'M8 6h8',
      'M6 18h12a2 2 0 0 0 2-2V8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2',
    ],
  },
  reports: {
    paths: [
      'M9 12h6',
      'M9 16h6',
      'M9 8h2',
      'M9 3h6l1 2h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3l1-2Z',
    ],
  },
  users: {
    paths: [
      'M20 21a8 8 0 0 0-16 0',
      'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
    ],
  },
};
const sidebarTabs = computed(() => tabs.filter((tab) => tab.key !== 'users'));
const activeTab = ref<TabKey>('dashboard');

const dictionary = {
  en: {
    tabs: {
      dashboard: 'Dashboard',
      crowd: 'Shuttle Bus Monitor',
      stations: 'Station Setting',
      cctv: 'Station CCTV',
      buses: 'Buses',
      reports: 'Reports',
      users: 'Users',
    },
    language: 'EN',
    loginSubtitle: '',
    username: 'Username',
    password: 'Password',
    usernamePlaceholder: 'admin username',
    passwordPlaceholder: 'password',
    signIn: 'Sign in',
    signingIn: 'Signing in...',
    logout: 'Log out',
    profileInformation: 'Profile Information',
    signedInUser: 'Admin user',
    refresh: 'Refresh data',
    loading: 'Loading...',
    genericError: 'Something went wrong',
    adminOnlyError: 'This account is not an administrator.',
    sessionExpired: 'Your session expired. Please sign in again.',
    totalStations: 'Total stations',
    activeStops: 'Active pickup points',
    onlineBuses: 'Online buses',
    fromTotalBuses: 'from {count} buses',
    pendingReports: 'Pending reports',
    unresolvedItems: 'Items not resolved yet',
    usersCount: 'Users',
    systemAccounts: 'System accounts',
    stationList: 'Station list',
    stationName: 'Station name',
    stationNameTH: 'Thai station name',
    line: 'Line',
    coordinates: 'Coordinates',
    status: 'Status',
    edit: 'Edit',
    delete: 'Delete',
    editStation: 'Edit station',
    addStation: 'Add station',
    cancel: 'Cancel',
    stationIdPlaceholder: 'Example: S01',
    stationNamePlaceholder: 'Pickup point name',
    stationNameTHPlaceholder: 'Thai pickup point name',
    mapPicker: 'Map location picker',
    mapHint: 'Click the map or drag the marker to update latitude and longitude.',
    mapMissingKey: 'Add VITE_GOOGLE_MAPS_API_KEY in admin-web/.env to enable Google Map picker.',
    mapAuthFailed: GOOGLE_MAPS_AUTH_ERROR,
    mapLoadFailed: 'Google Map could not be loaded.',
    mapLoading: 'Loading map...',
    useCurrentLocation: 'Use current location',
    locateFailed: 'Could not get your current location.',
    saveChanges: 'Save changes',
    addStationConfirm: 'Add station "{name}"?',
    editStationConfirm: 'Save changes to station "{name}"?',
    allBuses: 'All buses',
    unknownBus: 'Unknown bus',
    noDriver: 'No driver name',
    noLine: 'No line',
    issueReports: 'Issue reports',
    issueReportsHint: 'Review passenger issue reports and update their status.',
    issueReport: 'Issue report',
    anonymous: 'anonymous',
    guestUser: 'Guest user',
    guestUserInitial: 'G',
    guestReportMeta: 'Public report, no user account attached',
    reportedBy: 'Reported by',
    reportTitleLabel: 'Title',
    reportDetailLabel: 'Detail',
    activeReports: 'Active reports',
    feedbackReports: 'Feedback',
    historyReports: 'History report',
    reportViewLabel: 'Report view',
    reportSearch: 'Search',
    reportSearchPlaceholder: 'Search title, detail, location...',
    reportCategoryFilter: 'Category',
    reportStatusFilter: 'Status',
    reportDateRange: 'Date range',
    reportDateFrom: 'From date',
    reportDateTo: 'To date',
    reportDateFromShort: 'From',
    reportDateToShort: 'to',
    to: 'to',
    reportActions: 'Actions',
    deleteReport: 'Delete report',
    deleteReportConfirm: 'Delete report "{name}"?',
    feedbackAverage: 'Average',
    allCategories: 'All categories',
    allStatuses: 'All statuses',
    noFilteredReports: 'No reports match filters',
    noFilteredReportsHint: 'Adjust search, category, or status filters.',
    reportUserId: 'User ID',
    reportUserUnknown: 'No user information',
    submittedAt: 'Submitted',
    reportLocation: 'Location',
    reportStatus: 'Report status',
    noReportDetail: 'No report detail',
    noReportLocation: 'No location provided',
    unknownTime: 'No time recorded',
    noReports: 'No issue reports',
    noReportsHint: 'New passenger reports will appear here.',
    systemUsers: 'System users',
    changeRole: 'Change role',
    deleteStationConfirm: 'Delete station "{name}"?',
    deleteUserConfirm: 'Delete user "{name}"?',
    adminDashboard: 'Admin Dashboard',
    crowdStatus: 'Crowd status',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    waitingNow: 'Waiting now',
    passengersAcrossStations: 'passengers across all stations',
    liveStationMap: 'Live station map',
    markerColorHint: 'Marker color follows station crowd level.',
    dispatchGuide: 'Dispatch guide',
    highAdvice: 'Consider dispatching an extra shuttle.',
    mediumAdvice: 'Keep watching this station.',
    lowAdvice: 'Passenger flow is normal.',
    crowdAlerts: 'Crowd alerts',
    notifications: 'Notifications',
    stationsNeedAttention: '{count} stations need attention',
    passengersWaitingAt: '{level} · {count} passengers waiting at {line}',
    noNotifications: 'No notifications',
    busesDescription: 'Monitor shuttle availability by online and offline status.',
    online: 'Online',
    offline: 'Offline',
    offlineBuses: 'Offline buses',
    total: 'Total',
    totalBus: 'Total bus',
    busesUnit: 'buses',
    busPrefix: 'Bus',
    reportsUnit: 'reports',
    pendingStatus: 'pending',
    inProgressStatus: 'in progress',
    resolvedStatus: 'resolved',
    usernameLabel: 'Username',
    emailLabel: 'Email',
    roleLabel: 'Role',
    userRole: 'user',
    adminRole: 'admin',
    stationsUnit: 'stations',
    camera: 'Camera',
    connect: 'Connect',
    noConnect: 'No Connect',
    latitude: 'Latitude',
    longitude: 'Longitude',
    line1: 'Line 1',
    line2: 'Line 2',
    cameraUrl: 'Camera URL',
    detectionRoi: 'Detection ROI',
    camerasUnit: 'cameras',
    ready: 'Ready',
    noCamera: 'No camera',
    configured: 'Configured',
    stationCamera: 'Station camera',
    yoloStarting: 'Detection is starting',
    rtspCameraSaved: 'RTSP camera saved',
    noCameraSource: 'No camera source',
    previewUnavailable: 'Preview unavailable',
    waitingFirstFrame: 'Waiting for the first detected frame...',
    startRtspHint: 'Press Start Detection to read RTSP on the backend and show detected frames here.',
    editCameraFirst: 'Edit this station and save a Camera URL first.',
    browserPreviewUnavailable: 'This link is saved, but it is not a browser-playable stream.',
    cameraSource: 'Camera source',
    drawDetectionArea: 'Draw Detection Area',
    saveArea: 'Save Area',
    clear: 'Clear',
    fullFrame: 'Full frame',
    startDetection: 'Start Detection',
    stopDetection: 'Stop Detection',
    starting: 'Starting...',
    stopping: 'Stopping...',
    detectorRunning: 'Detector running',
    detectorStopped: 'Detector stopped',
    detectionRoiInvalid: 'Detection ROI must be JSON like [[0.1,0.2],[0.9,0.2],[0.9,0.8],[0.1,0.8]]',
  },
  th: {
    tabs: {
      dashboard: 'ภาพรวม',
      crowd: 'Shuttle Bus Monitor',
      stations: 'Station Setting',
      cctv: 'Station CCTV',
      buses: 'รถทั้งหมด',
      reports: 'รายงาน',
      users: 'ผู้ใช้',
    },
    language: 'TH',
    loginSubtitle: '',
    username: 'ชื่อผู้ใช้',
    password: 'รหัสผ่าน',
    usernamePlaceholder: 'ชื่อผู้ใช้แอดมิน',
    passwordPlaceholder: 'รหัสผ่าน',
    signIn: 'เข้าสู่ระบบ',
    signingIn: 'กำลังเข้าสู่ระบบ...',
    logout: 'ออกจากระบบ',
    profileInformation: 'ข้อมูลโปรไฟล์',
    signedInUser: 'ผู้ดูแลระบบ',
    refresh: 'รีเฟรชข้อมูล',
    loading: 'กำลังโหลด...',
    genericError: 'เกิดข้อผิดพลาด',
    adminOnlyError: 'บัญชีนี้ไม่ใช่ผู้ดูแลระบบ',
    sessionExpired: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
    totalStations: 'สถานีทั้งหมด',
    activeStops: 'จุดจอดที่เปิดให้บริการ',
    onlineBuses: 'รถออนไลน์',
    fromTotalBuses: 'จากทั้งหมด {count} คัน',
    pendingReports: 'รายงานรอดำเนินการ',
    unresolvedItems: 'รายการที่ยังไม่ปิดงาน',
    usersCount: 'ผู้ใช้',
    systemAccounts: 'บัญชีในระบบ',
    stationList: 'รายการสถานี',
    stationName: 'ชื่อสถานี',
    stationNameTH: 'ชื่อสถานีภาษาไทย',
    line: 'สาย',
    coordinates: 'พิกัด',
    status: 'สถานะ',
    edit: 'แก้ไข',
    delete: 'ลบ',
    editStation: 'แก้ไขสถานี',
    addStation: 'เพิ่มสถานี',
    cancel: 'ยกเลิก',
    stationIdPlaceholder: 'เช่น S01',
    stationNamePlaceholder: 'ชื่อจุดจอด',
    stationNameTHPlaceholder: 'ชื่อจุดจอดภาษาไทย',
    mapPicker: 'เลือกตำแหน่งจากแผนที่',
    mapHint: 'คลิกบนแผนที่หรือลากหมุดเพื่ออัปเดต latitude และ longitude',
    mapMissingKey: 'เพิ่ม VITE_GOOGLE_MAPS_API_KEY ใน admin-web/.env เพื่อเปิดใช้ Google Map',
    mapAuthFailed: 'Google Maps API key ใช้งานไม่ได้หรือถูกบล็อก กรุณาตรวจสอบ Billing, Maps JavaScript API และ HTTP referrer ใน Google Cloud',
    mapLoadFailed: 'โหลด Google Map ไม่สำเร็จ',
    mapLoading: 'กำลังโหลดแผนที่...',
    useCurrentLocation: 'ใช้ตำแหน่งปัจจุบัน',
    locateFailed: 'ไม่สามารถอ่านตำแหน่งปัจจุบันได้',
    saveChanges: 'บันทึกการแก้ไข',
    addStationConfirm: 'เพิ่มสถานี "{name}" ใช่ไหม?',
    editStationConfirm: 'บันทึกการแก้ไขสถานี "{name}" ใช่ไหม?',
    allBuses: 'รถทั้งหมด',
    unknownBus: 'ไม่ระบุรถ',
    noDriver: 'ไม่มีชื่อคนขับ',
    noLine: 'ไม่ระบุสาย',
    issueReports: 'รายงานปัญหา',
    issueReportsHint: 'ตรวจสอบรายงานจากผู้โดยสารและอัปเดตสถานะ',
    issueReport: 'รายงานปัญหา',
    anonymous: 'ไม่ระบุชื่อ',
    guestUser: 'ผู้ใช้ทั่วไป',
    guestUserInitial: 'G',
    guestReportMeta: 'รายงานแบบ Guest ไม่ผูกกับบัญชีผู้ใช้',
    reportedBy: 'ผู้แจ้ง',
    reportTitleLabel: 'หัวข้อ',
    reportDetailLabel: 'รายละเอียด',
    activeReports: 'รายงานที่ต้องดำเนินการ',
    feedbackReports: 'ติชม',
    historyReports: 'ประวัติรายงาน',
    reportViewLabel: 'มุมมองรายงาน',
    reportSearch: 'ค้นหา',
    reportSearchPlaceholder: 'ค้นหาหัวข้อ รายละเอียด ตำแหน่ง...',
    reportCategoryFilter: 'หมวดหมู่',
    reportStatusFilter: 'สถานะ',
    reportDateRange: 'ช่วงวันที่',
    reportDateFrom: 'จากวันที่',
    reportDateTo: 'ถึงวันที่',
    reportDateFromShort: 'จาก',
    reportDateToShort: 'ถึง',
    to: 'ถึง',
    reportActions: 'จัดการ',
    deleteReport: 'ลบรายงาน',
    deleteReportConfirm: 'ลบรายงาน "{name}" ใช่ไหม?',
    feedbackAverage: 'เฉลี่ย',
    allCategories: 'ทุกหมวดหมู่',
    allStatuses: 'ทุกสถานะ',
    noFilteredReports: 'ไม่พบรายงานตามตัวกรอง',
    noFilteredReportsHint: 'ลองปรับคำค้นหา หมวดหมู่ หรือสถานะ',
    reportUserId: 'รหัสผู้ใช้',
    reportUserUnknown: 'ไม่มีข้อมูลผู้ใช้',
    submittedAt: 'เวลาที่ส่ง',
    reportLocation: 'ตำแหน่ง',
    reportStatus: 'สถานะรายงาน',
    noReportDetail: 'ไม่มีรายละเอียดรายงาน',
    noReportLocation: 'ไม่ระบุตำแหน่ง',
    unknownTime: 'ไม่มีเวลาบันทึก',
    noReports: 'ยังไม่มีรายงานปัญหา',
    noReportsHint: 'รายงานใหม่จากผู้โดยสารจะแสดงที่นี่',
    systemUsers: 'ผู้ใช้ในระบบ',
    changeRole: 'เปลี่ยนสิทธิ์',
    deleteStationConfirm: 'ลบสถานี "{name}" ใช่ไหม?',
    deleteUserConfirm: 'ลบผู้ใช้ "{name}" ใช่ไหม?',
    adminDashboard: 'แดชบอร์ดผู้ดูแล',
    crowdStatus: 'สถานะความหนาแน่น',
    high: 'สูง',
    medium: 'ปานกลาง',
    low: 'ต่ำ',
    waitingNow: 'ผู้โดยสารรออยู่',
    passengersAcrossStations: 'ผู้โดยสารที่รออยู่ทุกสถานี',
    liveStationMap: 'แผนที่สถานีแบบสด',
    markerColorHint: 'สีหมุดแสดงระดับความหนาแน่นของสถานี',
    dispatchGuide: 'คำแนะนำการจัดรถ',
    highAdvice: 'ควรพิจารณาเพิ่มรถรับส่ง',
    mediumAdvice: 'ควรติดตามสถานีนี้ต่อ',
    lowAdvice: 'การไหลของผู้โดยสารอยู่ในระดับปกติ',
    crowdAlerts: 'แจ้งเตือนความหนาแน่น',
    notifications: 'การแจ้งเตือน',
    stationsNeedAttention: '{count} สถานีต้องตรวจสอบ',
    passengersWaitingAt: '{level} · ผู้โดยสาร {count} คนรออยู่ที่ {line}',
    noNotifications: 'ไม่มีการแจ้งเตือน',
    busesDescription: 'ตรวจสอบความพร้อมใช้งานของรถตามสถานะออนไลน์และออฟไลน์',
    online: 'ออนไลน์',
    offline: 'ออฟไลน์',
    offlineBuses: 'รถออฟไลน์',
    total: 'ทั้งหมด',
    totalBus: 'รถทั้งหมด',
    busesUnit: 'คัน',
    busPrefix: 'รถ',
    reportsUnit: 'รายการ',
    pendingStatus: 'รอดำเนินการ',
    inProgressStatus: 'กำลังดำเนินการ',
    resolvedStatus: 'แก้ไขแล้ว',
    usernameLabel: 'ชื่อผู้ใช้',
    emailLabel: 'อีเมล',
    roleLabel: 'สิทธิ์',
    userRole: 'ผู้ใช้',
    adminRole: 'ผู้ดูแล',
    stationsUnit: 'สถานี',
    camera: 'กล้อง',
    connect: 'เชื่อมต่อ',
    noConnect: 'ไม่เชื่อมต่อ',
    latitude: 'ละติจูด',
    longitude: 'ลองจิจูด',
    line1: 'สาย 1',
    line2: 'สาย 2',
    cameraUrl: 'URL กล้อง',
    detectionRoi: 'พื้นที่ตรวจจับ',
    camerasUnit: 'กล้อง',
    ready: 'พร้อม',
    noCamera: 'ไม่มีกล้อง',
    configured: 'ตั้งค่าแล้ว',
    stationCamera: 'กล้องสถานี',
    yoloStarting: 'กำลังเริ่มระบบตรวจจับ',
    rtspCameraSaved: 'บันทึกกล้อง RTSP แล้ว',
    noCameraSource: 'ไม่มีแหล่งสัญญาณกล้อง',
    previewUnavailable: 'ไม่สามารถแสดงตัวอย่างได้',
    waitingFirstFrame: 'กำลังรอภาพตรวจจับแรก...',
    startRtspHint: 'กด Start Detection เพื่ออ่าน RTSP ที่ backend และแสดงภาพตรวจจับที่นี่',
    editCameraFirst: 'แก้ไขสถานีและบันทึก Camera URL ก่อน',
    browserPreviewUnavailable: 'ลิงก์นี้ถูกบันทึกแล้ว แต่เบราว์เซอร์ไม่สามารถเปิดเป็นสตรีมได้',
    cameraSource: 'แหล่งสัญญาณกล้อง',
    drawDetectionArea: 'วาดพื้นที่ตรวจจับ',
    saveArea: 'บันทึกพื้นที่',
    clear: 'ล้าง',
    fullFrame: 'เต็มภาพ',
    startDetection: 'เริ่มตรวจจับ',
    stopDetection: 'หยุดตรวจจับ',
    starting: 'กำลังเริ่ม...',
    stopping: 'กำลังหยุด...',
    detectorRunning: 'ระบบตรวจจับกำลังทำงาน',
    detectorStopped: 'ระบบตรวจจับหยุดแล้ว',
    detectionRoiInvalid: 'พื้นที่ตรวจจับต้องเป็น JSON เช่น [[0.1,0.2],[0.9,0.2],[0.9,0.8],[0.1,0.8]]',
  },
} as const;

const text = computed(() => dictionary[lang.value]);

const loading = ref(false);
const error = ref('');
const isLoggedIn = ref(Boolean(api.token));
const isSidebarCollapsed = ref(false);
const crowdThresholds = ref<CrowdThresholds>(DEFAULT_CROWD_THRESHOLDS);
const isAlertMenuOpen = ref(false);
const dismissedCrowdAlertKeys = ref<Set<string>>(new Set());
const isUserMenuOpen = ref(false);
const currentUsername = ref(localStorage.getItem(USERNAME_KEY) || '');
const displayUsername = computed(() => currentUsername.value || text.value.signedInUser);
const userInitials = computed(() => displayUsername.value.trim().slice(0, 2).toUpperCase());

const loginForm = reactive({
  username: '',
  password: '',
});

const stations = ref<Station[]>([]);
const buses = ref<Bus[]>([]);
const reports = ref<Report[]>([]);
const users = ref<User[]>([]);

const emptyStation = (): Station => ({
  id: '',
  name: '',
  nameTH: '',
  lat: 0,
  lng: 0,
  lines: ['line1'],
  waiting: 0,
  status: 'LOW',
  cameraUrl: '',
  detectionRoi: [],
});

const stationForm = reactive<Station>(emptyStation());
const stationRoiText = ref('');
const editingStationKey = ref<string | null>(null);
const stationMapEl = ref<HTMLElement | null>(null);
const stationMap = ref<GoogleMap | null>(null);
const stationMarker = ref<GoogleMarker | null>(null);
const stationMapLoading = ref(false);
const stationMapError = ref('');
const crowdMapEl = ref<HTMLElement | null>(null);
const crowdMap = ref<GoogleMap | null>(null);
const crowdMarkers = ref<GoogleMarker[]>([]);
const crowdInfoWindow = ref<GoogleInfoWindow | null>(null);
const crowdMapLoading = ref(false);
const crowdMapError = ref('');
const selectedCrowdStationId = ref<string | null>(null);
const openRoleMenu = ref<string | null>(null);
const selectedCameraStationId = ref<string | null>(null);
const detectorStatus = ref<DetectorStatus | null>(null);
const detectorBusy = ref(false);
const roiDraft = ref<Array<[number, number]>>([]);
const isEditingRoi = ref(false);
const roiDragStart = ref<[number, number] | null>(null);
const detectorFrameUrl = ref('');
let detectorFrameTimer: number | undefined;
let detectorStatusTimer: number | undefined;
let crowdRefreshTimer: number | undefined;
let reportRefreshTimer: number | undefined;
let reportRefreshBusy = false;

function setStationMapElement(element: HTMLElement | null) {
  if (stationMapEl.value !== element) {
    stationMap.value = null;
    stationMarker.value = null;
  }
  stationMapEl.value = element;
  if (element) {
    void nextTick(initStationMap);
  }
}

function setCrowdMapElement(element: HTMLElement | null) {
  if (crowdMapEl.value !== element) {
    clearCrowdMarkers();
    crowdMap.value = null;
    crowdInfoWindow.value = null;
  }
  crowdMapEl.value = element;
  if (element) {
    void nextTick(initCrowdMap);
  }
}

function isFeedbackReport(report: Report) {
  const reportType = `${report.type || report.category || report.title || ''}`.trim().toLowerCase();
  return reportType === 'feedback' || reportType === 'ติชม' || reportType === 'ข้อเสนอแนะ' || reportType === 'ส่งข้อเสนอแนะ';
}

const onlineBuses = computed(() => buses.value.filter((bus) => bus.status?.toLowerCase() !== 'offline').length);
const pendingReports = computed(() => reports.value
  .filter((report) => !isFeedbackReport(report))
  .filter((report) => report.status !== 'resolved').length);
const activeCrowdAlertStations = computed(() => stations.value
  .map((station) => ({
    station,
    waiting: stationWaiting(station),
    level: stationDensityLevel(station),
  }))
  .filter((item) => item.level === 'HIGH' || item.level === 'MEDIUM')
  .sort((a, b) => {
    const severity = { HIGH: 2, MEDIUM: 1, LOW: 0 };
    return severity[b.level] - severity[a.level] || b.waiting - a.waiting;
  }));
const crowdAlertStations = computed(() => activeCrowdAlertStations.value
  .filter((item) => !dismissedCrowdAlertKeys.value.has(crowdAlertKey(item.station, item.level))));
const selectedCameraStation = computed(() => {
  if (stations.value.length === 0) return null;
  return stations.value.find((station) => station.id === selectedCameraStationId.value) ?? stations.value[0];
});
const selectedCameraUrl = computed(() => normalizeCameraUrl(selectedCameraStation.value?.cameraUrl));
const selectedCameraPreviewKind = computed(() => getCameraPreviewKind(selectedCameraUrl.value));

function fillTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

function stationWaiting(station: Station) {
  const waiting = Number(station.waiting ?? 0);
  return Number.isFinite(waiting) ? waiting : 0;
}

function stationDensityLevel(station: Station): DensityLevel {
  const waiting = stationWaiting(station);

  if (waiting >= crowdThresholds.value.high) return 'HIGH';
  if (waiting >= crowdThresholds.value.medium) return 'MEDIUM';
  return 'LOW';
}

function stationDensityLabel(station: Station) {
  const level = stationDensityLevel(station);
  if (level === 'HIGH') return text.value.high;
  if (level === 'MEDIUM') return text.value.medium;
  return text.value.low;
}

function crowdAlertKey(station: Station, level: DensityLevel) {
  return `${station._id || station.id}:${level}`;
}

function dismissCrowdAlert(station: Station, level: DensityLevel) {
  const nextDismissedKeys = new Set(dismissedCrowdAlertKeys.value);
  nextDismissedKeys.add(crowdAlertKey(station, level));
  dismissedCrowdAlertKeys.value = nextDismissedKeys;
}

function stationHasValidPosition(station: Station) {
  const lat = Number(station.lat);
  const lng = Number(station.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function stationPosition(station: Station): LatLng {
  return {
    lat: Number(station.lat),
    lng: Number(station.lng),
  };
}

function crowdMarkerColor(level: DensityLevel) {
  if (level === 'HIGH') return '#dc3545';
  if (level === 'MEDIUM') return '#c77f28';
  return '#2eb85c';
}

function clearCrowdMarkers() {
  crowdMarkers.value.forEach((marker) => marker.setMap(null));
  crowdMarkers.value = [];
}

function createCrowdInfoContent(station: Station) {
  const content = document.createElement('div');
  content.className = 'crowd-info-window';

  const title = document.createElement('strong');
  title.textContent = station.name || station.id;

  const waiting = document.createElement('p');
  waiting.textContent = fillTemplate(text.value.passengersWaitingAt, {
    level: stationDensityLabel(station),
    count: stationWaiting(station),
    line: station.lines.join(', ') || text.value.noLine,
  });

  const meta = document.createElement('small');
  meta.textContent = `${station.lines.join(', ') || text.value.noLine} - ${stationDensityLabel(station)}`;

  content.append(title, waiting, meta);
  return content;
}

function openCrowdStationInfo(station: Station, marker: GoogleMarker) {
  const map = crowdMap.value;
  const maps = window.google?.maps;
  if (!map || !maps) return;

  selectedCrowdStationId.value = station.id;
  if (!crowdInfoWindow.value) {
    crowdInfoWindow.value = new maps.InfoWindow();
  }

  crowdInfoWindow.value.setContent(createCrowdInfoContent(station));
  crowdInfoWindow.value.open({ anchor: marker, map });
}

function fitCrowdMapToStations() {
  const map = crowdMap.value;
  const maps = window.google?.maps;
  const visibleStations = stations.value.filter(stationHasValidPosition);
  if (!map || !maps || visibleStations.length === 0) return;

  if (visibleStations.length === 1) {
    map.setCenter(stationPosition(visibleStations[0]));
    return;
  }

  const bounds = new maps.LatLngBounds();
  visibleStations.forEach((station) => bounds.extend(stationPosition(station)));
  map.fitBounds(bounds);
}

function renderCrowdMarkers() {
  const map = crowdMap.value;
  const maps = window.google?.maps;
  if (!map || !maps) return;

  clearCrowdMarkers();

  crowdMarkers.value = stations.value
    .filter(stationHasValidPosition)
    .map((station) => {
      const level = stationDensityLevel(station);
      const waiting = stationWaiting(station);
      const marker = new maps.Marker({
        position: stationPosition(station),
        map,
        title: `${station.name} - ${waiting} passengers`,
        label: {
          text: String(waiting),
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: '800',
        },
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: level === 'HIGH' ? 18 : level === 'MEDIUM' ? 15 : 12,
          fillColor: crowdMarkerColor(level),
          fillOpacity: 0.94,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        zIndex: level === 'HIGH' ? 30 : level === 'MEDIUM' ? 20 : 10,
      });

      marker.addListener('click', () => {
        openCrowdStationInfo(station, marker);
      });

      return marker;
    });

  fitCrowdMapToStations();
}

async function initCrowdMap() {
  if (activeTab.value !== 'dashboard' || !crowdMapEl.value) return;

  if (crowdMap.value) {
    renderCrowdMarkers();
    return;
  }

  crowdMapLoading.value = true;
  crowdMapError.value = '';

  try {
    await loadGoogleMaps();

    const maps = window.google?.maps;
    if (!maps || !crowdMapEl.value) {
      throw new Error(text.value.mapLoadFailed);
    }

    crowdMap.value = new maps.Map(crowdMapEl.value, {
      ...ADMIN_MAP_OPTIONS,
      center: MFU_CENTER,
      zoom: 16,
    });

    renderCrowdMarkers();
  } catch (err) {
    crowdMapError.value = err instanceof Error ? err.message : text.value.mapLoadFailed;
  } finally {
    crowdMapLoading.value = false;
  }
}

function focusCrowdStation(station: Station) {
  selectedCrowdStationId.value = station.id;

  if (!crowdMap.value || !window.google?.maps) {
    void nextTick(initCrowdMap);
    return;
  }

  crowdMap.value.setCenter(stationPosition(station));
  const markerIndex = stations.value
    .filter(stationHasValidPosition)
    .findIndex((item) => item.id === station.id);
  const marker = markerIndex >= 0 ? crowdMarkers.value[markerIndex] : null;
  if (marker) {
    openCrowdStationInfo(station, marker);
  }
}

function openCrowdAlertStation(station: Station, level: DensityLevel) {
  dismissCrowdAlert(station, level);
  isAlertMenuOpen.value = false;
  activeTab.value = 'dashboard';
  void nextTick(() => focusCrowdStation(station));
}

function toggleLanguage() {
  lang.value = lang.value === 'en' ? 'th' : 'en';
  localStorage.setItem(LANGUAGE_KEY, lang.value);
}

function setActiveTab(tab: TabKey) {
  activeTab.value = tab;
  isAlertMenuOpen.value = false;
  isUserMenuOpen.value = false;
}

function toggleUserMenu() {
  isUserMenuOpen.value = !isUserMenuOpen.value;
  if (isUserMenuOpen.value) {
    isAlertMenuOpen.value = false;
  }
}

function toggleAlertMenu() {
  isAlertMenuOpen.value = !isAlertMenuOpen.value;
  if (isAlertMenuOpen.value) {
    isUserMenuOpen.value = false;
  }
}

function closeUserMenu() {
  isAlertMenuOpen.value = false;
  isUserMenuOpen.value = false;
}

function toggleSidebar() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
}

function isAuthTokenError(err: unknown) {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('invalid token') ||
    message.includes('jwt expired') ||
    message.includes('token expired') ||
    message.includes('request failed with status 401')
  );
}

function resetSession() {
  api.clearSession();
  localStorage.removeItem(USERNAME_KEY);
  currentUsername.value = '';
  isUserMenuOpen.value = false;
  isLoggedIn.value = false;
  loginForm.password = '';
}

function selectValue(event: Event) {
  return (event.target as HTMLSelectElement).value;
}

function normalizeCameraUrl(value?: string) {
  return String(value ?? '').trim();
}

function hasCamera(station?: Station | null) {
  return normalizeCameraUrl(station?.cameraUrl).length > 0;
}

function getCameraPreviewKind(url?: string): CameraPreviewKind {
  const normalizedUrl = normalizeCameraUrl(url);
  if (!normalizedUrl) return 'none';
  if (/^rtsp:\/\//i.test(normalizedUrl)) return 'rtsp';
  if (/(\.jpg|\.jpeg|\.png|\.gif|\.webp|\.mjpg|\.mjpeg)(\?|$)/i.test(normalizedUrl)) return 'image';
  if (/(\.mp4|\.webm|\.ogg|\.m3u8)(\?|$)/i.test(normalizedUrl)) return 'video';
  return 'link';
}

function selectCameraStation(station: Station) {
  selectedCameraStationId.value = station.id;
}

function syncSelectedCameraStation(nextStations: Station[]) {
  if (nextStations.length === 0) {
    selectedCameraStationId.value = null;
    return;
  }

  if (selectedCameraStationId.value && nextStations.some((station) => station.id === selectedCameraStationId.value)) {
    return;
  }

  const station08 = nextStations.find((station) => station.id.toLowerCase() === 'station08');
  selectedCameraStationId.value = (station08 ?? nextStations.find(hasCamera) ?? nextStations[0]).id;
}

async function copyCameraUrl() {
  if (!selectedCameraUrl.value) return;
  await navigator.clipboard.writeText(selectedCameraUrl.value);
}

function syncRoiDraftFromStation() {
  roiDraft.value = selectedCameraStation.value?.detectionRoi?.length
    ? selectedCameraStation.value.detectionRoi.map((point) => [point[0], point[1]])
    : [];
}

function revokeDetectorFrameUrl() {
  if (detectorFrameUrl.value) {
    URL.revokeObjectURL(detectorFrameUrl.value);
    detectorFrameUrl.value = '';
  }
}

async function loadDetectorStatus() {
  const station = selectedCameraStation.value;
  if (!station) return;

  try {
    detectorStatus.value = await api.getDetectorStatus(station.id);
  } catch {
    detectorStatus.value = null;
  }
}

async function refreshDetectorFrame() {
  const station = selectedCameraStation.value;
  if (!station || !detectorStatus.value?.running) {
    revokeDetectorFrameUrl();
    return;
  }

  try {
    const frame = await api.getDetectorFrame(station.id);
    const nextUrl = URL.createObjectURL(frame);
    revokeDetectorFrameUrl();
    detectorFrameUrl.value = nextUrl;
  } catch {
    revokeDetectorFrameUrl();
  }
}

async function startSelectedDetector() {
  const station = selectedCameraStation.value;
  if (!station) return;

  detectorBusy.value = true;
  try {
    detectorStatus.value = await api.startDetector(station.id);
    window.setTimeout(() => {
      void loadDetectorStatus();
      void refreshDetectorFrame();
    }, 2500);
  } finally {
    detectorBusy.value = false;
  }
}

async function stopSelectedDetector() {
  const station = selectedCameraStation.value;
  if (!station) return;

  detectorBusy.value = true;
  try {
    detectorStatus.value = await api.stopDetector(station.id);
    revokeDetectorFrameUrl();
  } finally {
    detectorBusy.value = false;
  }
}

function getPointerInRoi(event: PointerEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  return [Number(x.toFixed(4)), Number(y.toFixed(4))] as [number, number];
}

function makeRectangleRoi(start: [number, number], end: [number, number]) {
  const left = Math.min(start[0], end[0]);
  const right = Math.max(start[0], end[0]);
  const top = Math.min(start[1], end[1]);
  const bottom = Math.max(start[1], end[1]);

  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ].map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]) as Array<[number, number]>;
}

function startRoiEditor() {
  syncRoiDraftFromStation();
  if (roiDraft.value.length) {
    const xs = roiDraft.value.map((point) => point[0]);
    const ys = roiDraft.value.map((point) => point[1]);
    roiDraft.value = makeRectangleRoi(
      [Math.min(...xs), Math.min(...ys)],
      [Math.max(...xs), Math.max(...ys)],
    );
  }
  isEditingRoi.value = true;
}

function cancelRoiEditor() {
  isEditingRoi.value = false;
  roiDragStart.value = null;
  syncRoiDraftFromStation();
}

function setRoiPreset(preset: 'full' | 'right' | 'left' | 'bottom' | 'center') {
  const presets: Record<typeof preset, Array<[number, number]>> = {
    full: [[0, 0], [1, 0], [1, 1], [0, 1]],
    right: [[0.5, 0], [1, 0], [1, 1], [0.5, 1]],
    left: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]],
    bottom: [[0, 0.5], [1, 0.5], [1, 1], [0, 1]],
    center: [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]],
  };
  roiDraft.value = presets[preset];
}

function clearRoiDraft() {
  roiDraft.value = [];
  roiDragStart.value = null;
}

function handleRoiCanvasPointerDown(event: PointerEvent) {
  if (!isEditingRoi.value) return;
  const start = getPointerInRoi(event);
  roiDragStart.value = start;
  roiDraft.value = makeRectangleRoi(start, start);
}

function dragRoiPoint(event: PointerEvent) {
  const currentPoint = getPointerInRoi(event);

  if (roiDragStart.value) {
    roiDraft.value = makeRectangleRoi(roiDragStart.value, currentPoint);
  }
}

function stopDragRoiPoint() {
  roiDragStart.value = null;
}

async function saveSelectedRoi() {
  const station = selectedCameraStation.value;
  if (!station) return;

  const payload: Station = {
    ...station,
    detectionRoi: roiDraft.value.length === 4 ? roiDraft.value : [],
  };
  const shouldRestartDetector = Boolean(detectorStatus.value?.running);

  await withLoading(async () => {
    await api.updateStation(station.id, payload);
    if (shouldRestartDetector) {
      await api.stopDetector(station.id);
      detectorStatus.value = await api.startDetector(station.id);
      revokeDetectorFrameUrl();
      window.setTimeout(() => {
        void refreshDetectorFrame();
      }, 2500);
    }
    stations.value = await api.getStations();
    syncSelectedCameraStation(stations.value);
    isEditingRoi.value = false;
    roiDragStart.value = null;
  });
}

function resetStationForm() {
  Object.assign(stationForm, emptyStation());
  stationRoiText.value = '';
  editingStationKey.value = null;
  void nextTick(initStationMap);
}

function formatRoi(roi?: Array<[number, number]>) {
  return roi && roi.length ? JSON.stringify(roi) : '';
}

function parseRoiText() {
  const raw = stationRoiText.value.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw);
  const isValid = Array.isArray(parsed) && parsed.every((point) => (
    Array.isArray(point) &&
    point.length === 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1])) &&
    Number(point[0]) >= 0 &&
    Number(point[0]) <= 1 &&
    Number(point[1]) >= 0 &&
    Number(point[1]) <= 1
  ));

  if (!isValid) {
    throw new Error(text.value.detectionRoiInvalid);
  }

  return parsed.map((point) => [Number(point[0]), Number(point[1])]) as Array<[number, number]>;
}

function getStationPosition() {
  const lat = Number(stationForm.lat);
  const lng = Number(stationForm.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return { lat, lng };
  }

  return MFU_CENTER;
}

function setStationPosition(position: LatLng) {
  stationForm.lat = Number(position.lat.toFixed(6));
  stationForm.lng = Number(position.lng.toFixed(6));
  stationMarker.value?.setPosition(position);
  stationMap.value?.setCenter(position);
}

function syncMarkerFromForm() {
  if (!stationMarker.value || !stationMap.value) return;

  const position = getStationPosition();
  stationMarker.value.setPosition(position);
  stationMap.value.setCenter(position);
}

function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error(text.value.mapMissingKey));
      return;
    }

    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      googleMapsPromise = null;
      reject(new Error(message));
    };

    window.gm_authFailure = () => {
      fail(text.value.mapAuthFailed);
    };

    window.initMfuStationMap = () => {
      window.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve();
      }, 0);
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&callback=initMfuStationMap&loading=async`;
    script.async = true;
    script.defer = true;
    script.onerror = () => fail(text.value.mapLoadFailed);
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

async function initStationMap() {
  if (activeTab.value !== 'stations' || !stationMapEl.value) return;

  if (stationMap.value && stationMarker.value) {
    syncMarkerFromForm();
    return;
  }

  stationMapLoading.value = true;
  stationMapError.value = '';

  try {
    await loadGoogleMaps();

    const maps = window.google?.maps;
    if (!maps || !stationMapEl.value) {
      throw new Error(text.value.mapLoadFailed);
    }

    const position = getStationPosition();
    stationMap.value = new maps.Map(stationMapEl.value, {
      ...ADMIN_MAP_OPTIONS,
      center: position,
      zoom: 17,
    });

    stationMarker.value = new maps.Marker({
      position,
      map: stationMap.value,
      draggable: true,
      title: 'Station location',
    });

    stationMap.value.addListener('click', (event: GoogleMapMouseEvent) => {
      if (!event.latLng) return;
      setStationPosition({ lat: event.latLng.lat(), lng: event.latLng.lng() });
    });

    stationMarker.value.addListener('dragend', () => {
      const markerPosition = stationMarker.value?.getPosition();
      if (!markerPosition) return;
      setStationPosition({ lat: markerPosition.lat(), lng: markerPosition.lng() });
    });
  } catch (err) {
    stationMapError.value = err instanceof Error ? err.message : text.value.mapLoadFailed;
  } finally {
    stationMapLoading.value = false;
  }
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    stationMapError.value = text.value.locateFailed;
    return;
  }

  stationMapLoading.value = true;
  stationMapError.value = '';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setStationPosition({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      stationMapLoading.value = false;
    },
    () => {
      stationMapError.value = text.value.locateFailed;
      stationMapLoading.value = false;
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

async function withLoading(task: () => Promise<void>) {
  loading.value = true;
  error.value = '';
  try {
    await task();
  } catch (err) {
    if (isLoggedIn.value && isAuthTokenError(err)) {
      resetSession();
      error.value = text.value.sessionExpired;
      return;
    }
    error.value = err instanceof Error ? err.message : text.value.genericError;
  } finally {
    loading.value = false;
  }
}

async function loadData() {
  await withLoading(async () => {
    const [stationData, busData, reportData, userData] = await Promise.all([
      api.getStations(),
      api.getBuses(),
      api.getReports(),
      api.getUsers(),
    ]);

    stations.value = stationData;
    syncSelectedCameraStation(stationData);
    buses.value = busData;
    reports.value = reportData;
    users.value = userData;
  });
}

async function refreshReportsSilently() {
  if (!isLoggedIn.value || reportRefreshBusy) return;

  reportRefreshBusy = true;
  try {
    reports.value = await api.getReports();
  } catch (err) {
    if (isAuthTokenError(err)) {
      resetSession();
      error.value = text.value.sessionExpired;
    }
  } finally {
    reportRefreshBusy = false;
  }
}

async function login() {
  await withLoading(async () => {
    const username = loginForm.username.trim();
    const result = await api.login(username, loginForm.password);
    if (result.role !== 'admin') {
      api.clearSession();
      throw new Error(text.value.adminOnlyError);
    }
    currentUsername.value = username;
    localStorage.setItem(USERNAME_KEY, username);
    isLoggedIn.value = true;
    await loadData();
  });
}

function logout() {
  resetSession();
}

function editStation(station: Station) {
  Object.assign(stationForm, {
    ...station,
    lines: [...station.lines],
  });
  stationRoiText.value = formatRoi(station.detectionRoi);
  editingStationKey.value = station.id;
  selectCameraStation(station);
  void nextTick(initStationMap);
}

async function saveStation() {
  await withLoading(async () => {
    const payload: Station = {
      ...stationForm,
      id: stationForm.id.trim(),
      name: stationForm.name.trim(),
      nameTH: stationForm.nameTH?.trim() || '',
      lat: Number(stationForm.lat),
      lng: Number(stationForm.lng),
      waiting: 0,
      status: 'LOW',
      lines: stationForm.lines.length ? stationForm.lines : ['line1'],
      detectionRoi: parseRoiText(),
    };
    const confirmTemplate = editingStationKey.value ? text.value.editStationConfirm : text.value.addStationConfirm;
    const confirmMessage = fillTemplate(confirmTemplate, { name: payload.name || payload.id });
    if (!confirm(confirmMessage)) return;

    if (editingStationKey.value) {
      await api.updateStation(editingStationKey.value, payload);
    } else {
      await api.createStation(payload);
    }

    resetStationForm();
    stations.value = await api.getStations();
    syncSelectedCameraStation(stations.value);
  });
}

async function deleteStation(station: Station) {
  const stationKey = station.id;
  const message = fillTemplate(text.value.deleteStationConfirm, { name: station.name });
  if (!stationKey || !confirm(message)) return;

  await withLoading(async () => {
    await api.deleteStation(stationKey);
    stations.value = await api.getStations();
    syncSelectedCameraStation(stations.value);
  });
}

async function updateReportStatus(report: Report, status: string) {
  await withLoading(async () => {
    await api.updateReportStatus(report._id, status);
    reports.value = await api.getReports();
  });
}

async function deleteReport(report: Report) {
  const reportName = report.title || report.category || report.type || text.value.issueReport;
  const message = fillTemplate(text.value.deleteReportConfirm, { name: reportName });
  if (!confirm(message)) return;

  await withLoading(async () => {
    await api.deleteReport(report._id);
    reports.value = await api.getReports();
  });
}

async function createAdminUser(payload: AdminUserPayload) {
  await withLoading(async () => {
    await api.createAdminUser(payload);
    users.value = await api.getUsers();
  });
}

async function updateUserRole(user: User, role: 'admin' | 'user') {
  openRoleMenu.value = null;
  await withLoading(async () => {
    await api.updateUserRole(user.username, role);
    users.value = await api.getUsers();
  });
}

function toggleRoleMenu(user: User) {
  openRoleMenu.value = openRoleMenu.value === user.username ? null : user.username;
}

async function deleteUser(user: User) {
  const message = fillTemplate(text.value.deleteUserConfirm, { name: user.username });
  if (!confirm(message)) return;

  await withLoading(async () => {
    await api.deleteUser(user.username);
    users.value = await api.getUsers();
  });
}

onMounted(() => {
  document.addEventListener('click', closeUserMenu);
  if (isLoggedIn.value) {
    void loadData();
  }

  detectorStatusTimer = window.setInterval(() => {
    void loadDetectorStatus();
  }, 2000);

  detectorFrameTimer = window.setInterval(() => {
    void refreshDetectorFrame();
  }, 5000);

  crowdRefreshTimer = window.setInterval(() => {
    if (activeTab.value === 'dashboard' && isLoggedIn.value && !loading.value) {
      void loadData();
    }
  }, 15000);

  reportRefreshTimer = window.setInterval(() => {
    if (isLoggedIn.value && !loading.value) {
      void refreshReportsSilently();
    }
  }, 5000);
});

onUnmounted(() => {
  document.removeEventListener('click', closeUserMenu);
  if (detectorStatusTimer) {
    window.clearInterval(detectorStatusTimer);
  }
  if (detectorFrameTimer) {
    window.clearInterval(detectorFrameTimer);
  }
  if (crowdRefreshTimer) {
    window.clearInterval(crowdRefreshTimer);
  }
  if (reportRefreshTimer) {
    window.clearInterval(reportRefreshTimer);
  }
  revokeDetectorFrameUrl();
});

watch(activeTab, (tab) => {
  if (tab === 'dashboard') {
    void nextTick(initCrowdMap);
  }
  if (tab === 'stations') {
    void nextTick(initStationMap);
  }
});

watch(
  () => [stationForm.lat, stationForm.lng],
  () => {
    syncMarkerFromForm();
  },
);

watch(stations, () => {
  if (activeTab.value === 'dashboard') {
    renderCrowdMarkers();
  }
});

watch(activeCrowdAlertStations, (items) => {
  const activeKeys = new Set(items.map((item) => crowdAlertKey(item.station, item.level)));
  const nextDismissedKeys = new Set(
    [...dismissedCrowdAlertKeys.value].filter((key) => activeKeys.has(key)),
  );

  if (nextDismissedKeys.size !== dismissedCrowdAlertKeys.value.size) {
    dismissedCrowdAlertKeys.value = nextDismissedKeys;
  }
});

watch(selectedCameraStationId, () => {
  detectorStatus.value = null;
  revokeDetectorFrameUrl();
  syncRoiDraftFromStation();
  void loadDetectorStatus();
  void refreshDetectorFrame();
});
</script>

<template>
  <main v-if="!isLoggedIn" class="login-page">
    <button class="language-toggle login-language" type="button" @click="toggleLanguage">
      {{ text.language }}
    </button>

    <section class="login-card">
      <div class="brand-mark logo-mark">
        <img :src="mfuLogoUrl" alt="MFU" />
      </div>
      <p class="eyebrow">{{ text.adminDashboard }}</p>
      <h1>MFU Shuttle Bus</h1>
      <p class="muted">{{ text.loginSubtitle }}</p>

      <form class="login-form" @submit.prevent="login">
        <label>
          {{ text.username }}
          <input v-model="loginForm.username" required autocomplete="username" :placeholder="text.usernamePlaceholder" />
        </label>
        <label>
          {{ text.password }}
          <input v-model="loginForm.password" required type="password" autocomplete="current-password" :placeholder="text.passwordPlaceholder" />
        </label>
        <button class="primary-btn" type="submit" :disabled="loading">
          {{ loading ? text.signingIn : text.signIn }}
        </button>
      </form>

      <p v-if="error" class="error-text">{{ error }}</p>
      <p class="api-note">API: {{ api.baseUrl }}</p>
    </section>
  </main>

  <div v-else class="shell" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark small logo-mark">
          <img :src="mfuLogoUrl" alt="MFU" />
        </div>
        <div>
          <strong>MFU</strong>
          <span>SHUTTLE BUS ADMIN</span>
        </div>
      </div>

      <nav>
        <button
          v-for="tab in sidebarTabs"
          :key="tab.key"
          :class="{ active: activeTab === tab.key }"
          @click="setActiveTab(tab.key)"
        >
          <svg class="sidebar-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect
              v-for="rect in tabIcons[tab.key].rects"
              :key="`rect-${rect.x}-${rect.y}`"
              :x="rect.x"
              :y="rect.y"
              :width="rect.width"
              :height="rect.height"
              :rx="rect.rx"
            />
            <circle
              v-for="circle in tabIcons[tab.key].circles"
              :key="`circle-${circle.cx}-${circle.cy}`"
              :cx="circle.cx"
              :cy="circle.cy"
              :r="circle.r"
            />
            <path
              v-for="path in tabIcons[tab.key].paths"
              :key="path"
              :d="path"
            />
          </svg>
          <span>{{ text.tabs[tab.key] }}</span>
        </button>
      </nav>
    </aside>

    <section class="content">
      <header class="topbar">
        <button class="sidebar-toggle" type="button" aria-label="Toggle sidebar" @click="toggleSidebar">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div class="topbar-actions">
          <button class="language-toggle" type="button" @click="toggleLanguage">
            {{ text.language }}
          </button>
          <div class="notification-menu" @click.stop>
            <button
              class="notification-trigger"
              :class="{ active: isAlertMenuOpen, urgent: crowdAlertStations.length > 0 }"
              type="button"
              :aria-label="text.crowdAlerts"
              @click="toggleAlertMenu"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              <span v-if="crowdAlertStations.length" class="notification-badge">
                {{ crowdAlertStations.length }}
              </span>
            </button>
            <div v-if="isAlertMenuOpen" class="notification-panel">
              <div class="notification-panel-header">
                <div>
                  <strong>{{ crowdAlertStations.length ? text.crowdAlerts : text.notifications }}</strong>
                  <span v-if="crowdAlertStations.length">
                    {{ fillTemplate(text.stationsNeedAttention, { count: crowdAlertStations.length }) }}
                  </span>
                </div>
              </div>

              <div v-if="crowdAlertStations.length" class="notification-list">
                <button
                  v-for="item in crowdAlertStations"
                  :key="item.station._id || item.station.id"
                  class="notification-item"
                  :class="`level-${item.level.toLowerCase()}`"
                  type="button"
                  @click="openCrowdAlertStation(item.station, item.level)"
                >
                  <span class="notification-dot" aria-hidden="true"></span>
                  <div>
                    <strong>{{ item.station.name }}</strong>
                    <p>
                      {{
                        fillTemplate(text.passengersWaitingAt, {
                          level: stationDensityLabel(item.station),
                          count: item.waiting,
                          line: item.station.lines.join(', ') || text.noLine,
                        })
                      }}
                    </p>
                  </div>
                </button>
              </div>

              <div v-else class="notification-empty">
                <strong>{{ text.noNotifications }}</strong>
              </div>
            </div>
          </div>
          <div class="user-menu" @click.stop>
            <span v-if="currentUsername" class="admin-display-name">{{ currentUsername }}</span>
            <button
              class="user-menu-trigger"
              type="button"
              :aria-label="text.profileInformation"
              @click="toggleUserMenu"
            >
              <span class="user-avatar">{{ userInitials }}</span>
            </button>
            <div v-if="isUserMenuOpen" class="user-menu-panel">
              <button type="button" @click="setActiveTab('users')">
                <span class="menu-icon person-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M20 21a8 8 0 0 0-16 0" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                {{ text.profileInformation }}
              </button>
              <button type="button" @click="logout">
                <span class="menu-icon">x</span>
                {{ text.logout }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <p v-if="error" class="error-banner">{{ error }}</p>

      <DashboardPage
        v-if="activeTab === 'dashboard'"
        :buses="buses"
        :crowd-map-error="crowdMapError"
        :crowd-map-loading="crowdMapLoading"
        :crowd-thresholds="crowdThresholds"
        :online-buses="onlineBuses"
        :pending-reports="pendingReports"
        :selected-station-id="selectedCrowdStationId"
        :stations="stations"
        :text="text"
        @crowd-map-ready="setCrowdMapElement"
        @focus-station="focusCrowdStation"
      />

      <StationsPage
        v-if="activeTab === 'stations'"
        :editing-station-key="editingStationKey"
        :loading="loading"
        :station-form="stationForm"
        :station-map-error="stationMapError"
        :station-map-loading="stationMapLoading"
        :station-roi-text="stationRoiText"
        :stations="stations"
        :text="text"
        @delete-station="deleteStation"
        @edit-station="editStation"
        @reset-station-form="resetStationForm"
        @save-station="saveStation"
        @station-map-ready="setStationMapElement"
        @update-station-roi-text="stationRoiText = $event"
        @use-current-location="useCurrentLocation"
      />

      <StationCCTVPage
        v-if="activeTab === 'cctv'"
        :detector-busy="detectorBusy"
        :detector-frame-url="detectorFrameUrl"
        :detector-status="detectorStatus"
        :has-camera="hasCamera"
        :is-editing-roi="isEditingRoi"
        :roi-draft="roiDraft"
        :selected-camera-preview-kind="selectedCameraPreviewKind"
        :selected-camera-station="selectedCameraStation"
        :selected-camera-url="selectedCameraUrl"
        :stations="stations"
        :text="text"
        @cancel-roi-editor="cancelRoiEditor"
        @clear-roi-draft="clearRoiDraft"
        @drag-roi-point="dragRoiPoint"
        @handle-roi-canvas-pointer-down="handleRoiCanvasPointerDown"
        @save-selected-roi="saveSelectedRoi"
        @select-camera-station="selectCameraStation"
        @set-roi-preset="setRoiPreset"
        @start-roi-editor="startRoiEditor"
        @start-selected-detector="startSelectedDetector"
        @stop-drag-roi-point="stopDragRoiPoint"
        @stop-selected-detector="stopSelectedDetector"
      />
      <BusesPage
        v-if="activeTab === 'buses'"
        :buses="buses"
        :text="text"
      />

      <ReportsPage
        v-if="activeTab === 'reports'"
        :reports="reports"
        :text="text"
        @delete-report="deleteReport"
        @update-report-status="updateReportStatus"
      />

      <UsersPage
        v-if="activeTab === 'users'"
        :loading="loading"
        :open-role-menu="openRoleMenu"
        :text="text"
        :users="users"
        @create-admin-user="createAdminUser"
        @delete-user="deleteUser"
        @toggle-role-menu="toggleRoleMenu"
        @update-user-role="updateUserRole"
      />
    </section>
  </div>
</template>
