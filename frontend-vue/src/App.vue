<script setup lang="ts">
// Main application shell: owns shared state, map rendering, and page navigation.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api, type Bus, type ShuttleRoute, type Station } from './services/api';
import { supabase } from './services/supabase';
import { startBusFeed } from './services/busFeed';
import { arrivalUnavailableReason, canEstimateArrival, gpsAgeMs, lastKnownPosition, interpolatePosition, holdStoppedPosition, ETA_MAX_AGE_MS } from './liveGps';
import { estimateRouteArrival, routeProgressAtPosition, routeBearingAtPosition, angleDifference } from './arrival';
import { createGpsMotionEstimator } from './gpsMotion';
import { arrivalStatusText, tripTimeText } from './arrivalDisplay';
import { distanceMeters, findRide, findBoardingStop, type BoardingSuggestion } from './routePlanning';
import busLeftUrl from '../assets/gemcar_left.png';
import busRightUrl from '../assets/gemcar_right.png';
import busTurnLeftUrl from '../assets/gemcar_turnleft.png';
import busTurnRightUrl from '../assets/gemcar_turnright.png';
import busIconUrl from '../assets/bus.png';
import busStopUrl from '../assets/bus_stop_2.png';
import TransitPage from './pages/TransitPage.vue';
import FavoritesPage from './pages/FavoritesPage.vue';
import FeedbackPage from './pages/FeedbackPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import LanguagePage from './pages/LanguagePage.vue';
import type { Lang } from './types';

type Page = 'home' | 'transit' | 'favorites' | 'report' | 'settings' | 'language';
type Line = string;
type RoutePoint = { lat: number; lng: number };
type MapViewport = { center: RoutePoint; zoom: number };
type BusMarkerEntry = { marker: any; key: string; position: RoutePoint; bearing: number | null; line: Line; turnReady: boolean; turnTimer?: number; animationFrame?: number; lastGpsAt?: string | null; lastMovement?: string };
const gpsNow = ref(Date.now());
const estimateGpsMotion = createGpsMotionEstimator();
let gpsClockTimer: number | undefined;
type GoogleMap = any;

declare global {
  interface Window { google?: any; gm_authFailure?: () => void; initMfuUserMap?: () => void; }
}

const LANG_KEY = 'mfu_user_language';
const FAVORITES_KEY = 'favorite_stations';
const fallbackFavoritesKey = 'mfu_user_favorites';
const MAP_VIEWPORT_KEY = 'mfu_user_map_viewport';
const lang = ref<Lang>((localStorage.getItem(LANG_KEY) as Lang) || 'th');
const page = ref<Page>('home');
const isMenuOpen = ref(false);
const selectedLine = ref<'all' | Line>('all');
const fromQuery = ref('');
const toQuery = ref('');
const selectedFromId = ref('');
const selectedToId = ref('');
const isTripSearchCollapsed = ref(false);
const activeSearchField = ref<'from' | 'to'>('to');
const stations = ref<Station[]>([]);
const routes = ref<ShuttleRoute[]>([]);
const routesLoaded = ref(false);
const buses = ref<Bus[]>([]);
const favoriteIds = ref<string[]>(JSON.parse(localStorage.getItem(FAVORITES_KEY) || localStorage.getItem(fallbackFavoritesKey) || '[]'));
const isLoading = ref(false);
const message = ref('');
const mapError = ref('');
const expandedLines = ref<Record<Line, boolean>>({ line1: false, line2: false });
const transitSearch = ref<Record<Line, string>>({ line1: '', line2: '' });
const showStationPicker = ref(false);
const showStationSuggestions = ref(false);
const favoriteSearch = ref('');
const confirmStation = ref<Station | null>(null);
const stationDetail = ref<Station | null>(null);
const successModal = ref(false);
let successModalTimer: ReturnType<typeof setTimeout> | undefined;
const feedbackFormVersion = ref(0);
const isFeedbackSubmitting = ref(false);
const mapElement = ref<HTMLElement | null>(null);
const selectedRouteAvailable = ref(false);
const selectedRideLine = ref<string | null>(null);
const boardingSuggestion = ref<BoardingSuggestion | null>(null);
const routePlanReady = ref(false);
const userLocation = ref<RoutePoint | null>(null);
const locationError = ref('');

let campusMap: GoogleMap = null;
let savedMapViewport = readMapViewport();
let autoCenterOnLocation = savedMapViewport === null;
let mapMarkers: any[] = [];
let mapPolylines: any[] = [];
let busMarkers: BusMarkerEntry[] = [];
let busOverlay: any = null;
let busOverlayKey = '';
let busOverlayPosition: RoutePoint | null = null;
let stationOverlay: any = null;
const routePathCache = new Map<Line, RoutePoint[]>();
let stationOverlayStationId = '';
let stationPopupTimer: number | undefined;
let mapRenderGeneration = 0;
let googleMapsPromise: Promise<void> | null = null;
let mapResizeObserver: ResizeObserver | null = null;
let userLocationMarker: any = null;
let userLocationWatchId: number | undefined;
let userLocationOverlay: any = null;
let userLocationOverlayPosition: RoutePoint | null = null;

const userLocationIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#eeeeee" stroke="#d2232a" stroke-width="3"/><circle cx="32" cy="23" r="8" fill="#d2232a"/><path d="M16 48c2-10 8-16 16-16s14 6 16 16c-8 4-24 4-32 0Z" fill="#d2232a"/></svg>')}`;

const fallbackRoutes: ShuttleRoute[] = [
  { id: 'line1', name: 'Line 1', nameTH: 'สาย 1', color: '#bc9945', enabled: true, geometry: { type: 'LineString', coordinates: [] } },
  { id: 'line2', name: 'Line 2', nameTH: 'สาย 2', color: '#777777', enabled: true, geometry: { type: 'LineString', coordinates: [] } },
];

const dictionary = {
  th: {
      title: 'MFU SHUTTLE BUS', 
      home: 'หน้าแรก', 
      transit: 'รถรับส่ง มฟล.', 
      favorites: 'สถานีโปรด',
      report: 'ข้อเสนอแนะ', 
      settings: 'ตั้งค่า',
      from: 'จาก', to: 'ไปยัง', 
      fromStation: 'สถานีต้นทาง', toStation: 'สถานีปลายทาง', 
      swap: 'สลับสถานี', close: 'ปิด', 
      line1: 'สาย 1', line2: 'สาย 2', all: 'ทั้งหมด', stations: 'สถานี',
      mainRoute: 'เส้นทางในมหาวิทยาลัย', medicalRoute: 'เส้นทางศูนย์การแพทย์ มฟล.', 
      findStation: 'ค้นหาสถานี', addNew: 'เพิ่มสถานี', 
      saveFavorite: 'บันทึกสถานีที่คุณใช้บ่อย', noFavorites: 'ยังไม่มีสถานีโปรด',
      remove: 'ลบ', cancel: 'ยกเลิก', confirmRemove: 'ต้องการลบสถานีนี้ออกจากรายการโปรดใช่ไหม?', 
      searchStation: 'ค้นหาสถานี', noStations: 'ไม่พบสถานี', 
      required: 'กรุณากรอกข้อมูลให้ครบถ้วน', feedback: 'ส่งข้อเสนอแนะ', feedbackFormTitle: 'แบบฟอร์มข้อเสนอแนะ', feedbackName: 'ชื่อ', feedbackEmail: 'อีเมลส่วนตัว', feedbackNamePlaceholder: 'กรอกชื่อ', feedbackEmailPlaceholder: 'กรอกอีเมลส่วนตัว', feedbackSubmit: 'ส่งข้อเสนอแนะ', tripSummary: 'สรุปการเดินทาง', noDirectRoute: 'ไม่มีเส้นทางรถตรงระหว่างสองสถานีนี้', minutes: 'นาที', busArrival: 'รถจะมาถึงใน', rideTime: 'เวลานั่งบนรถ', totalTime: 'รวมเวลาเดินทาง',
      success: 'สำเร็จ', successText: 'ส่งข้อเสนอแนะเรียบร้อยแล้ว', language: 'ภาษา',
      languageEnglish: 'English', languageThai: 'ไทย', transitSection: 'การเดินทาง', supportSection: 'ช่วยเหลือ', loading: 'กำลังโหลดข้อมูล...', mapKeyMissing: 'กรุณาตั้งค่า Google Maps API key ในไฟล์ root .env', mapLoadFailed: 'ไม่สามารถโหลด Google Maps ได้', ratingQuestions: ['การบริการที่สถานี', 'สภาพรถรับส่ง', 'มารยาทและความปลอดภัยในการขับรถ', 'ความสุภาพของพนักงานขับรถ', 'ความพึงพอใจโดยรวม'],
  },
  en: {
    title: 'MFU SHUTTLE BUS', home: 'Home', transit: 'MFU Transit', favorites: 'Favorite Stations', report: 'Feedback', settings: 'Settings', 
    from: 'From', to: 'To', fromStation: 'From station', toStation: 'To station', swap: 'Swap stations', close: 'Close', line1: 'Line 1', line2: 'Line 2', all: 'All', stations: 'stations',
    mainRoute: 'Main campus route', medicalRoute: 'MFU Medical Center route', findStation: 'Find station', addNew: 'Add new', saveFavorite: 'Save your favorite station', noFavorites: 'No favorite stations yet', remove: 'Delete', cancel: 'Cancel', confirmRemove: 'Remove this station from your favorite list?', searchStation: 'Search station', noStations: 'No stations found',
    required: 'Please complete the required fields', feedback: 'Feedback', feedbackFormTitle: 'Feedback Form', feedbackName: 'Name', feedbackEmail: 'Email', feedbackNamePlaceholder: 'Enter name', feedbackEmailPlaceholder: 'Enter email', feedbackSubmit: 'Submit', tripSummary: 'Route summary', noDirectRoute: 'No direct bus route between these stations', minutes: 'min', busArrival: 'Bus arrives in', rideTime: 'Ride time', totalTime: 'Total time', success: 'Success', successText: 'Feedback sent successfully', language: 'Language',
    languageEnglish: 'English', languageThai: 'ไทย', transitSection: 'Transit', supportSection: 'Support', loading: 'Loading...', mapKeyMissing: 'Set the Google Maps API key in root .env', mapLoadFailed: 'Google Maps could not be loaded', ratingQuestions: ['Station service', 'Bus condition', 'Driving manners and safety', 'Driver politeness', 'Overall satisfaction'],
  },
} as const;
const t = computed(() => dictionary[lang.value]);
const availableRoutes = computed(() => routesLoaded.value ? routes.value.filter((route) => route.enabled !== false) : fallbackRoutes);
const visibleStations = computed(() => stations.value.filter((station) => selectedLine.value === 'all' || station.lines?.includes(selectedLine.value)));
const favoriteStations = computed(() => stations.value.filter((station) => favoriteIds.value.includes(station.id)));
const fromMatches = computed(() => searchStations(fromQuery.value, 'from'));
const toMatches = computed(() => searchStations(toQuery.value, 'to'));
const favoriteMatches = computed(() => { const query = favoriteSearch.value.trim().toLowerCase(); return stations.value.filter((station) => !query || station.name.toLowerCase().includes(query) || station.nameTH?.toLowerCase().includes(query)); });
const MFU_MAP_STYLES = [
  { featureType: 'administrative', 
    elementType: 'geometry', 
    stylers: [{ visibility: 'off' }] 
  }, 
  { featureType: 'landscape', 
    elementType: 'geometry', 
    stylers: [{ color: '#eeeeee' }] 
  }, 
  { featureType: 'landscape.natural', 
    elementType: 'geometry', 
    stylers: [{ color: '#d4f5de' }] 
  },
  { featureType: 'poi', 
    elementType: 'geometry', 
    stylers: [{ color: '#eeeeee' }] 
  }, 
  { featureType: 'poi.business', 
    elementType: 'labels.icon', 
    stylers: [{ visibility: 'on' }] 
  }, 
  { featureType: 'poi.park', 
    elementType: 'geometry', 
    stylers: [{ color: '#cdf3dd' }] 
  },
  { featureType: 'road', 
  elementType: 'geometry', 
  stylers: [{ color: '#d4e1e9' }] 
  }, 
  { featureType: 'road.arterial', 
    elementType: 'geometry', 
    stylers: [{ color: '#b8953a' }] 
  }, 
  { featureType: 'road.local', 
    elementType: 'geometry', 
    stylers: [{ color: '#d6e2ea' }] 
  }, 
  { featureType: 'road.highway', 
    elementType: 'geometry', 
    stylers: [{ color: '#61666b' }]
   },
  { featureType: 'road', 
    elementType: 'labels.text.fill', 
    stylers: [{ color: '#707982' }] 
  }, 
  { featureType: 'road', 
    elementType: 'labels.text.stroke', 
    stylers: [{ color: '#ffffff' }, { weight: 3 }] 
  }, 
  { featureType: 'transit', 
    stylers: [{ visibility: 'off' }] 
  }, 
  { featureType: 'water', 
    elementType: 'geometry', 
    stylers: [{ color: '#8fd8e8' }] 
  },
];

