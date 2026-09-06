<script setup lang="ts">
// Main application shell: owns shared state, map rendering, and page navigation.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { api, type Bus, type Station } from './services/api';
import busUrl from '../assets/gemcar_right.png';
import busIconUrl from '../assets/bus.png';
import busStopUrl from '../assets/bus_stop_2.png';
import thaiFlagUrl from '../assets/thai_flag.png';
import englishFlagUrl from '../assets/eng_flag.png';
import TransitPage from './pages/TransitPage.vue';
import FavoritesPage from './pages/FavoritesPage.vue';
import FeedbackPage from './pages/FeedbackPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import LanguagePage from './pages/LanguagePage.vue';
import type { Lang } from './types';

type Page = 'home' | 'transit' | 'favorites' | 'report' | 'settings' | 'language';
type Line = 'line1' | 'line2';
type GoogleMap = any;

declare global {
  interface Window { google?: any; gm_authFailure?: () => void; initMfuUserMap?: () => void; }
}

const LANG_KEY = 'mfu_user_language';
const FAVORITES_KEY = 'favorite_stations';
const fallbackFavoritesKey = 'mfu_user_favorites';
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
const isFeedbackSubmitting = ref(false);
const mapElement = ref<HTMLElement | null>(null);
const selectedRouteAvailable = ref(false);

let campusMap: GoogleMap = null;
let mapMarkers: any[] = [];
let mapPolylines: any[] = [];
let busMarkers: any[] = [];
let stationOverlay: any = null;
let stationOverlayStationId = '';
let mapRenderGeneration = 0;
let googleMapsPromise: Promise<void> | null = null;

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
      required: 'กรุณากรอกข้อมูลให้ครบถ้วน', feedback: 'ส่งข้อเสนอแนะ', feedbackFormTitle: 'แบบฟอร์มข้อเสนอแนะ', feedbackName: 'ชื่อ', feedbackEmail: 'อีเมลส่วนตัว', feedbackSubmit: 'ส่งข้อเสนอแนะ', tripSummary: 'สรุปการเดินทาง', noDirectRoute: 'ไม่มีเส้นทางรถตรงระหว่างสองสถานีนี้', minutes: 'นาที', busArrival: 'รถจะมาถึงใน', rideTime: 'เวลานั่งบนรถ', totalTime: 'รวมเวลาเดินทาง',
      success: 'สำเร็จ', successText: 'ส่งข้อเสนอแนะเรียบร้อยแล้ว', language: 'ภาษา',
      languageEnglish: 'English', languageThai: 'ไทย', transitSection: 'การเดินทาง', supportSection: 'ช่วยเหลือ', loading: 'กำลังโหลดข้อมูล...', mapKeyMissing: 'กรุณาตั้งค่า Google Maps API key ในไฟล์ frontend-vue/.env', mapLoadFailed: 'ไม่สามารถโหลด Google Maps ได้', ratingQuestions: ['การบริการที่สถานี', 'สภาพรถรับส่ง', 'มารยาทและความปลอดภัยในการขับรถ', 'ความสุภาพของพนักงานขับรถ', 'ความพึงพอใจโดยรวม'], ratingHint: 'แตะดาวเพื่อให้คะแนน',
  },
  en: {
    title: 'MFU SHUTTLE BUS', home: 'Home', transit: 'MFU Transit', favorites: 'Favorite Stations', report: 'Feedback', settings: 'Settings', 
    from: 'From', to: 'To', fromStation: 'From station', toStation: 'To station', swap: 'Swap stations', close: 'Close', line1: 'Line 1', line2: 'Line 2', all: 'All', stations: 'stations',
    mainRoute: 'Main campus route', medicalRoute: 'MFU Medical Center route', findStation: 'Find station', addNew: 'Add new', saveFavorite: 'Save your favorite station', noFavorites: 'No favorite stations yet', remove: 'Delete', cancel: 'Cancel', confirmRemove: 'Remove this station from your favorite list?', searchStation: 'Search station', noStations: 'No stations found',
    required: 'Please complete the required fields', feedback: 'Feedback', feedbackFormTitle: 'Feedback Form', feedbackName: 'Name', feedbackEmail: 'Personal email', feedbackSubmit: 'Submit', tripSummary: 'Trip summary', noDirectRoute: 'No direct bus route between these stations', minutes: 'min', busArrival: 'Bus arrives in', rideTime: 'Ride time', totalTime: 'Total travel time', success: 'Success', successText: 'Feedback sent successfully', language: 'Language',
    languageEnglish: 'English', languageThai: 'ไทย', transitSection: 'Transit', supportSection: 'Support', loading: 'Loading...', mapKeyMissing: 'Set the Google Maps API key in frontend-vue/.env', mapLoadFailed: 'Google Maps could not be loaded', ratingQuestions: ['Station service', 'Bus condition', 'Driving manners and safety', 'Driver politeness', 'Overall satisfaction'], ratingHint: 'Tap a star to rate',
  },
} as const;
const t = computed(() => dictionary[lang.value]);
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
  isFeedbackSubmitting.value = true;
  try {
    const detail = [`Name: ${payload.name}`, `Email: ${payload.email}`, ...payload.ratings.map((rating, index) => `${t.value.ratingQuestions[index]}: ${rating}/5`)].join('\n');
    await api.sendReport('Feedback', detail, '-');
    successModal.value = true;
  } catch (error) {
    message.value = error instanceof Error ? error.message : t.value.mapLoadFailed;
  } finally {
    isFeedbackSubmitting.value = false;
  }
}

