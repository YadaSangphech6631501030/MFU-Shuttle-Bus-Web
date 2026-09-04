<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, type Bus, type Station } from './services/api';
import mfuLogoUrl from '../assets/mfu_logo.png';
import busUrl from '../assets/gemcar_right.png';
import stopRedUrl from '../assets/busStopRed.png';
import stopYellowUrl from '../assets/busStopYellow.png';

type Lang = 'th' | 'en';
type Tab = 'home' | 'favorites' | 'report' | 'settings';

const LANG_KEY = 'mfu_user_language';
const FAVORITES_KEY = 'mfu_user_favorites';

const lang = ref<Lang>((localStorage.getItem(LANG_KEY) as Lang) || 'th');
const activeTab = ref<Tab>('home');
const selectedLine = ref<'all' | 'line1' | 'line2'>('all');
const fromQuery = ref('');
const toQuery = ref('');
const selectedFromId = ref('');
const selectedToId = ref('');
const stations = ref<Station[]>([]);
const buses = ref<Bus[]>([]);
const favoriteIds = ref<string[]>(JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'));
const isLoading = ref(false);
const message = ref('');
const reportType = ref('Problem');
const reportLocation = ref('');
const reportDetail = ref('');
const authMode = ref<'login' | 'register'>('login');
const username = ref('');
const email = ref('');
const password = ref('');
const profile = ref<{ username: string; email: string } | null>(null);

const t = computed(() => dictionary[lang.value]);
const isSignedIn = computed(() => Boolean(api.token));
const visibleStations = computed(() => stations.value.filter((station) => {
  if (selectedLine.value === 'all') return true;
  return station.lines?.includes(selectedLine.value);
}));
const favoriteStations = computed(() => stations.value.filter((station) => favoriteIds.value.includes(station.id)));
const fromMatches = computed(() => searchStations(fromQuery.value));
const toMatches = computed(() => searchStations(toQuery.value));
const selectedToStation = computed(() => stations.value.find((station) => station.id === selectedToId.value));
const crowdSummary = computed(() => {
  const high = visibleStations.value.filter((station) => station.status === 'HIGH').length;
  const medium = visibleStations.value.filter((station) => station.status === 'MEDIUM').length;
  return { high, medium, total: visibleStations.value.length };
});

function searchStations(query: string) {
  const clean = query.trim().toLowerCase();
  if (!clean) return visibleStations.value.slice(0, 5);
  return visibleStations.value
    .filter((station) => station.name.toLowerCase().includes(clean) || station.nameTH?.toLowerCase().includes(clean))
    .slice(0, 5);
}

function stationName(station: Station) {
  return lang.value === 'th' && station.nameTH ? station.nameTH : station.name;
}

function setLanguage(nextLang: Lang) {
  lang.value = nextLang;
  localStorage.setItem(LANG_KEY, nextLang);
}

function setStation(kind: 'from' | 'to', station: Station) {
  if (kind === 'from') {
    selectedFromId.value = station.id;
    fromQuery.value = stationName(station);
    return;
  }

  selectedToId.value = station.id;
  toQuery.value = stationName(station);
  reportLocation.value = stationName(station);
}

function toggleFavorite(id: string) {
  favoriteIds.value = favoriteIds.value.includes(id)
    ? favoriteIds.value.filter((favoriteId) => favoriteId !== id)
    : [...favoriteIds.value, id];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds.value));
}

function mapPoint(station: Station) {
  const latRange = { min: 20.0385, max: 20.0640 };
  const lngRange = { min: 99.8875, max: 99.9040 };
  const left = ((station.lng - lngRange.min) / (lngRange.max - lngRange.min)) * 100;
  const top = 100 - ((station.lat - latRange.min) / (latRange.max - latRange.min)) * 100;
  return {
    left: `${Math.min(92, Math.max(8, left))}%`,
    top: `${Math.min(88, Math.max(12, top))}%`,
  };
}

async function loadData() {
  isLoading.value = true;
  message.value = '';
  try {
    const [line1, line2, busList] = await Promise.all([
      api.getStations('line1'),
      api.getStations('line2'),
      api.getBuses().catch(() => []),
    ]);
    const stationMap = new Map<string, Station>();
    [...line1, ...line2].forEach((station) => {
      stationMap.set(station.id, { ...stationMap.get(station.id), ...station });
    });
    stations.value = [...stationMap.values()].sort((a, b) => a.id.localeCompare(b.id));
    buses.value = busList;
  } catch (error) {
    message.value = error instanceof Error ? error.message : t.value.loadFailed;
  } finally {
    isLoading.value = false;
  }
}

async function submitReport() {
  if (!reportDetail.value.trim()) {
    message.value = t.value.reportRequired;
    return;
  }

  try {
    await api.sendReport(reportType.value, reportDetail.value, reportLocation.value || '-');
    reportDetail.value = '';
    message.value = t.value.reportSent;
  } catch (error) {
    message.value = error instanceof Error ? error.message : t.value.loadFailed;
  }
}