function stationName(station: Station) 
  { return lang.value === 'th' && station.nameTH ? station.nameTH : station.name; }

function refreshStationLanguage() {
  // Relabel selected IDs without overwriting an unfinished search or resetting the route.
  const from = stations.value.find((station) => station.id === selectedFromId.value);
  const to = stations.value.find((station) => station.id === selectedToId.value);
  if (from) fromQuery.value = stationName(from);
  if (to) toQuery.value = stationName(to);
  for (const marker of mapMarkers) {
    const station = stations.value.find((item) => item.id === marker.get('stationId'));
    if (station) marker.setTitle(stationName(station));
  }
  refreshStationPopup();
  refreshBusPopup();
}

  function setLanguage(next: Lang) 
  { lang.value = next; localStorage.setItem(LANG_KEY, next); }

  function openPage(next: Page) 
  { page.value = next; isMenuOpen.value = false; stationDetail.value = null; }

  function goHome() 
  { openPage('home'); }

async function selectTransitStation(station: Station) {
  const selectionKind = !selectedFromId.value ? 'from' : !selectedToId.value ? 'to' : 'to';
  setStation(selectionKind, station);
  openPage('home');
  await nextTick();
  await ensureHomeMap();
  if (!campusMap) return;
  campusMap.panTo({ lat: station.lat, lng: station.lng });
  toggleStationPopup(station);
}
function searchStations(query: string, field: 'from' | 'to') {
  const clean = query.trim().toLowerCase();
  const blockedId = field === 'from' ? selectedToId.value : selectedFromId.value;
  return visibleStations.value
    .filter((station) => station.id !== blockedId)
    .filter((station) => !clean || station.name.toLowerCase().includes(clean) || station.nameTH?.toLowerCase().includes(clean))
    .sort((a, b) => Number(favoriteIds.value.includes(b.id)) - Number(favoriteIds.value.includes(a.id)) || stationName(a).localeCompare(stationName(b)));
}
function setStation(kind: 'from' | 'to', station: Station) {
  if (kind === 'from') {
    selectedFromId.value = station.id;
    fromQuery.value = stationName(station);
  } else {
    selectedToId.value = station.id;
    toQuery.value = stationName(station);
  }

  showStationSuggestions.value = false;

  if (selectedFromId.value && selectedToId.value) {
    isTripSearchCollapsed.value = true;
  }
}

function hideStationSuggestionsSoon(event?: FocusEvent) {
  const nextElement = event?.relatedTarget as HTMLElement | null;
  if (nextElement?.closest('.suggestions')) return;
  window.setTimeout(() => {
    const focusedElement = document.activeElement as HTMLElement | null;
    if (focusedElement?.closest('.trip-fields, .suggestions')) return;
    showStationSuggestions.value = false;
  }, 120);
}

function clearStation (kind: 'from' | 'to') 
{ if (kind === 'from') { 
    selectedFromId.value = ''; fromQuery.value = ''; 
        } else { 
          selectedToId.value = ''; toQuery.value = '';
       } isTripSearchCollapsed.value = false; 
}

function resetTrip() {
  selectedFromId.value = '';
  selectedToId.value = '';
  fromQuery.value = '';
  toQuery.value = '';
  showStationSuggestions.value = false;
  isTripSearchCollapsed.value = false;
}

function swapStations() {
   [fromQuery.value, toQuery.value] = [toQuery.value, fromQuery.value]; 
   [selectedFromId.value, selectedToId.value] = [selectedToId.value, selectedFromId.value]; 
}

function persistFavorites() { 
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds.value)); 
    localStorage.setItem(fallbackFavoritesKey, JSON.stringify(favoriteIds.value)); 
}

function toggleFavorite(id: string) { 
  favoriteIds.value = favoriteIds.value.includes(id) ? favoriteIds.value.filter((item) => item !== id) : [...favoriteIds.value, id]; persistFavorites(); 
}

function askRemoveFavorite(station: Station) { 
  confirmStation.value = station; 
}

function confirmRemoveFavorite() { 
  if (confirmStation.value) toggleFavorite(confirmStation.value.id); confirmStation.value = null; 
}

type FeedbackPayload = { name: string; email: string; ratings: number[] };

async function submitFeedback(payload: FeedbackPayload) {
  if (isFeedbackSubmitting.value) return;
  isFeedbackSubmitting.value = true;
  message.value = "";
  try {
    const detail = [`Name: ${payload.name}`, `Email: ${payload.email}`, ...payload.ratings.map((rating, index) => `${t.value.ratingQuestions[index]}: ${rating}/5`)].join('\n');
    await api.sendReport('Feedback', detail, '-');
    // Remount the keyed form only after success to reset fields, ratings, and warnings.
    feedbackFormVersion.value += 1;
    successModal.value = true;
    // Replace any previous timer and dismiss the confirmation after 2.5 seconds.
    clearTimeout(successModalTimer);
    successModalTimer = setTimeout(() => {
      successModal.value = false;
    }, 2500);
  } catch (error) {
    // Preserve the form on failure so the user can retry without re-entering data.
    message.value = error instanceof Error ? error.message : t.value.mapLoadFailed;
  } finally {
    isFeedbackSubmitting.value = false;
  }
}

function lineStations(line: Line) { 
  return stations.value.filter((station) => station.lines?.includes(line)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })); 
}

function filteredLineStations(line: Line) {
   const query = (transitSearch.value[line] || '').trim().toLowerCase(); return lineStations(line).filter((station) => !query || stationName(station).toLowerCase().includes(query) || station.name.toLowerCase().includes(query));
  }

function busLineKey(bus: Bus): Line | null {
  const line = String(bus.line ?? '').trim().toLowerCase();
  if (!line) return null;
  return /^line\d+$/.test(line) ? line : /^\d+$/.test(line) ? `line${line}` : line;
}

function busMatchesSelectedLine(bus: Bus) {
  if (selectedLine.value === 'all') return true;
  const line = busLineKey(bus);
  // GPS records without line metadata should remain visible until the backend assigns a line.
  return line === null || line === selectedLine.value;
}

function busPosition(bus: Bus) {
  return lastKnownPosition(bus, gpsNow.value);
}

function busPositionIsRecent(bus: Bus) {
  return bus.feedHealthy && bus.connectionStatus === 'fresh' && gpsAgeMs(bus, gpsNow.value) <= ETA_MAX_AGE_MS;
}