function lineStations(line: Line) { 
  return stations.value.filter((station) => station.lines?.includes(line)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })); 
}

function filteredLineStations(line: Line) {
   const query = transitSearch.value[line].trim().toLowerCase(); return lineStations(line).filter((station) => !query || stationName(station).toLowerCase().includes(query) || station.name.toLowerCase().includes(query)); 
  }

function busLineKey(bus: Bus): Line | null {
  if (bus.line === 'line1' || bus.line === '1') 
       return 'line1'; 
  if (bus.line === 'line2' || bus.line === '2') 
      return 'line2'; return null; 
  }

function busPosition(bus: Bus, index: number) { 
  if (typeof bus.lat === 'number' && typeof bus.lng === 'number') 
      return { lat: bus.lat, lng: bus.lng }; const line = busLineKey(bus); 
  if (!line) return null; const route = lineStations(line); 
  if (!route.length) return null; const station = route[Math.min(route.length - 1, Math.max(0, bus.currentStationIndex ?? 0))]; const offset = (index % 3) * 0.000055; 
      return { lat: station.lat + offset, lng: station.lng - offset }; 
  }

function distanceMeters(
  a: { lat: number; lng: number }, 
  b: { lat: number; lng: number }) 
  {
  const earthRadius = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function stationArrivalMinutes(station: Station) {
  return stationArrivalMinutesForLine(station);
}

function stationArrivalMinutesForLine(station: Station, line?: Line) {
  let nearest = Number.POSITIVE_INFINITY;
  buses.value.forEach((bus, index) => {
    if (line && busLineKey(bus) !== line) return;
    const position = busPosition(bus, index);
    if (!position) return;
    nearest = Math.min(nearest, distanceMeters(position, { lat: station.lat, lng: station.lng }));
  });
  if (!Number.isFinite(nearest)) return 0;
  return Math.max(1, Math.ceil(nearest / 10 / 60));
}

const tripEstimate = computed(() => {
  const from = stations.value.find((station) => station.id === selectedFromId.value);
  const to = stations.value.find((station) => station.id === selectedToId.value);
  if (!from || !to) return null;
  const line = (from.lines || []).find((candidate) => to.lines?.includes(candidate)) as Line | undefined;
  if (!line || !selectedRouteAvailable.value) return { available: false as const };
  const rideMinutes = Math.max(1, Math.ceil(distanceMeters(from, to) / 8.33 / 60));
  const arrivalMinutes = stationArrivalMinutesForLine(from, line);
  return { available: true as const, arrivalMinutes, rideMinutes, totalMinutes: arrivalMinutes + rideMinutes };
});

function peopleText(value = 0) { 
  return lang.value === 'th' ? `${value} คน` : `${value} people`; 
}

function minuteText(value: number) { 
  return lang.value === 'th' ? `${value} นาที` : `${value} min`;
 }

function stationStatusLabel(status = 'LOW') {
  if (status.toUpperCase() === 'HIGH') return lang.value === 'th' ? 'หนาแน่น' : 'HIGH';
  if (status.toUpperCase() === 'MEDIUM') return lang.value === 'th' ? 'ปานกลาง' : 'MEDIUM';
  return lang.value === 'th' ? 'ปกติ' : 'LOW';
}

function stationStatusClass(status = 'LOW') {
  if (status.toUpperCase() === 'HIGH') return 'high';
  if (status.toUpperCase() === 'MEDIUM') return 'medium';
  return 'low';
}

function escapeHtml(value: string) { 
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character)); 
}