async function submitAuth() {
  try {
    if (authMode.value === 'login') {
      await api.login(username.value, password.value);
    } else {
      await api.register(username.value, email.value, password.value);
      await api.login(username.value, password.value);
    }
    profile.value = await api.getProfile();
    message.value = t.value.signedIn;
  } catch (error) {
    message.value = error instanceof Error ? error.message : t.value.loadFailed;
  }
}

function logout() {
  api.clearSession();
  profile.value = null;
}

onMounted(async () => {
  await loadData();
  if (api.token) {
    profile.value = await api.getProfile().catch(() => null);
  }
});

const dictionary = {
  th: {
    title: 'MFU Shuttle Bus',
    subtitle: 'ค้นหาสถานี ดูรถ และบันทึกจุดขึ้นรถประจำ',
    from: 'จาก',
    to: 'ไปยัง',
    searchPlaceholder: 'ค้นหาสถานี',
    all: 'ทั้งหมด',
    line1: 'สาย 1',
    line2: 'สาย 2',
    refresh: 'อัปเดต',
    liveMap: 'แผนที่รถรับส่ง',
    buses: 'รถที่ออนไลน์',
    stations: 'สถานี',
    highCrowd: 'หนาแน่น',
    mediumCrowd: 'ปานกลาง',
    favorites: 'สถานีโปรด',
    noFavorites: 'ยังไม่มีสถานีโปรด',
    report: 'รายงาน',
    settings: 'ตั้งค่า',
    detail: 'รายละเอียด',
    location: 'ตำแหน่ง',
    send: 'ส่งรายงาน',
    language: 'ภาษา',
    account: 'บัญชีผู้ใช้',
    login: 'เข้าสู่ระบบ',
    register: 'สมัครสมาชิก',
    username: 'ชื่อผู้ใช้',
    email: 'อีเมล',
    password: 'รหัสผ่าน',
    logout: 'ออกจากระบบ',
    loadFailed: 'โหลดข้อมูลไม่สำเร็จ',
    reportRequired: 'กรุณากรอกรายละเอียด',
    reportSent: 'ส่งรายงานแล้ว',
    signedIn: 'เข้าสู่ระบบแล้ว',
    home: 'หน้าแรก',
  },
  en: {
    title: 'MFU Shuttle Bus',
    subtitle: 'Find stations, follow buses, and save favorite stops',
    from: 'From',
    to: 'To',
    searchPlaceholder: 'Search station',
    all: 'All',
    line1: 'Line 1',
    line2: 'Line 2',
    refresh: 'Refresh',
    liveMap: 'Shuttle map',
    buses: 'Online buses',
    stations: 'Stations',
    highCrowd: 'High',
    mediumCrowd: 'Medium',
    favorites: 'Favorites',
    noFavorites: 'No favorite stations yet',
    report: 'Report',
    settings: 'Settings',
    detail: 'Detail',
    location: 'Location',
    send: 'Send report',
    language: 'Language',
    account: 'Account',
    login: 'Log in',
    register: 'Register',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    logout: 'Log out',
    loadFailed: 'Could not load data',
    reportRequired: 'Please enter report detail',
    reportSent: 'Report sent',
    signedIn: 'Signed in',
    home: 'Home',
  },
};
</script>