// Project a GPS point onto a route so ETA and station direction use road distance.
function routeDistanceBetween(first: RoutePoint, second: RoutePoint, path?: RoutePoint[]) {
  if (!path) return distanceMeters(first, second);
  const firstProgress = routeProgressAtPosition(first, path);
  const secondProgress = routeProgressAtPosition(second, path);
  if (!firstProgress || !secondProgress) return distanceMeters(first, second);
  return Math.abs(firstProgress.distanceFromStart - secondProgress.distanceFromStart);
}

// Combine route geometry with GPS heading to identify the vehicle's travel direction.
function busRouteBearing(bus: Bus, position: RoutePoint, paths: Map<Line, RoutePoint[]>) {
  const busLine = busLineKey(bus);
  const candidatePaths = busLine
    ? [[busLine, paths.get(busLine)] as const]
    : Array.from(paths.entries());
  const availablePaths = candidatePaths.filter(([, path]) => path?.length);
  let nearestBearing: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  availablePaths.forEach(([, path]) => {
    const bearing = routeBearingAtPosition(position, path!);
    if (bearing === null) return;
    const nearestPointDistance = path!.reduce((distance, point) => Math.min(distance, (position.lng - point.lng) ** 2 + (position.lat - point.lat) ** 2), Number.POSITIVE_INFINITY);
    if (nearestPointDistance < nearestDistance) {
      nearestDistance = nearestPointDistance;
      nearestBearing = bearing;
    }
  });

  if (nearestBearing === null) return Number.isFinite(bus.directionRaw) ? Number(bus.directionRaw) : null;
  if (Number.isFinite(bus.directionRaw) && angleDifference(nearestBearing, Number(bus.directionRaw)) > 90) {
    return (nearestBearing + 180) % 360;
  }
  return nearestBearing;
}

function busIconForDirection(directionRaw: number | null | undefined) {
  if (!Number.isFinite(directionRaw)) return busRightUrl;
  const direction = ((Number(directionRaw) % 360) + 360) % 360;
  // The animation intentionally uses only the left and right side assets.
  return direction < 90 || direction >= 270 ? busRightUrl : busLeftUrl;
}

function busTurnIcon(currentBearing: number, targetBearing: number) {
  const turn = ((targetBearing - currentBearing + 540) % 360) - 180;
  if (Math.abs(turn) < 20 || Math.abs(turn) >= 150) return null;
  return turn > 0 ? busTurnRightUrl : busTurnLeftUrl;
}

function busTravelBearing(bus: Bus, position: RoutePoint): number | null {
  const line = nearestBusLine(bus, position);
  const path = routePathCache.get(line);
  return busRouteBearing(bus, position, path ? new Map([[line, path]]) : new Map());
}

function setBusMarkerIcon(marker: any, url: string) {
  marker.setIcon({ url, scaledSize: new window.google.maps.Size(58, 58), anchor: new window.google.maps.Point(29, 36) });
}

function clearBusMarkers() {
  busMarkers.forEach(({ marker, turnTimer, animationFrame }) => {
    if (turnTimer !== undefined) window.clearTimeout(turnTimer);
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    marker.setMap(null);
  });
  busMarkers = [];
}

function updateBusTurn(entry: BusMarkerEntry, bus: Bus, position: RoutePoint) {
  // Ignore stationary GPS jitter. A straight segment rearms the next brief turn animation.
  const line = nearestBusLine(bus, position);
  if (distanceMeters(entry.position, position) < 3 && line === entry.line) return;
  const bearing = busTravelBearing(bus, position);
  const previous = entry.bearing;
  const sameLine = line === entry.line;
  entry.bearing = bearing;
  entry.line = line;
  entry.position = position;
  if (entry.turnTimer !== undefined) window.clearTimeout(entry.turnTimer);
  entry.turnTimer = undefined;
  const sideIcon = busIconForDirection(bearing);
  const turnIcon = sameLine && previous !== null && bearing !== null ? busTurnIcon(previous, bearing) : null;
  if (turnIcon && entry.turnReady) {
    entry.turnReady = false;
    setBusMarkerIcon(entry.marker, turnIcon);
    entry.turnTimer = window.setTimeout(() => {
      setBusMarkerIcon(entry.marker, sideIcon);
      entry.turnTimer = undefined;
    }, 900);
  } else {
    setBusMarkerIcon(entry.marker, sideIcon);
    if (!sameLine || previous === null || bearing === null || angleDifference(previous, bearing) < 10) entry.turnReady = true;
  }
}

function closeBusPopup() {
  // Clear the selected key as well as the overlay so the same bus can reopen on click.
  if (busOverlay) busOverlay.setMap(null);
  busOverlay = null;
  busOverlayKey = '';
  busOverlayPosition = null;
}

function dismissBusPopupOutsideMap(event: MouseEvent) {
  if (!busOverlay || !(event.target instanceof Node)) return;
  // Google Maps handles map/marker clicks separately. Do not close a popup on
  // the same click that opens it; this handler covers controls outside the map.
  if (mapElement.value?.contains(event.target) || busOverlay.element?.contains(event.target)) return;
  closeBusPopup();
}

function nearestBusLine(bus: Bus, position: RoutePoint) {
  const knownLine = busLineKey(bus);
  if (knownLine) return knownLine;
  if (selectedLine.value !== 'all') return selectedLine.value;
  const lineIds = availableRoutes.value.map((route) => route.id);
  return lineIds.reduce<Line>((nearestLine, line) => {
    const path = routePathCache.get(line);
    const nearestDistance = path ? routeProgressAtPosition(position, path)?.distanceToPath ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    const currentPath = routePathCache.get(nearestLine);
    const currentDistance = currentPath ? routeProgressAtPosition(position, currentPath)?.distanceToPath ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    return nearestDistance < currentDistance ? line : nearestLine;
  }, lineIds[0] || 'line1');
}

function busStationSummary(bus: Bus, position: RoutePoint) {
  const line = nearestBusLine(bus, position);
  const lineStations = stations.value.filter((station) => station.lines?.includes(line));
  if (!lineStations.length) return null;
  const path = routePathCache.get(line);
  const orderedStations = path
    ? lineStations
      .map((station) => ({ station, progress: routeProgressAtPosition(station, path)?.distanceFromStart ?? 0 }))
      .sort((first, second) => first.progress - second.progress)
      .map(({ station }) => station)
    : lineStations;
  const currentIndex = orderedStations.reduce((nearest, station, index) => {
    const currentDistance = distanceMeters(position, station);
    return currentDistance < nearest.distance ? { index, distance: currentDistance } : nearest;
  }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
  const routeBearing = path ? routeBearingAtPosition(position, path) : null;
  const actualBearing = Number(bus.directionRaw);
  const movingForward = routeBearing === null || !Number.isFinite(actualBearing) || angleDifference(routeBearing, actualBearing) <= 90;
  const nextIndex = (currentIndex + (movingForward ? 1 : -1) + orderedStations.length) % orderedStations.length;
  return { current: orderedStations[currentIndex], next: orderedStations[nextIndex] };
}

function busPopupHtml(bus: Bus, position: RoutePoint) {
  // Show the bus number and stations; GPS age remains part of freshness logic only.
  // Bold the station labels through ':' while keeping escaped station names regular.
  const busNumber = bus.busNumber || bus.busId?.replace(/^MFU/i, '') || '-';
  const summary = busStationSummary(bus, position);
  const currentLabel = summary ? escapeHtml(stationName(summary.current)) : '-';
  const nextLabel = summary ? escapeHtml(stationName(summary.next)) : '-';
  return `<div class="bus-map-popup"><div class="bus-map-popup-number">${lang.value === 'th' ? 'หมายเลขรถ' : 'Bus number'}: <strong>${escapeHtml(busNumber)}</strong></div><div class="bus-map-popup-route"><div><strong>${lang.value === 'th' ? 'สถานีปัจจุบัน' : 'Current station'}:</strong> ${currentLabel}</div><div><strong>${lang.value === 'th' ? 'สถานีถัดไป' : 'Next station'}:</strong> ${nextLabel}</div></div></div>`;
}

function toggleBusPopup(bus: Bus, position: { lat: number; lng: number }) {
  const busKey = bus.busId || bus.busNumber || `${position.lat}:${position.lng}`;
  if (busOverlayKey === busKey) {
    closeBusPopup();
    return;
  }


  closeBusPopup();
  closeStationPopup();
  closeUserLocationPopup();
  busOverlayPosition = position;
  const overlay = new window.google.maps.OverlayView();
  overlay.onAdd = () => {
    const element = document.createElement('div');
    element.className = 'bus-map-popup-host';
    // Clicking the popup itself must not trigger the map's dismiss handler.
    element.addEventListener('click', event => event.stopPropagation());
    element.innerHTML = busPopupHtml(bus, position);
    overlay.element = element;
    overlay.getPanes().floatPane.appendChild(element);
  };
  overlay.draw = () => {
    if (!overlay.element) return;
    const projection = overlay.getProjection();
    if (!projection) return;
    const point = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(busOverlayPosition || position));
    if (!point) return;
    overlay.element.style.left = `${point.x}px`;
    overlay.element.style.top = `${point.y}px`;
  };
  overlay.onRemove = () => {
    overlay.element?.remove();
    overlay.element = null;
  };
  busOverlay = overlay;
  busOverlayKey = busKey;
  overlay.setMap(campusMap);
}

function renderBusMarkers(paths = routePathCache) {
  clearBusMarkers();
  closeBusPopup();
  if (!campusMap || !window.google?.maps) return [];
  const positions: Array<{ lat: number; lng: number }> = [];
  buses.value.filter(busMatchesSelectedLine).forEach(bus => {
    const position = busPosition(bus);
    if (!position) return;
    positions.push(position);
    busMarkers.push(createBusMarker(bus, position));
  });
  return positions;
}