const popupIcons = {
  bus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4S4 2.5 4 6v10Z"/><path d="M6 6h12v6H6zM4 14h16"/><circle cx="7.5" cy="16.5" r="1"/><circle cx="16.5" cy="16.5" r="1"/></svg>',
  people: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 18a4 4 0 0 1 6.5 1"/></svg>',
  location: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"/></svg>',
};

function stationPopupHtml(station: Station) {
  const statusClass = stationStatusClass(station.status);
  const isFavorite = favoriteIds.value.includes(station.id);
  return `<div class="station-map-popup"><div class="station-map-popup-title-row"><div class="station-map-popup-title">${escapeHtml(stationName(station))}</div><button class="station-favorite-button${isFavorite ? ' is-favorite' : ''}" type="button" aria-label="${isFavorite ? 'Remove favorite' : 'Add favorite'}" aria-pressed="${isFavorite}">${popupIcons.heart}</button></div><div class="station-map-popup-row"><span class="station-map-popup-icon bus">${popupIcons.bus}</span><strong>${lang.value === 'th' ? 'รถจะมาถึง' : 'Bus Arrival'}</strong><b>${minuteText(stationArrivalMinutes(station))}</b></div><div class="station-map-popup-row"><span class="station-map-popup-icon people">${popupIcons.people}</span><strong>${lang.value === 'th' ? 'ผู้โดยสารรออยู่' : 'People Waiting'}</strong><b>${peopleText(station.waiting || 0)}</b></div><div class="station-map-popup-row"><span class="station-map-popup-icon location">${popupIcons.location}</span><strong>${lang.value === 'th' ? 'สถานะสถานี' : 'Station Status'}</strong><b class="station-map-popup-status ${statusClass}">${stationStatusLabel(station.status)}</b></div></div>`;
}

function closeStationPopup() { 
  if (stationOverlay) stationOverlay.setMap(null); stationOverlay = null; stationOverlayStationId = ''; stationDetail.value = null; 
}