<template>
  <main class="web-shell">
    <section class="phone">
      <header class="app-header">
        <img :src="mfuLogoUrl" alt="MFU" class="logo" />
        <div>
          <h1>{{ t.title }}</h1>
          <p>{{ t.subtitle }}</p>
        </div>
        <button class="round-btn" type="button" @click="setLanguage(lang === 'th' ? 'en' : 'th')">
          {{ lang.toUpperCase() }}
        </button>
      </header>

      <p v-if="message" class="notice">{{ message }}</p>

      <section v-if="activeTab === 'home'" class="screen">
        <div class="trip-card">
          <label>
            <span>{{ t.from }}</span>
            <input v-model="fromQuery" :placeholder="t.searchPlaceholder" />
          </label>
          <div v-if="fromQuery && !selectedFromId" class="suggestions">
            <button v-for="station in fromMatches" :key="station.id" type="button" @click="setStation('from', station)">
              {{ stationName(station) }}
            </button>
          </div>

          <label>
            <span>{{ t.to }}</span>
            <input v-model="toQuery" :placeholder="t.searchPlaceholder" />
          </label>
          <div v-if="toQuery && !selectedToId" class="suggestions">
            <button v-for="station in toMatches" :key="station.id" type="button" @click="setStation('to', station)">
              {{ stationName(station) }}
            </button>
          </div>
        </div>

        <div class="line-tabs">
          <button :class="{ active: selectedLine === 'all' }" type="button" @click="selectedLine = 'all'">{{ t.all }}</button>
          <button :class="{ active: selectedLine === 'line1' }" type="button" @click="selectedLine = 'line1'">{{ t.line1 }}</button>
          <button :class="{ active: selectedLine === 'line2' }" type="button" @click="selectedLine = 'line2'">{{ t.line2 }}</button>
        </div>

        <section class="map-panel">
          <div class="section-title">
            <strong>{{ t.liveMap }}</strong>
            <button type="button" @click="loadData">{{ isLoading ? '...' : t.refresh }}</button>
          </div>
          <div class="campus-map">
            <div class="route route-one"></div>
            <div class="route route-two"></div>
            <button
              v-for="station in visibleStations"
              :key="station.id"
              class="station-pin"
              :class="station.status?.toLowerCase()"
              :style="mapPoint(station)"
              type="button"
              @click="setStation('to', station)"
            >
              <img :src="station.status === 'HIGH' ? stopRedUrl : stopYellowUrl" alt="" />
            </button>
            <img :src="busUrl" alt="" class="bus bus-a" />
            <img :src="busUrl" alt="" class="bus bus-b" />
          </div>
        </section>

        <section class="stats-grid">
          <div><strong>{{ buses.length }}</strong><span>{{ t.buses }}</span></div>
          <div><strong>{{ crowdSummary.total }}</strong><span>{{ t.stations }}</span></div>
          <div><strong>{{ crowdSummary.high }}</strong><span>{{ t.highCrowd }}</span></div>
          <div><strong>{{ crowdSummary.medium }}</strong><span>{{ t.mediumCrowd }}</span></div>
        </section>

        <section v-if="selectedToStation" class="station-card">
          <div>
            <strong>{{ stationName(selectedToStation) }}</strong>
            <span>{{ selectedToStation.waiting || 0 }} waiting · {{ selectedToStation.status || 'LOW' }}</span>
          </div>
          <button type="button" @click="toggleFavorite(selectedToStation.id)">
            {{ favoriteIds.includes(selectedToStation.id) ? '★' : '☆' }}
          </button>
        </section>
      </section>

      <section v-if="activeTab === 'favorites'" class="screen list-screen">
        <h2>{{ t.favorites }}</h2>
        <p v-if="favoriteStations.length === 0" class="empty">{{ t.noFavorites }}</p>
        <article v-for="station in favoriteStations" :key="station.id" class="station-row">
          <div>
            <strong>{{ stationName(station) }}</strong>
            <span>{{ station.lines?.join(', ') }}</span>
          </div>
          <button type="button" @click="toggleFavorite(station.id)">★</button>
        </article>
      </section>

      <section v-if="activeTab === 'report'" class="screen form-screen">
        <h2>{{ t.report }}</h2>
        <label>
          <span>Type</span>
          <select v-model="reportType">
            <option>Problem</option>
            <option>Feedback</option>
            <option>Lost item</option>
          </select>
        </label>
        <label>
          <span>{{ t.location }}</span>
          <input v-model="reportLocation" :placeholder="t.location" />
        </label>
        <label>
          <span>{{ t.detail }}</span>
          <textarea v-model="reportDetail" :placeholder="t.detail"></textarea>
        </label>
        <button class="primary-btn" type="button" @click="submitReport">{{ t.send }}</button>
      </section>

      <section v-if="activeTab === 'settings'" class="screen form-screen">
        <h2>{{ t.settings }}</h2>
        <div class="setting-row">
          <span>{{ t.language }}</span>
          <div class="line-tabs compact">
            <button :class="{ active: lang === 'th' }" type="button" @click="setLanguage('th')">TH</button>
            <button :class="{ active: lang === 'en' }" type="button" @click="setLanguage('en')">EN</button>
          </div>
        </div>
        <h3>{{ t.account }}</h3>
        <div v-if="profile" class="profile-box">
          <strong>{{ profile.username }}</strong>
          <span>{{ profile.email }}</span>
          <button type="button" @click="logout">{{ t.logout }}</button>
        </div>
        <template v-else>
          <div class="line-tabs compact">
            <button :class="{ active: authMode === 'login' }" type="button" @click="authMode = 'login'">{{ t.login }}</button>
            <button :class="{ active: authMode === 'register' }" type="button" @click="authMode = 'register'">{{ t.register }}</button>
          </div>
          <input v-model="username" :placeholder="t.username" />
          <input v-if="authMode === 'register'" v-model="email" :placeholder="t.email" />
          <input v-model="password" :placeholder="t.password" type="password" />
          <button class="primary-btn" type="button" @click="submitAuth">
            {{ authMode === 'login' ? t.login : t.register }}
          </button>
        </template>
      </section>

      <nav class="bottom-nav">
        <button :class="{ active: activeTab === 'home' }" type="button" @click="activeTab = 'home'">⌂<span>{{ t.home }}</span></button>
        <button :class="{ active: activeTab === 'favorites' }" type="button" @click="activeTab = 'favorites'">★<span>{{ t.favorites }}</span></button>
        <button :class="{ active: activeTab === 'report' }" type="button" @click="activeTab = 'report'">!<span>{{ t.report }}</span></button>
        <button :class="{ active: activeTab === 'settings' }" type="button" @click="activeTab = 'settings'">⚙<span>{{ t.settings }}</span></button>
      </nav>
    </section>
  </main>
</template>