function createBusMarker(bus: Bus, position: RoutePoint): BusMarkerEntry {
    const marker = new window.google.maps.Marker({ position, map: campusMap, title: bus.name || bus.busId || 'MFU Shuttle Bus', zIndex: 20, opacity: busPositionIsRecent(bus) ? 1 : 0.5,
      icon: { url: busIconForDirection(busTravelBearing(bus, position)), scaledSize: new window.google.maps.Size(58, 58), anchor: new window.google.maps.Point(29, 36) } });
    const entry: BusMarkerEntry = { marker, key: bus.busId || bus.busNumber || bus.name || `${position.lat}:${position.lng}`, position, bearing: busTravelBearing(bus, position), line: nearestBusLine(bus, position), turnReady: true, lastGpsAt: bus.lastGpsAt, lastMovement: bus.status };
    marker.addListener('click', () => {
      const currentPosition = entry.marker.getPosition?.();
      toggleBusPopup(
        buses.value.find((item) => (item.busId || item.busNumber || item.name) === entry.key) || bus,
        currentPosition ? { lat: currentPosition.lat(), lng: currentPosition.lng() } : entry.position,
      );
    });
    return entry;
}

// Keep visible bus markers and open popups synchronized with the latest GPS response.
function updateLiveBusMarkers() {
  if (!campusMap || !window.google?.maps) return;
  const visibleBuses = buses.value
    .filter(busMatchesSelectedLine)
    .map((bus) => ({ bus, position: busPosition(bus) }))
    .filter((item): item is { bus: Bus; position: RoutePoint } => item.position !== null);
  const nextKeys = visibleBuses.map(({ bus, position }) => bus.busId || bus.busNumber || bus.name || `${position.lat}:${position.lng}`);
  // Reconcile by vehicle ID so one vehicle expiring cannot reset all other markers/popups.
  const existing = new Map(busMarkers.map(entry => [entry.key, entry]));
  busMarkers.forEach(entry => {
    if (nextKeys.includes(entry.key)) return;
    if (entry.animationFrame !== undefined) cancelAnimationFrame(entry.animationFrame);
    if (entry.turnTimer !== undefined) window.clearTimeout(entry.turnTimer);
    entry.marker.setMap(null);
    if (busOverlayKey === entry.key) closeBusPopup();
  });
  busMarkers = visibleBuses.map(({ bus, position }, index) => existing.get(nextKeys[index]) || createBusMarker(bus, position));
  visibleBuses.forEach(({ bus, position }, index) => {
    const entry = busMarkers[index];
    entry.marker.setOpacity(busPositionIsRecent(bus) ? 1 : 0.5);
    if (entry.lastGpsAt === bus.lastGpsAt && entry.lastMovement === bus.status) return;
    const previousGpsAt = entry.lastGpsAt;
    const previousMovement = entry.lastMovement;
    entry.lastMovement = bus.status;
    entry.lastGpsAt = bus.lastGpsAt;
    if (entry.animationFrame !== undefined) cancelAnimationFrame(entry.animationFrame);
    entry.animationFrame = undefined;
    const markerPosition = entry.marker.getPosition();
    // Maps can leave a marker without a position after a map loading failure.
    // Restore the latest GPS fix before attempting to animate it.
    if (!markerPosition) {
      entry.position = position;
      entry.marker.setPosition(position);
      return;
    }
    const from = { lat: markerPosition.lat(), lng: markerPosition.lng() };
    if (bus.status !== 'RUNNING') {
      if (entry.turnTimer !== undefined) window.clearTimeout(entry.turnTimer);
      entry.turnTimer = undefined;
      entry.turnReady = true;
      setBusMarkerIcon(entry.marker, busIconForDirection(entry.bearing));
      if (holdStoppedPosition(previousMovement, bus, distanceMeters(entry.position, position))) return;
      // Accept the final stop fix or a substantial correction immediately, without simulating driving.
      entry.position = position;
      entry.marker.setPosition(position);
      return;
    }
    updateBusTurn(entry, bus, position);
    entry.position = position;
    // Only interpolate nearby, recent measured points. Never project movement beyond the GPS fix.
    const gap = Date.parse(bus.lastGpsAt || '') - Date.parse(previousGpsAt || '');
    if (!busPositionIsRecent(bus) || gap <= 0 || gap > ETA_MAX_AGE_MS || distanceMeters(from, position) > 100) {
      entry.marker.setPosition(position);
      entry.animationFrame = undefined;
      return;
    }
    const started = performance.now();
    const animate = (time: number) => {
      const fraction = Math.min(1, (time - started) / 1000);
      const displayed = interpolatePosition(from, position, fraction);
      entry.marker.setPosition(displayed);
      if (busOverlayKey === entry.key) { busOverlayPosition = displayed; busOverlay?.draw?.(); }
      entry.animationFrame = fraction < 1 ? requestAnimationFrame(animate) : undefined;
    };
    entry.animationFrame = requestAnimationFrame(animate);
  });
}

// Show the user's real browser location and keep the marker updated while permission remains active.
function renderUserLocationMarker(position: RoutePoint) {
  if (!campusMap || !window.google?.maps) return;
  if (!userLocationMarker) {
    userLocationMarker = new window.google.maps.Marker({
      position,
      map: campusMap,
      title: lang.value === 'th' ? 'ตำแหน่งปัจจุบันของฉัน' : 'My current location',
      zIndex: 40,
      icon: {
        url: userLocationIcon,
        scaledSize: new window.google.maps.Size(36, 36),
        anchor: new window.google.maps.Point(18, 36),
      },
    });
    userLocationMarker.addListener('click', toggleUserLocationPopup);
  } else {
    userLocationMarker.setPosition(position);
    userLocationMarker.setMap(campusMap);
  }
}

function closeUserLocationPopup() {
  if (userLocationOverlay) userLocationOverlay.setMap(null);
  userLocationOverlay = null;
  userLocationOverlayPosition = null;
}

function toggleUserLocationPopup() {
  closeBusPopup();
  if (!userLocation.value || !campusMap || !window.google?.maps) return;
  if (userLocationOverlay) {
    closeUserLocationPopup();
    return;
  }

  userLocationOverlayPosition = userLocation.value;
  const overlay = new window.google.maps.OverlayView();
  overlay.onAdd = () => {
    const element = document.createElement('div');
    element.className = 'user-location-popup-host';
    element.innerHTML = '<div class="user-location-popup">You are here</div>';
    overlay.element = element;
    overlay.getPanes().floatPane.appendChild(element);
  };
  overlay.draw = () => {
    if (!overlay.element || !userLocationOverlayPosition) return;
    const projection = overlay.getProjection();
    if (!projection) return;
    const point = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(userLocationOverlayPosition));
    if (!point) return;
    overlay.element.style.left = `${point.x}px`;
    overlay.element.style.top = `${point.y}px`;
  };
  overlay.onRemove = () => {
    overlay.element?.remove();
    overlay.element = null;
  };
  userLocationOverlay = overlay;
  overlay.setMap(campusMap);
}

function updateUserLocation(position: GeolocationPosition) {
  const nextPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
  const shouldCenterMap = autoCenterOnLocation;
  userLocation.value = nextPosition;
  locationError.value = '';
  renderUserLocationMarker(nextPosition);
  userLocationOverlayPosition = nextPosition;
  userLocationOverlay?.draw?.();
  if (shouldCenterMap && campusMap) {
    autoCenterOnLocation = false;
    campusMap.panTo(nextPosition);
  }
}