function toggleStationPopup(station: Station) {
  if (stationOverlayStationId === station.id) { closeStationPopup(); return; }
  closeStationPopup();
  stationDetail.value = station;
  stationOverlayStationId = station.id;
  const overlay = new window.google.maps.OverlayView();
  overlay.onAdd = () => { const element = document.createElement('div'); element.className = 'station-map-popup-host'; element.innerHTML = stationPopupHtml(station); const favoriteButton = element.querySelector<HTMLButtonElement>('.station-favorite-button'); favoriteButton?.addEventListener('click', (event) => { event.stopPropagation(); toggleFavorite(station.id); favoriteButton.classList.toggle('is-favorite', favoriteIds.value.includes(station.id)); favoriteButton.setAttribute('aria-pressed', String(favoriteIds.value.includes(station.id))); favoriteButton.setAttribute('aria-label', favoriteIds.value.includes(station.id) ? 'Remove favorite' : 'Add favorite'); }); overlay.element = element; overlay.getPanes().floatPane.appendChild(element); };
  overlay.draw = () => { if (!overlay.element) return; const projection = overlay.getProjection(); if (!projection) return; const point = projection.fromLatLngToDivPixel(new window.google.maps.LatLng(station.lat, station.lng)); if (!point) return; overlay.element.style.left = `${point.x}px`; overlay.element.style.top = `${point.y}px`; };
  overlay.onRemove = () => { overlay.element?.remove(); overlay.element = null; };
  stationOverlay = overlay;
  overlay.setMap(campusMap);
}