function startUserLocationTracking() {
  if (!navigator.geolocation) {
    locationError.value = lang.value === 'th' ? 'อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง' : 'Location is not supported on this device';
    return;
  }
  if (userLocationWatchId !== undefined) return;
  userLocationWatchId = navigator.geolocation.watchPosition(
    updateUserLocation,
    () => {
      locationError.value = lang.value === 'th' ? 'ไม่สามารถเข้าถึงตำแหน่งปัจจุบันได้' : 'Unable to access your current location';
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
  );
}

// Refresh the bus popup text and anchor when the selected vehicle receives new GPS data.
function refreshBusPopup() {
  if (!busOverlayKey || !busOverlay) return;
  const entry = busMarkers.find(({ key }) => key === busOverlayKey);
  const bus = buses.value.find((item) => (item.busId || item.busNumber || item.name) === busOverlayKey);
  if (!entry || !bus) {
    closeBusPopup();
    return;
  }
  const displayed = entry.marker.getPosition();
  busOverlayPosition = { lat: displayed.lat(), lng: displayed.lng() };
  const element = busOverlay.element as HTMLElement | undefined;
  if (element) element.innerHTML = busPopupHtml(bus, entry.position);
  busOverlay.draw?.();
}

// Estimate arrival from the nearest fresh bus, route distance, and its live speed.
function stationArrivalMinutes(station: Station) {
  const lines = (station.lines || []).filter((line): line is Line => Boolean(line));
  const estimates = lines.map((line) => stationArrivalMinutesForLine(station, line)).filter((value): value is number => value !== null);
  if (estimates.length) return Math.min(...estimates);
  return null;
}

function stationArrivalText(station: Station) {
  const minutes = stationArrivalMinutes(station);
  if (minutes !== null) return minuteText(minutes);
  return arrivalStatusText(arrivalReasonForLines(station.lines || []), lang.value);
}

function arrivalReasonForLines(lines: string[]) {
  return lines.length && !lines.some(line => (routePathCache.get(line)?.length || 0) >= 2)
    ? 'routeMissing' : arrivalUnavailableReason(buses.value, lines, gpsNow.value);
}

function stationArrivalMinutesForLine(station: Station, line?: Line): number | null {
  const routePath = line ? routePathCache.get(line) : undefined;
  if (!line || !routePath || routePath.length < 2) return null;
  return estimateRouteArrival(station, line, routePath, buses.value, gpsNow.value);
}

const tripEstimate = computed(() => {
  const from = stations.value.find((station) => station.id === selectedFromId.value);
  const to = stations.value.find((station) => station.id === selectedToId.value);
  if (!from || !to) return null;
  const line = selectedRideLine.value;
  if (!line || !selectedRouteAvailable.value) return { available: false as const };
  const rideMinutes = Math.max(1, Math.ceil(distanceMeters(from, to) / 8.33 / 60));
  const arrivalMinutes = stationArrivalMinutesForLine(from, line);
  const text = tripTimeText(arrivalMinutes, rideMinutes, arrivalReasonForLines([line]), lang.value);
  return { available: true as const, arrivalMinutes, rideMinutes, arrivalText: text.arrival, totalText: text.total };
});

const originAllowedDestinations: Record<string, Set<string>> = {
  station15: new Set(['station18', 'station19', 'station17', 'station20', 'station10', 'station13']),
  station01: new Set([...Array.from({ length: 22 }, (_, index) => `station${String(index + 1).padStart(2, '0')}`)].filter((id) => id !== 'station19')),
  station07: new Set([...Array.from({ length: 22 }, (_, index) => `station${String(index + 1).padStart(2, '0')}`)].filter((id) => !['station06', 'station16'].includes(id))),
  station21: new Set([...Array.from({ length: 22 }, (_, index) => `station${String(index + 1).padStart(2, '0')}`)].filter((id) => !['station19', 'station18'].includes(id))),
  station09: new Set(['station15', 'station17', 'station20', 'station11', 'station05', 'station12', 'station10', 'station13', 'station14']),
  station11: new Set(['station10', 'station13', 'station12', 'station14', 'station05', 'station15', 'station06', 'station18', 'station19', 'station21', 'station17', 'station20']),
  station05: new Set(['station18', 'station19', 'station21', 'station17', 'station20']),
  station16: new Set([...Array.from({ length: 22 }, (_, index) => `station${String(index + 1).padStart(2, '0')}`)].filter((id) => id !== 'station02')),
  station12: new Set(['station14', 'station06', 'station15', 'station05', 'station19', 'station17', 'station20', 'station21', 'station01', 'station18']),
  station08: new Set([...Array.from({ length: 22 }, (_, index) => `station${String(index + 1).padStart(2, '0')}`)].filter((id) => !['station02', 'station16', 'station07'].includes(id))),
  station14: new Set(['station18', 'station06', 'station15', 'station05', 'station19', 'station01', 'station21', 'station17', 'station20']),
  station10: new Set(['station11', 'station12', 'station13', 'station14', 'station18', 'station21', 'station17', 'station20', 'station01', 'station19', 'station06', 'station15', 'station05']),
  station13: new Set(['station14', 'station06', 'station15', 'station05', 'station18', 'station19', 'station01', 'station17', 'station20', 'station21']),
};
const originsThatCanReachEverywhere = new Set(['station17', 'station20']);
const blockedDestinationIds = new Set(['station15']);
const explicitlyBlockedRoutes = new Set(['station21:station18', 'station21:station19', 'station18:station21', 'station18:station19', 'station18:station14', 'station18:station05', 'station18:station06', 'station18:station19', 'station18:station01', 'station18:station21', 'station18:station17', 'station18:station20', 'station19:station18', 'station19:station14', 'station07:station06', 'station07:station16', 'station01:station19', 'station01:station14', 'station10:station09', 'station13:station09', 'station14:station09', 'station11:station09', 'station05:station09', 'station05:station14', 'station12:station09', 'station11:station10', 'station13:station11', 'station12:station11', 'station14:station11', 'station05:station11', 'station15:station11', 'station06:station11', 'station06:station14', 'station18:station11', 'station14:station12', 'station05:station12', 'station19:station12', 'station19:station14', 'station18:station12', 'station13:station10', 'station12:station10', 'station14:station10', 'station18:station10', 'station19:station10', 'station01:station10', 'station06:station10', 'station05:station10', 'station14:station13', 'station06:station13', 'station05:station13', 'station18:station13', 'station19:station13', 'station01:station13']);

function peopleText(value = 0) { 
  return lang.value === 'th' ? `${value} คน` : `${value} people`; 
}

// Resolve current translations and round proximity up to 10 m for the recommendation.
const boardingDetails = computed(() => {
  const suggestion = boardingSuggestion.value;
  if (!suggestion) return null;
  const station = stations.value.find((item) => item.id === suggestion.stationId);
  const route = availableRoutes.value.find((item) => item.id === suggestion.line);
  if (!station || !route) return null;
  return { station: stationName(station), line: lang.value === 'th' ? route.nameTH || route.name : route.name,
    meters: Math.ceil(suggestion.distanceMeters / 10) * 10 };
});

function minuteText(value: number | null) {
  if (value === null) return lang.value === 'th' ? 'ยังไม่มีข้อมูล' : 'Unavailable';
  return lang.value === 'th' ? `${value} นาที` : `${value} min`;
 }

function stationStatusLabel(status = 'LOW', customLabel?: string) {
  // Prefer the server-provided label so custom statuses remain readable to users.
  if (customLabel) return customLabel;
  if (status.startsWith('custom_')) return status;
  if (status === 'UNKNOWN') return lang.value === 'th' ? 'นอกช่วงที่กำหนด' : 'Outside ranges';
  if (status.toUpperCase() === 'HIGH') return lang.value === 'th' ? 'หนาแน่น' : 'HIGH';
  if (status.toUpperCase() === 'MEDIUM') return lang.value === 'th' ? 'ปานกลาง' : 'MEDIUM';
  return lang.value === 'th' ? 'ปกติ' : 'LOW';
}

function stationColorStyle(station: Station) {
  const color = station.statusColor;
  // This style is inserted into popup HTML: accept only six-digit HEX from the API.
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return '';
  const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255);
  // Relative luminance chooses the higher-contrast black or white label for any chosen color.
  const linear = rgb.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return `background:${color};color:${luminance > 0.179 ? '#000000' : '#ffffff'} !important`;
}

function stationStatusClass(status = 'LOW') {
  if (status.startsWith('custom_')) return 'custom';
  if (status === 'UNKNOWN') return 'unknown';
  if (status.toUpperCase() === 'HIGH') return 'high';
  if (status.toUpperCase() === 'MEDIUM') return 'medium';
  return 'low';
}

function escapeHtml(value: string) { 
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character)); 
}

const popupIcons = {
  bus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5A4.5 4.5 0 0 1 9.5 2h5A4.5 4.5 0 0 1 19 6.5V17c0 .75-.4 1.4-1 1.75V20a1 1 0 0 1-2 0v-1H8v1a1 1 0 0 1-2 0v-1.25c-.6-.35-1-.99-1-1.75V6.5Z" fill="currentColor"/><rect x="7" y="6" width="10" height="5" rx="1" fill="#fff"/><circle cx="8.5" cy="15.5" r="1.25" fill="#fff"/><circle cx="15.5" cy="15.5" r="1.25" fill="#fff"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 18a4 4 0 0 1 6.5 1"/></svg>',
  location: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"/></svg>',
};

function stationPopupHtml(station: Station) {
  const statusClass = stationStatusClass(station.status);
  const isFavorite = favoriteIds.value.includes(station.id);
  return `<div class="station-map-popup"><div class="station-map-popup-title-row"><div class="station-map-popup-title">${escapeHtml(stationName(station))}</div><button class="station-favorite-button${isFavorite ? ' is-favorite' : ''}" type="button" aria-label="${isFavorite ? 'Remove favorite' : 'Add favorite'}" aria-pressed="${isFavorite}">${popupIcons.heart}</button></div><div class="station-map-popup-row"><span class="station-map-popup-icon bus">${popupIcons.bus}</span><strong>${lang.value === 'th' ? 'รถจะมาถึง' : 'Bus Arrival'}</strong><b>${stationArrivalText(station)}</b></div><div class="station-map-popup-row"><span class="station-map-popup-icon people">${popupIcons.people}</span><strong>${lang.value === 'th' ? 'ผู้โดยสารรออยู่' : 'People Waiting'}</strong><b>${peopleText(station.waiting || 0)}</b></div><div class="station-map-popup-row"><span class="station-map-popup-icon location">${popupIcons.location}</span><strong>${lang.value === 'th' ? 'สถานะสถานี' : 'Station Status'}</strong><b class="station-map-popup-status ${statusClass}" style="${stationColorStyle(station)}">${escapeHtml(stationStatusLabel(station.status, station.statusLabel))}</b></div></div>`;
}

function bindStationPopupActions(element: HTMLElement, station: Station) {
  const favoriteButton = element.querySelector<HTMLButtonElement>('.station-favorite-button');
  favoriteButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavorite(station.id);
    favoriteButton.classList.toggle('is-favorite', favoriteIds.value.includes(station.id));
    favoriteButton.setAttribute('aria-pressed', String(favoriteIds.value.includes(station.id)));
    favoriteButton.setAttribute('aria-label', favoriteIds.value.includes(station.id) ? 'Remove favorite' : 'Add favorite');
  });
}

function refreshStationPopup() {
  const station = stationDetail.value;
  const element = stationOverlay?.element as HTMLElement | undefined;
  if (!station || !element) return;
  element.innerHTML = stationPopupHtml(station);
  bindStationPopupActions(element, station);
}

function closeStationPopup() {
  if (stationPopupTimer) window.clearTimeout(stationPopupTimer);
  stationPopupTimer = undefined;
  if (stationOverlay) stationOverlay.setMap(null);
  stationOverlay = null;
  stationOverlayStationId = '';
  stationDetail.value = null;
}

function toggleStationPopup(station: Station) {
  closeBusPopup();
  if (stationOverlayStationId === station.id) { closeStationPopup(); return; }
  closeStationPopup();
  stationDetail.value = station;
  stationOverlayStationId = station.id;
  const overlay = new window.google.maps.OverlayView();
  overlay.onAdd = () => { const element = document.createElement('div'); element.className = 'station-map-popup-host'; element.innerHTML = stationPopupHtml(station); bindStationPopupActions(element, station); overlay.element = element; overlay.getPanes().floatPane.appendChild(element); };
  overlay.draw = () => { if (!overlay.element) return; const projection = overlay.getProjection(); if (!projection) return; const point = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(station.lat, station.lng)); if (!point) return; overlay.element.style.left = `${point.x}px`; overlay.element.style.top = `${point.y}px`; };
  overlay.onRemove = () => { overlay.element?.remove(); overlay.element = null; };
  stationOverlay = overlay;
  overlay.setMap(campusMap);
  stationPopupTimer = window.setTimeout(() => {
    if (stationOverlay === overlay) closeStationPopup();
  }, 2 * 60 * 1000);
}

function loadGoogleMapsScript() {
  if (window.google?.maps) return Promise.resolve(); if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise<void>((resolve, reject) => { const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; if (!key) { reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not configured')); return; } let settled = false; const fail = (text: string) => { if (settled) return; settled = true; googleMapsPromise = null; reject(new Error(text)); }; window.gm_authFailure = () => { mapError.value = 'Google Maps API key is invalid or blocked'; fail(mapError.value); }; window.initMfuUserMap = () => { settled = true; resolve(); }; const existing = document.querySelector<HTMLScriptElement>('script[data-mfu-google-maps]'); if (existing) { existing.addEventListener('load', () => window.google?.maps ? resolve() : fail('Google Maps failed to load')); return; } const script = document.createElement('script'); script.dataset.mfuGoogleMaps = 'true'; script.async = true; script.defer = true; script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=initMfuUserMap&loading=async`; script.onerror = () => fail('Google Maps failed to load'); document.head.appendChild(script); }); return googleMapsPromise;
}

function removeMapOverlays() { 
  clearBusMarkers();
  [...mapMarkers, ...mapPolylines, ...busMarkers.map(({ marker }) => marker)].forEach((item) => item.setMap(null));
  userLocationMarker?.setMap(null);
  userLocationMarker = null;
  closeUserLocationPopup();
  mapMarkers = []; mapPolylines = []; busMarkers = []; closeBusPopup();
}

async function loadRoute(line: Line) { 
  const remoteRoute = routes.value.find((route) => route.id === line && route.enabled !== false);
  if (routesLoaded.value) {
    return remoteRoute?.geometry?.coordinates?.map(([lng, lat]) => ({ lat, lng })) || [];
  }
  try { const response = await fetch(new URL(`../assets/routes/polyline_${line}_mfu.geojson`, import.meta.url)); 
    const geojson = await response.json(); const coordinates = geojson.features?.flatMap((feature: any) => feature.geometry?.coordinates || []) || geojson.geometry?.coordinates || []; 
    return coordinates.map(([lng, lat]: number[]) => ({ lat, lng })); } 
    catch { 
      return lineStations(line).map(({ lat, lng }) => ({ lat, lng })); 
  } 
}
async function renderGoogleMap() {
  if (!campusMap || !window.google?.maps || !stations.value.length || !mapElement.value) return;
  if (campusMap.getDiv?.() !== mapElement.value) return;
  const generation = ++mapRenderGeneration;
  const lineSelection = selectedLine.value;
  const lines: readonly Line[] = lineSelection === 'all' ? availableRoutes.value.map((route) => route.id) : [lineSelection];
  const colors: Record<Line, string> = Object.fromEntries(availableRoutes.value.map((route) => [route.id, route.color])) as Record<Line, string>;
  const points: Array<{ lat: number; lng: number }> = [];
  const selectedFrom = stations.value.find((station) => station.id === selectedFromId.value);
  const selectedTo = stations.value.find((station) => station.id === selectedToId.value);
  const routePaths = new Map<Line, RoutePoint[]>();
  selectedRouteAvailable.value = false;
  selectedRideLine.value = null;
  boardingSuggestion.value = null;
  routePlanReady.value = false;

  removeMapOverlays();
  for (const line of lines) {
    const path = await loadRoute(line);
    if (generation !== mapRenderGeneration) return;
    routePaths.set(line, path);
    routePathCache.set(line, path);
    points.push(...path);
    if (path.length > 1 && !(selectedFrom && selectedTo)) {
      mapPolylines.push(new window.google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: colors[line],
        strokeOpacity: 0.95,
        strokeWeight: 5,
        zIndex: line === 'line1' ? 2 : 1,
        map: campusMap,
      }));
    }
  }

  // Both the summary and suggested boarding stop use the same direction checks.
  const directionRules = { allowed: originAllowedDestinations, everywhere: originsThatCanReachEverywhere,
    blockedDestinations: blockedDestinationIds, blockedPairs: explicitlyBlockedRoutes };
  const ride = selectedFrom && selectedTo ? findRide(selectedFrom, selectedTo, routePaths, directionRules) : null;
  selectedRouteAvailable.value = ride !== null;
  selectedRideLine.value = ride?.line || null;
  if (selectedFrom && selectedTo && !ride) {
    boardingSuggestion.value = findBoardingStop(selectedFrom, selectedTo, stations.value, routePaths, directionRules);
  }
  routePlanReady.value = true;
  const stationList = selectedFrom && selectedTo
    ? stations.value.filter((station) => station.id === selectedFrom.id || station.id === selectedTo.id || station.id === boardingSuggestion.value?.stationId)
    : stations.value.filter((station) => lineSelection === 'all' || station.lines?.includes(lineSelection));
  stationList.forEach((station) => { points.push({ lat: station.lat, lng: station.lng }); const marker = new window.google.maps.Marker({ position: { lat: station.lat, lng: station.lng }, map: campusMap, title: stationName(station), icon: { url: busStopUrl, scaledSize: new window.google.maps.Size(58, 58), anchor: new window.google.maps.Point(29, 50) } }); marker.set('stationId', station.id); marker.addListener('click', () => toggleStationPopup(station)); mapMarkers.push(marker); });
  points.push(...renderBusMarkers(routePaths));
  // An alternative ride starts at the recommended stop; do not draw a bus connection from the original origin.
  const displayedRide = ride || boardingSuggestion.value;
  if (displayedRide) {
      mapPolylines.push(new window.google.maps.Polyline({
        path: displayedRide.path,
        geodesic: true,
        strokeColor: '#2196f3',
        strokeOpacity: 1,
        strokeWeight: 6,
        zIndex: 10,
        map: campusMap,
      }));
  }
  if (userLocation.value) renderUserLocationMarker(userLocation.value);
}
async function overviewMinimumZoom() {
    const routes = await Promise.all(availableRoutes.value.map((route) => loadRoute(route.id)));
    const routePoints = routes.flat();
    const element = mapElement.value;
    if (element && routePoints.length) {
      // Web Mercator world coordinates let us fit routes without moving the camera.
      const worldY = (lat: number) => {
        const sin = Math.sin(lat * Math.PI / 180);
        return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
      };
      const xs = routePoints.map((point: { lng: number }) => point.lng / 360);
      const ys = routePoints.map((point: { lat: number }) => worldY(point.lat));
      const width = Math.max(1, element.clientWidth - 100);
      const height = Math.max(1, element.clientHeight - 230);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      if (spanX > 0 && spanY > 0) {
        const overviewZoom = Math.floor(Math.min(
          Math.log2(width / (256 * spanX)),
          Math.log2(height / (256 * spanY)),
          17,
        ));
        return overviewZoom;
      }
    }
    return 15;
}
// Ignore invalid or unavailable tab storage so the map can use its default camera.
function readMapViewport(): MapViewport | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(MAP_VIEWPORT_KEY) || 'null');
    if (!value || !Number.isFinite(value.center?.lat) || !Number.isFinite(value.center?.lng)
      || Math.abs(value.center.lat) > 85 || Math.abs(value.center.lng) > 180
      || !Number.isFinite(value.zoom) || value.zoom < 0 || value.zoom > 22) return null;
    return { center: { lat: value.center.lat, lng: value.center.lng }, zoom: value.zoom };
  } catch {
    return null;
  }
}

// Keep the camera in this browser tab, including when a refresh happens before map idle.
function saveMapViewport() {
  const center = campusMap?.getCenter();
  const zoom = campusMap?.getZoom();
  if (!center || !Number.isFinite(zoom)) return;
  savedMapViewport = { center: { lat: center.lat(), lng: center.lng() }, zoom };
  try {
    sessionStorage.setItem(MAP_VIEWPORT_KEY, JSON.stringify(savedMapViewport));
  } catch {
    // Retain the in-memory camera when browser storage is unavailable.
  }
}

async function initGoogleMap() {
  try {
    await loadGoogleMapsScript();
    if (!mapElement.value) return;

    const minZoom = await overviewMinimumZoom();
    if (!mapElement.value) return;

    mapElement.value.style.opacity = '0';
    campusMap = new window.google.maps.Map(mapElement.value, {
      center: savedMapViewport?.center || { lat: 20.0465, lng: 99.895 },
      zoom: savedMapViewport ? Math.max(minZoom, Math.min(18, savedMapViewport.zoom)) : 17,
      minZoom,
      maxZoom: 18,
      restriction: { latLngBounds: { north: 20.064, south: 20.0385, east: 99.904, west: 99.8875 }, strictBounds: false },
      disableDefaultUI: true,
      styles: MFU_MAP_STYLES,
      clickableIcons: false,
      gestureHandling: 'greedy'
    });
    if (savedMapViewport) autoCenterOnLocation = false;
    campusMap.addListener('idle', saveMapViewport);
    campusMap.addListener('dragstart', () => { autoCenterOnLocation = false; });
    campusMap.addListener('zoom_changed', () => { autoCenterOnLocation = false; });
    mapResizeObserver?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      mapResizeObserver = new ResizeObserver(() => {
        window.google?.maps?.event.trigger(campusMap, 'resize');
      });
      mapResizeObserver.observe(mapElement.value);
    }
    window.google.maps.event.addListenerOnce(campusMap, 'idle', () => { if (mapElement.value) mapElement.value.style.opacity = '1'; });
    campusMap.addListener('click', () => { closeBusPopup(); closeStationPopup(); closeUserLocationPopup(); if (selectedLine.value !== 'all') selectedLine.value = 'all'; });
    await renderGoogleMap();
  } catch (error) {
    if (mapElement.value) mapElement.value.style.opacity = '1';
    mapError.value = error instanceof Error ? error.message : 'Google Maps failed to load';
  }
}