function loadGoogleMapsScript() {
  if (window.google?.maps) return Promise.resolve(); if (googleMapsPromise) return googleMapsPromise;
  googleMapsPromise = new Promise<void>((resolve, reject) => { const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; if (!key) { reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not configured')); return; } let settled = false; const fail = (text: string) => { if (settled) return; settled = true; googleMapsPromise = null; reject(new Error(text)); }; window.gm_authFailure = () => { mapError.value = 'Google Maps API key is invalid or blocked'; fail(mapError.value); }; window.initMfuUserMap = () => { settled = true; resolve(); }; const existing = document.querySelector<HTMLScriptElement>('script[data-mfu-google-maps]'); if (existing) { existing.addEventListener('load', () => window.google?.maps ? resolve() : fail('Google Maps failed to load')); return; } const script = document.createElement('script'); script.dataset.mfuGoogleMaps = 'true'; script.async = true; script.defer = true; script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=initMfuUserMap&loading=async`; script.onerror = () => fail('Google Maps failed to load'); document.head.appendChild(script); }); return googleMapsPromise;
}

function removeMapOverlays() { 
  [...mapMarkers, ...mapPolylines, ...busMarkers].forEach((item) => item.setMap(null)); mapMarkers = []; mapPolylines = []; busMarkers = []; 
}

async function loadRoute(line: Line) { 
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
  const lines: readonly Line[] = lineSelection === 'all' ? ['line1', 'line2'] : [lineSelection];
  const colors: Record<Line, string> = { line1: '#bc9945', line2: '#5f6368' };
  const points: Array<{ lat: number; lng: number }> = [];
  const selectedFrom = stations.value.find((station) => station.id === selectedFromId.value);
  const selectedTo = stations.value.find((station) => station.id === selectedToId.value);
  const routePaths = new Map<Line, Array<{ lat: number; lng: number }>>();
  const selectedRouteLine = selectedFrom && selectedTo
    ? lines.find((line) => selectedFrom.lines?.includes(line) && selectedTo.lines?.includes(line))
    : undefined;
  selectedRouteAvailable.value = false;

  removeMapOverlays();
  for (const line of lines) {
    const path = await loadRoute(line);
    if (generation !== mapRenderGeneration) return;
    routePaths.set(line, path);
    points.push(...path);
    if (path.length > 1 && !selectedRouteLine) {
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

  const stationList = selectedFrom && selectedTo
    ? stations.value.filter((station) => station.id === selectedFrom.id || station.id === selectedTo.id)
    : stations.value.filter((station) => lineSelection === 'all' || station.lines?.includes(lineSelection));
  stationList.forEach((station) => { points.push({ lat: station.lat, lng: station.lng }); const marker = new window.google.maps.Marker({ position: { lat: station.lat, lng: station.lng }, map: campusMap, title: stationName(station), icon: { url: busStopUrl, scaledSize: new window.google.maps.Size(58, 58), anchor: new window.google.maps.Point(29, 50) } }); marker.addListener('click', () => toggleStationPopup(station)); mapMarkers.push(marker); });
  buses.value.filter((bus) => lineSelection === 'all' || busLineKey(bus) === lineSelection).forEach((bus, index) => { const position = busPosition(bus, index); if (!position) return; points.push(position); busMarkers.push(new window.google.maps.Marker({ position, map: campusMap, title: bus.name || bus.busId || 'MFU Shuttle Bus', zIndex: 20, icon: { url: busUrl, scaledSize: new window.google.maps.Size(58, 58), anchor: new window.google.maps.Point(29, 36) } })); });
  const selectedPath = selectedRouteLine ? routePaths.get(selectedRouteLine) : undefined;
  if (selectedFrom && selectedTo && selectedPath && selectedPath.length > 1) {
    const nearestPathIndex = (station: Station) => selectedPath.reduce((nearest, point, index) => distanceMeters(point, station) < distanceMeters(selectedPath[nearest], station) ? index : nearest, 0);
    const fromIndex = nearestPathIndex(selectedFrom);
    const toIndex = nearestPathIndex(selectedTo);
    if (fromIndex !== toIndex) {
      selectedRouteAvailable.value = true;
      const startIndex = Math.min(fromIndex, toIndex);
      const endIndex = Math.max(fromIndex, toIndex);
      const segment = selectedPath.slice(startIndex + 1, endIndex);
      if (fromIndex > toIndex) segment.reverse();
      mapPolylines.push(new window.google.maps.Polyline({
        path: [{ lat: selectedFrom.lat, lng: selectedFrom.lng }, ...segment, { lat: selectedTo.lat, lng: selectedTo.lng }],
        geodesic: true,
        strokeColor: '#2196f3',
        strokeOpacity: 1,
        strokeWeight: 6,
        zIndex: 10,
        map: campusMap,
      }));
    }
  }
}
async function overviewMinimumZoom() {
    const routes = await Promise.all([loadRoute('line1'), loadRoute('line2')]);
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
async function initGoogleMap() {
  try {
    await loadGoogleMapsScript();
    if (!mapElement.value) return;

    const minZoom = await overviewMinimumZoom();
    if (!mapElement.value) return;

    mapElement.value.style.opacity = '0';
    campusMap = new window.google.maps.Map(mapElement.value, {
      center: { lat: 20.0465, lng: 99.895 },
      zoom: 17,
      minZoom,
      maxZoom: 18,
      restriction: { latLngBounds: { north: 20.064, south: 20.0385, east: 99.904, west: 99.8875 }, strictBounds: false },
      disableDefaultUI: true,
      styles: MFU_MAP_STYLES,
      clickableIcons: false,
      gestureHandling: 'greedy'
    });
    window.google.maps.event.addListenerOnce(campusMap, 'idle', () => { if (mapElement.value) mapElement.value.style.opacity = '1'; });
    campusMap.addListener('click', () => { closeStationPopup(); if (selectedLine.value !== 'all') selectedLine.value = 'all'; });
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
    mapRenderGeneration++;
    removeMapOverlays();
    campusMap = null;
    await initGoogleMap();
    return;
  }

  window.google?.maps?.event.trigger(campusMap, 'resize');
  await renderGoogleMap();
}
async function loadData() { isLoading.value = true; message.value = ''; try { const [line1, line2, busList] = await Promise.all([api.getStations('line1'), api.getStations('line2'), api.getBuses().catch(() => [])]); const stationMap = new Map<string, Station>(); [...line1, ...line2].forEach((station) => { const old = stationMap.get(station.id); stationMap.set(station.id, { ...old, ...station, lines: Array.from(new Set([...(old?.lines || []), ...(station.lines || [])])) } as Station); }); stations.value = [...stationMap.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })); buses.value = busList; } catch (error) { message.value = error instanceof Error ? error.message : t.value.mapLoadFailed; } finally { isLoading.value = false; } }
onMounted(async () => { await loadData(); await initGoogleMap(); });
watch(page, (next) => { if (next === 'home') void ensureHomeMap(); });
watch([selectedLine, stations, buses, selectedFromId, selectedToId], () => {
  selectedRouteAvailable.value = false;
  void renderGoogleMap();
}, { deep: true });
</script>

<template>
  <main class="web-shell"><section class="phone">
    <header v-if="page === 'home'" class="app-header home-header"><button class="menu-btn appbar-menu-btn" type="button" aria-label="Menu" @click="isMenuOpen = true"><span></span><span></span><span></span></button><div class="wordmark"><span>MFU</span> <b>SHUTTLE BUS</b></div><button class="language-btn" type="button" @click="setLanguage(lang === 'th' ? 'en' : 'th')"><img :src="lang === 'th' ? thaiFlagUrl : englishFlagUrl" alt="" /></button></header>
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

  <section v-if="page === 'home'" class="screen home-screen"><div ref="mapElement" class="campus-map google-map" role="application" aria-label="MFU campus map"><div v-if="mapError" class="map-error">{{ mapError.includes('API_KEY') ? t.mapKeyMissing : t.mapLoadFailed }}</div></div>
      <div v-if="isTripSearchCollapsed" class="collapsed-trip" @click="isTripSearchCollapsed = false"><strong>{{ fromQuery }} <span>→</span> {{ toQuery }}</strong><span>⌄</span></div><div v-else class="trip-card"><div class="trip-marker-column" aria-hidden="true"><span class="origin-marker"></span><i></i><span class="destination-marker"></span></div><div class="trip-fields"><label><span>{{ t.from }}</span><div class="input-wrap"><input v-model="fromQuery" :placeholder="t.fromStation" @focus="activeSearchField = 'from'; showStationSuggestions = true" @blur="hideStationSuggestionsSoon" @input="selectedFromId = ''; showStationSuggestions = true" /><button v-if="fromQuery" class="clear-input" type="button" @click="clearStation('from')">×</button></div></label><div v-if="showStationSuggestions && activeSearchField === 'from'" class="suggestions"><button v-for="station in fromMatches" :key="station.id" type="button" @click="setStation('from', station)"><span :class="{ favorite: favoriteIds.includes(station.id) }">{{ favoriteIds.includes(station.id) ? '♥' : '●' }}</span>{{ stationName(station) }}</button></div><label><span>{{ t.to }}</span><div class="input-wrap"><input v-model="toQuery" :placeholder="t.toStation" @focus="activeSearchField = 'to'; showStationSuggestions = true" @blur="hideStationSuggestionsSoon" @input="selectedToId = ''; showStationSuggestions = true" /><button v-if="toQuery" class="clear-input" type="button" @click="clearStation('to')">×</button></div></label><div v-if="showStationSuggestions && activeSearchField === 'to'" class="suggestions"><button v-for="station in toMatches" :key="station.id" type="button" @click="setStation('to', station)"><span :class="{ favorite: favoriteIds.includes(station.id) }">{{ favoriteIds.includes(station.id) ? '♥' : '●' }}</span>{{ stationName(station) }}</button></div></div><div class="trip-actions"><button v-if="selectedFromId && selectedToId" class="icon-action" type="button" @click="isTripSearchCollapsed = true">⌃</button><button class="icon-action" type="button" :disabled="!fromQuery && !toQuery" :aria-label="t.swap" @click="swapStations">⇅</button></div></div>
      <div class="line-selector"><button :class="{ active: selectedLine === 'line1' }" type="button" @click.stop="selectedLine = 'line1'"><img :src="busIconUrl" alt="" />{{ t.line1 }}</button><button :class="{ 'line-two-active': selectedLine === 'line2' }" type="button" @click.stop="selectedLine = 'line2'"><img :src="busIconUrl" alt="" />{{ t.line2 }}</button></div>
      <div v-if="tripEstimate && isTripSearchCollapsed" class="trip-estimate"><div class="trip-estimate-head"><strong>{{ t.tripSummary }}</strong><span>{{ fromQuery }} <b>→</b> {{ toQuery }}</span></div><template v-if="tripEstimate.available"><div class="trip-estimate-row"><span class="trip-estimate-icon material-icon">directions_bus</span><strong>{{ t.busArrival }}</strong><b>{{ tripEstimate.arrivalMinutes }} {{ t.minutes }}</b></div><div class="trip-estimate-row"><span class="trip-estimate-icon material-icon">schedule</span><strong>{{ t.rideTime }}</strong><b>{{ tripEstimate.rideMinutes }} {{ t.minutes }}</b></div><div class="trip-estimate-row total"><span class="trip-estimate-icon material-icon">timer</span><strong>{{ t.totalTime }}</strong><b>{{ tripEstimate.totalMinutes }} {{ t.minutes }}</b></div></template><p v-else class="trip-estimate-unavailable">{{ t.noDirectRoute }}</p></div>
    </section>

    <!-- Transit page: browse shuttle bus lines and stations. -->
    <TransitPage v-else-if="page === 'transit'" :t="t" :is-loading="isLoading" :expanded-lines="expandedLines" :transit-search="transitSearch" :line-stations="lineStations" :filtered-line-stations="filteredLineStations" :station-name="stationName" @select="selectTransitStation" />
    <!-- Favorites page: manage saved stations. -->
    <FavoritesPage v-else-if="page === 'favorites'" :t="t" :favorite-stations="favoriteStations" :station-name="stationName" @add="showStationPicker = true" @remove="askRemoveFavorite" />
    <!-- Feedback page: submit a complete feedback form directly. -->
    <FeedbackPage v-else-if="page === 'report'" :t="t" :is-submitting="isFeedbackSubmitting" @submit="submitFeedback" />
    <!-- Settings page: navigate to transit, favorites, feedback, and language. -->
    <SettingsPage v-else-if="page === 'settings'" :t="t" :language-label="lang === 'th' ? t.languageThai : t.languageEnglish" @open="openPage" />
    <!-- Language page: choose Thai or English. -->
    <LanguagePage v-else-if="page === 'language'" :t="t" :lang="lang" @select="(nextLang) => { setLanguage(nextLang); goHome(); }" />
    <div v-if="showStationPicker" class="modal-backdrop" @click.self="showStationPicker = false">
    <section class="picker-modal"><div class="modal-head"><h2>{{ t.searchStation }}</h2><button type="button" @click="showStationPicker = false">×</button></div><div class="list-search"><svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2" fill="none" stroke="currentColor" stroke-width="2" /><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" /></svg><input v-model="favoriteSearch" autofocus :placeholder="t.findStation" /></div><div class="picker-list"><button v-for="station in favoriteMatches" :key="station.id" type="button" @click="toggleFavorite(station.id); showStationPicker = false"><span>{{ stationName(station) }}</span><span v-if="favoriteIds.includes(station.id)" class="picker-favorite-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z" /></svg></span><b v-else>+</b></button><p v-if="!favoriteMatches.length" class="empty-state">{{ t.noStations }}</p></div></section></div>
    <div v-if="confirmStation" class="modal-backdrop" @click.self="confirmStation = null"><section class="confirm-modal"><h2>{{ t.remove }}</h2><p>{{ t.confirmRemove }}</p><strong>{{ stationName(confirmStation) }}</strong><div class="modal-actions"><button class="secondary-btn" type="button" @click="confirmStation = null">{{ t.cancel }}</button><button class="danger-btn" type="button" @click="confirmRemoveFavorite">{{ t.remove }}</button></div></section></div>
    <div v-if="successModal" class="modal-backdrop" @click.self="successModal = false"><section class="success-modal"><span>✓</span><h2>{{ t.success }}</h2><p>{{ t.successText }}</p><button class="primary-btn" type="button" @click="successModal = false">{{ t.close }}</button></section></div>
  </section></main>
</template>