async function ensureHomeMap() {
  if (page.value !== 'home') return;
  await nextTick();
  if (!mapElement.value) return;

  if (!campusMap || campusMap.getDiv?.() !== mapElement.value) {
    saveMapViewport();
    mapRenderGeneration++;
    removeMapOverlays();
    campusMap = null;
    await initGoogleMap();
    return;
  }

  window.google?.maps?.event.trigger(campusMap, 'resize');
  await renderGoogleMap();
}
let busFeed: ReturnType<typeof startBusFeed<Bus>> | undefined;
let publicDataTimer: number | undefined;
let publicDataRequestActive = false;

function combinePublicStations(stationLists: Station[][]) {
  const stationMap = new Map<string, Station>();
  stationLists.flat().forEach((station) => {
    const old = stationMap.get(station.id);
    stationMap.set(station.id, { ...old, ...station, lines: Array.from(new Set([...(old?.lines || []), ...(station.lines || [])])) } as Station);
  });
  return [...stationMap.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function routeIdsForData(routeList: ShuttleRoute[] | null) {
  if (routeList === null) return ['line1', 'line2'];
  return routeList.filter((route) => route.enabled !== false).map((route) => route.id);
}

function syncRouteControls(routeList: ShuttleRoute[] | null) {
  routeIdsForData(routeList).forEach((line) => {
    if (expandedLines.value[line] === undefined) expandedLines.value[line] = false;
    if (transitSearch.value[line] === undefined) transitSearch.value[line] = '';
  });
  if (selectedLine.value !== 'all' && !routeIdsForData(routeList).includes(selectedLine.value)) selectedLine.value = 'all';
}

function publicDataSignature(nextStations: Station[], nextRoutes: ShuttleRoute[]) {
  // Include statusColor so a color-only settings update also refreshes station popups.
  return JSON.stringify({
    stations: nextStations.map(({ id, name, nameTH, lat, lng, lines, waiting, status, statusColor, statusLabel }) => ({ id, name, nameTH, lat, lng, lines, waiting, status, statusColor, statusLabel })),
    routes: nextRoutes.map(({ id, name, nameTH, color, enabled, geometry, revision, updatedAt }) => ({ id, name, nameTH, color, enabled, geometry, revision, updatedAt })),
  });
}

function receiveBuses(nextBuses: Bus[]) {
  buses.value = estimateGpsMotion(nextBuses, Date.now());
  updateLiveBusMarkers();
  refreshStationPopup();
  refreshBusPopup();
}

function refreshBusFeedOnReturn() {
  if (document.visibilityState === 'visible') void busFeed?.refresh();
}

async function refreshPublicData() {
  if (publicDataRequestActive) return;
  publicDataRequestActive = true;
  try {
    const routeList = await api.getRoutes();
    const nextStations = combinePublicStations(await Promise.all(routeIdsForData(routeList).map((line) => api.getStations(line))));
    if (publicDataSignature(nextStations, routeList) === publicDataSignatureValue) return;

    // Reload admin changes without a full page refresh. Clearing the route cache makes the map use new geometry.
    stations.value = nextStations;
    routes.value = routeList;
    routesLoaded.value = true;
    syncRouteControls(routeList);
    routePathCache.clear();
    if (stationDetail.value) closeStationPopup();
    publicDataSignatureValue = publicDataSignature(nextStations, routeList);
  } catch {
    // Keep the current station and route data when a background refresh fails.
  } finally {
    publicDataRequestActive = false;
  }
}

let publicDataSignatureValue = '';

async function loadData() {
  isLoading.value = true;
  message.value = '';
  try {
    const routeList = await api.getRoutes().catch(() => null);
    const stationLists = await Promise.all(routeIdsForData(routeList).map(line => api.getStations(line)));
    const nextStations = combinePublicStations(stationLists);
    stations.value = nextStations;
    routes.value = routeList || [];
    routesLoaded.value = routeList !== null;
    syncRouteControls(routeList);
    publicDataSignatureValue = publicDataSignature(nextStations, routes.value);
  } catch (error) {
    message.value = error instanceof Error ? error.message : t.value.mapLoadFailed;
  } finally {
    isLoading.value = false;
  }
}

onMounted(async () => {
  // Capture outside clicks even when a toolbar control stops event bubbling.
  document.addEventListener('click', dismissBusPopupOutsideMap, true);
  window.addEventListener('pagehide', saveMapViewport);
  window.addEventListener('online', refreshBusFeedOnReturn);
  document.addEventListener('visibilitychange', refreshBusFeedOnReturn);
  busFeed = startBusFeed<Bus>({
    client: supabase, loadSnapshot: signal => api.getBusSnapshot(signal), onBuses: receiveBuses,
  });
  gpsClockTimer = window.setInterval(() => {
    gpsNow.value = Date.now();
    updateLiveBusMarkers();
    refreshStationPopup();
    refreshBusPopup();
  }, 1000);
  await loadData();
  await initGoogleMap();
  startUserLocationTracking();
  publicDataTimer = window.setInterval(() => void refreshPublicData(), 15000);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', dismissBusPopupOutsideMap, true);
  closeBusPopup();
  saveMapViewport();
  window.removeEventListener('pagehide', saveMapViewport);
  clearBusMarkers();
  mapResizeObserver?.disconnect();
  busFeed?.stop();
  window.removeEventListener('online', refreshBusFeedOnReturn);
  document.removeEventListener('visibilitychange', refreshBusFeedOnReturn);
  if (gpsClockTimer) window.clearInterval(gpsClockTimer);
  if (publicDataTimer) window.clearInterval(publicDataTimer);
  if (userLocationWatchId !== undefined) navigator.geolocation?.clearWatch(userLocationWatchId);
  closeUserLocationPopup();
  clearTimeout(successModalTimer);
});
watch(page, (next) => { closeBusPopup(); if (next === 'home') void ensureHomeMap(); });
watch(lang, refreshStationLanguage);
watch([selectedLine, stations, routes, selectedFromId, selectedToId], () => {
  selectedRouteAvailable.value = false;
  selectedRideLine.value = null;
  boardingSuggestion.value = null;
  routePlanReady.value = false;
  void renderGoogleMap();
}, { deep: true });
</script>

<template>
  <main class="web-shell"><section class="phone">
    <header v-if="page === 'home'" class="app-header home-header"><button class="menu-btn appbar-menu-btn" type="button" aria-label="Menu" @click="isMenuOpen = true"><span></span><span></span><span></span></button><div class="wordmark"><span>MFU</span> <b>SHUTTLE BUS</b></div><div class="language-switch" role="group" :aria-label="lang === 'th' ? 'เลือกภาษา' : 'Select language'">
        <button type="button" :class="{ active: lang === 'th' }" :aria-pressed="lang === 'th'" aria-label="ภาษาไทย" lang="th" @click="setLanguage('th')">TH</button>
        <span aria-hidden="true">|</span>
        <button type="button" :class="{ active: lang === 'en' }" :aria-pressed="lang === 'en'" aria-label="English" lang="en" @click="setLanguage('en')">EN</button>
      </div></header>
    <header v-else class="app-header page-header"><button class="back-btn" type="button" :aria-label="t.home" @click="goHome">‹</button><div class="page-title">{{ page === 'transit' ? t.transit : page === 'favorites' ? t.favorites : page === 'report' ? t.report : page === 'language' ? t.language : t.settings }}</div><button class="page-home-btn" type="button" :aria-label="t.home" :title="t.home" @click="goHome"><svg class="home-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.4 12 3l9 7.4v9.1c0 .8-.7 1.5-1.5 1.5H4.5c-.8 0-1.5-.7-1.5-1.5z" fill="currentColor" /><path d="M9.2 21v-5.7h5.6V21" fill="#fff" /></svg></button></header>
    <p v-if="message" class="notice">{{ message }}</p>
    <div v-if="isMenuOpen" class="menu-backdrop" @click.self="isMenuOpen = false">
      <aside class="menu-drawer" role="dialog" aria-modal="true" :aria-label="t.settings">
        <header class="drawer-header">
          <button class="drawer-close material-icon" type="button" :aria-label="t.close" @click="isMenuOpen = false">&#xf570;</button>
          <div class="drawer-brand"><span>MFU</span> <b>SHUTTLE BUS</b></div>
        </header>
        <nav class="drawer-navigation">
          <p class="drawer-section">{{ t.transitSection }}</p>
          <button class="drawer-item" type="button" @click="openPage('transit')">
            <i class="drawer-icon material-icon" aria-hidden="true">&#xe1d5;</i>
            <span>{{ t.transit }}</span><b class="material-icon" aria-hidden="true">&#xe09c;</b>
          </button>
          <button class="drawer-item" type="button" @click="openPage('favorites')">
            <i class="drawer-icon material-icon" aria-hidden="true">&#xe25c;</i>
            <span>{{ t.favorites }}</span><b class="material-icon" aria-hidden="true">&#xe09c;</b>
          </button>
          <p class="drawer-section support-section">{{ t.supportSection }}</p>
          <button class="drawer-item" type="button" @click="openPage('report')">
            <i class="drawer-icon material-icon" aria-hidden="true">&#xe30b;</i>
            <span>{{ t.report }}</span><b class="material-icon" aria-hidden="true">&#xe09c;</b>
          </button>
        </nav>
      </aside>
    </div>

  <section v-if="page === 'home'" class="screen home-screen">
      <!-- Google Maps owns this element's children; keep Vue content outside it. -->
      <div ref="mapElement" class="campus-map google-map" role="application" aria-label="MFU campus map"></div>
      <div v-if="mapError" class="map-error" role="alert">{{ mapError.includes('API_KEY') ? t.mapKeyMissing : t.mapLoadFailed }}</div>
      <div v-if="isTripSearchCollapsed" class="collapsed-trip" @click="isTripSearchCollapsed = false"><strong>{{ fromQuery }} <span>→</span> {{ toQuery }}</strong><span>⌄</span></div><div v-else class="trip-card"><div class="trip-marker-column" aria-hidden="true"><span class="origin-marker"></span><i></i><span class="destination-marker"></span></div><div class="trip-fields"><label><span>{{ t.from }}</span><div class="input-wrap"><input v-model="fromQuery" :placeholder="t.fromStation" @focus="activeSearchField = 'from'; showStationSuggestions = true" @blur="hideStationSuggestionsSoon" @input="selectedFromId = ''; showStationSuggestions = true" /><button v-if="fromQuery" class="clear-input" type="button" @click="clearStation('from')">×</button></div></label><div v-if="showStationSuggestions && activeSearchField === 'from'" class="suggestions"><button v-for="station in fromMatches" :key="station.id" type="button" @click="setStation('from', station)"><span :class="{ favorite: favoriteIds.includes(station.id) }">{{ favoriteIds.includes(station.id) ? '♥' : '●' }}</span>{{ stationName(station) }}</button></div><label><span>{{ t.to }}</span><div class="input-wrap"><input v-model="toQuery" :placeholder="t.toStation" @focus="activeSearchField = 'to'; showStationSuggestions = true" @blur="hideStationSuggestionsSoon" @input="selectedToId = ''; showStationSuggestions = true" /><button v-if="toQuery" class="clear-input" type="button" @click="clearStation('to')">×</button></div></label><div v-if="showStationSuggestions && activeSearchField === 'to'" class="suggestions"><button v-for="station in toMatches" :key="station.id" type="button" @click="setStation('to', station)"><span :class="{ favorite: favoriteIds.includes(station.id) }">{{ favoriteIds.includes(station.id) ? '♥' : '●' }}</span>{{ stationName(station) }}</button></div></div><div class="trip-actions"><button v-if="selectedFromId && selectedToId" class="icon-action" type="button" @click="isTripSearchCollapsed = true">⌃</button><button class="icon-action" type="button" :disabled="!fromQuery && !toQuery" :aria-label="t.swap" @click="swapStations">⇅</button></div></div>
      <div class="line-selector"><button v-for="route in availableRoutes" :key="route.id" :class="{ active: selectedLine === route.id, 'line-two-active': route.id === 'line2' && selectedLine === route.id }" type="button" @click.stop="selectedLine = route.id"><img :src="busIconUrl" alt="" :style="{ filter: route.id === 'line2' ? 'grayscale(1)' : undefined }" />{{ route.id === 'line1' ? t.line1 : route.id === 'line2' ? t.line2 : (lang === 'th' ? route.nameTH || route.name : route.name) }}</button></div>

      <div v-if="tripEstimate && isTripSearchCollapsed" class="trip-estimate"><div class="trip-estimate-head"><div class="trip-estimate-title"><strong>{{ t.tripSummary }}</strong><button class="trip-estimate-close" type="button" :aria-label="t.close" @click="resetTrip">×</button></div><span>{{ fromQuery }} <b>→</b> {{ toQuery }}</span></div><template v-if="tripEstimate.available"><div class="trip-estimate-row"><span class="station-map-popup-icon bus" aria-hidden="true" v-html="popupIcons.bus"></span><strong>{{ t.busArrival }}</strong><b>{{ tripEstimate.arrivalText }}</b></div><div class="trip-estimate-row"><span class="trip-estimate-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="img"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg></span><strong>{{ t.rideTime }}</strong><b>{{ tripEstimate.rideMinutes }} {{ t.minutes }}</b></div><div class="trip-estimate-row total"><span class="trip-estimate-icon" aria-hidden="true"><svg viewBox="0 0 24 24" role="img"><circle cx="12" cy="13" r="7" /><path d="M12 13V9M9 3h6M12 3v3M17 6l2-2" /></svg></span><strong>{{ t.totalTime }}</strong><b>{{ tripEstimate.totalText }}</b></div></template><div v-else class="trip-estimate-unavailable" role="status">
        <p v-if="!routePlanReady">{{ lang === 'th' ? 'กำลังคำนวณเส้นทาง…' : 'Calculating route…' }}</p>
        <p v-else-if="selectedFromId === selectedToId">{{ lang === 'th' ? 'ต้นทางและปลายทางเป็นสถานีเดียวกัน' : 'Origin and destination are the same station.' }}</p>
        <template v-else>
          <!-- Show the boarding suggestion or its specific fallback without a duplicate route warning. -->
          <div v-if="boardingDetails" class="boarding-suggestion">
            <strong>{{ lang === 'th' ? 'สถานีแนะนำสำหรับขึ้นรถ' : 'Recommended boarding station' }}</strong>
            <p class="boarding-stop">{{ boardingDetails.station }}</p>
            <p>{{ boardingDetails.line }}</p>
            <p>{{ lang === 'th' ? 'ห่างจากต้นทางที่เลือกประมาณ' : 'Approximately' }} <b>{{ boardingDetails.meters }} {{ lang === 'th' ? 'เมตร' : 'm' }}</b>{{ lang === 'th' ? ' (ระยะเส้นตรง)' : ' from selected origin (straight-line)' }}</p>
            <p>{{ lang === 'th' ? 'แนะนำให้ขึ้นรถจากสถานีนี้เพื่อไปยังปลายทาง' : 'Board the bus at this station to reach your destination.' }}</p>
          </div>
          <p v-else>{{ lang === 'th' ? 'ไม่พบสถานีขึ้นรถที่ไปถึงปลายทางได้ภายในระยะเส้นตรง 500 เมตรจากต้นทางที่เลือก กรุณาลองเปลี่ยนต้นทางหรือสายรถ' : 'No boarding station within 500 m of the selected origin (straight-line) has a route to your destination. Try another origin or bus line.' }}</p>
        </template>
      </div></div>

    </section>

    <!-- Transit page: browse shuttle bus lines and stations. -->
    <TransitPage v-else-if="page === 'transit'" :t="t" :lang="lang" :is-loading="isLoading" :routes="routes" :routes-loaded="routesLoaded" :expanded-lines="expandedLines" :transit-search="transitSearch" :line-stations="lineStations" :filtered-line-stations="filteredLineStations" :station-name="stationName" @select="selectTransitStation" />
    <!-- Favorites page: manage saved stations. -->
    <FavoritesPage v-else-if="page === 'favorites'" :t="t" :favorite-stations="favoriteStations" :station-name="stationName" @add="showStationPicker = true" @remove="askRemoveFavorite" />
    <!-- Feedback page: submit a complete feedback form directly. -->
    <FeedbackPage v-else-if="page === 'report'" :key="feedbackFormVersion" :t="t" :is-submitting="isFeedbackSubmitting" @submit="submitFeedback" />
    <!-- Settings page: navigate to transit, favorites, feedback, and language. -->
    <SettingsPage v-else-if="page === 'settings'" :t="t" :language-label="lang === 'th' ? t.languageThai : t.languageEnglish" @open="openPage" />
    <!-- Language page: choose Thai or English. -->
    <LanguagePage v-else-if="page === 'language'" :t="t" :lang="lang" @select="(nextLang) => { setLanguage(nextLang); goHome(); }" />
    <div v-if="showStationPicker" class="modal-backdrop" @click.self="showStationPicker = false">
    <section class="picker-modal"><div class="modal-head"><h2>{{ t.searchStation }}</h2><button type="button" @click="showStationPicker = false">×</button></div><div class="list-search"><svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2" fill="none" stroke="currentColor" stroke-width="2" /><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" /></svg><input v-model="favoriteSearch" autofocus :placeholder="t.findStation" /></div><div class="picker-list"><button v-for="station in favoriteMatches" :key="station.id" type="button" @click="toggleFavorite(station.id); showStationPicker = false"><span>{{ stationName(station) }}</span><span v-if="favoriteIds.includes(station.id)" class="picker-favorite-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z" /></svg></span><b v-else>+</b></button><p v-if="!favoriteMatches.length" class="empty-state">{{ t.noStations }}</p></div></section></div>
    <div v-if="confirmStation" class="modal-backdrop" @click.self="confirmStation = null"><section class="confirm-modal"><h2>{{ t.remove }}</h2><p>{{ t.confirmRemove }}</p><strong>{{ stationName(confirmStation) }}</strong><div class="modal-actions"><button class="secondary-btn" type="button" @click="confirmStation = null">{{ t.cancel }}</button><button class="danger-btn" type="button" @click="confirmRemoveFavorite">{{ t.remove }}</button></div></section></div>
    <Transition name="feedback-success">
      <div v-if="successModal" class="modal-backdrop feedback-success-backdrop">
        <section class="success-modal" role="status" aria-live="polite" aria-atomic="true">
          <span class="success-icon" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2" opacity=".25" />
              <path d="m15 24 6 6 12-13" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <h2>{{ t.success }}</h2>
          <p>{{ t.successText }}</p>
        </section>
      </div>
    </Transition>
  </section></main>
</template>
