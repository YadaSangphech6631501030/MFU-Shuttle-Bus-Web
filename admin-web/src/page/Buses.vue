<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Bus, GpsStatus } from '../types';
import GpsNotice from '../components/GpsStatus.vue';
import { busActivity } from '../services/bus-status';

const props = defineProps<{
  buses: Bus[];
  text: Record<string, any>;
  gpsStatus: GpsStatus | null;
  loadFailed: boolean;
  lang: 'th' | 'en';
}>();

function busName(bus: Bus) {
  return bus.busId || bus.busNumber || bus.licensePlate || props.text.unknownBus;
}

function busLine(bus: Bus) {
  return bus.line ? `${props.text.line} ${bus.line}` : props.text.noLine;
}

const now = ref(Date.now());
let clockTimer: number | undefined;
onMounted(() => { clockTimer = window.setInterval(() => { now.value = Date.now(); }, 1000); });
onUnmounted(() => { window.clearInterval(clockTimer); });

function gpsAge(bus: Bus) {
  return bus.lastGpsAt ? now.value - Date.parse(bus.lastGpsAt) : NaN;
}

function gpsState(bus: Bus): 'fresh' | 'stale' | 'unknown' {
  const age = gpsAge(bus);
  if (props.loadFailed || !bus.feedHealthy || bus.connectionStatus === 'unknown' || !Number.isFinite(age) || age < 0) return 'unknown';
  if (props.gpsStatus) return age > props.gpsStatus.staleAfterMs ? 'stale' : 'fresh';
  return bus.connectionStatus || 'unknown';
}

function connectionLabel(bus: Bus) {
  return labels.value[gpsState(bus)];
}

function activityLabel(bus: Bus) {
  const activity = busActivity(bus);
  return activity ? labels.value[activity] : labels.value.movementUnknown;
}

const labels = computed(() => props.lang === 'th' ? {
  fresh: 'GPS อัปเดตแล้ว', stale: 'รอ GPS อัปเดต', unknown: 'ตรวจสอบ GPS ไม่ได้', gpsTime: 'เวลาพิกัดล่าสุด',
  noGps: 'ยังไม่มีพิกัด', speed: 'ความเร็ว', unitUnknown: 'ยังไม่ระบุหน่วย',
  driving: 'กำลังขับ', waiting: 'รอคน', parked: 'จอด', total: 'รถในทะเบียน', position: 'พิกัดล่าสุด',
  movementUnknown: 'ไม่ทราบ', lastMovement: 'สถานะรถที่รายงานล่าสุด',
  guide: 'สถานะรถอ้างอิงข้อมูลที่รายงานล่าสุด ดูอายุพิกัดประกอบเพื่อทราบว่าข้อมูลอัปเดตเมื่อใด',
  drivingHint: 'รถกำลังเคลื่อนที่', waitingHint: 'รถหยุดรอรับผู้โดยสาร', parkedHint: 'รถหยุดจอด',
  freshHint: 'ได้รับพิกัดภายใน', staleHint: 'ไม่มีพิกัดใหม่เกิน', seconds: 'วินาที',
  unknownHint: 'ไม่มีพิกัด หรือเชื่อมต่อข้อมูลไม่ได้', justNow: 'เมื่อสักครู่',
} : {
  fresh: 'GPS up to date', stale: 'Awaiting GPS update', unknown: 'GPS unavailable', gpsTime: 'Last GPS timestamp',
  noGps: 'No position yet', speed: 'Speed', unitUnknown: 'unit unconfirmed',
  driving: 'Driving', waiting: 'Waiting for passengers', parked: 'Parked', total: 'Registered vehicles', position: 'Last position',
  movementUnknown: 'Unknown', lastMovement: 'Last reported movement',
  guide: 'Vehicle activity reflects the last report. Check the position age to see when it was updated.',
  drivingHint: 'Vehicle is moving', waitingHint: 'Stopped to pick up passengers', parkedHint: 'Vehicle is stopped',
  freshHint: 'Position from the last', staleHint: 'No new position for over', seconds: 'seconds',
  unknownHint: 'No position or unable to connect', justNow: 'Just now',
});
function ageText(bus: Bus) {
  const age = gpsAge(bus);
  if (!Number.isFinite(age) || age < 0) return labels.value.noGps;
  const seconds = Math.floor(age / 1000);
  if (seconds < 5) return labels.value.justNow;
  const [value, en, th] = seconds < 60 ? [seconds, 's', 'วินาที']
    : seconds < 3600 ? [Math.floor(seconds / 60), 'min', 'นาที']
    : seconds < 86400 ? [Math.floor(seconds / 3600), 'hr', 'ชั่วโมง'] : [Math.floor(seconds / 86400), 'days', 'วัน'];
  return props.lang === 'th' ? `${value} ${th}ที่แล้ว` : `${value} ${en} ago`;
}
function gpsTime(bus: Bus) {
  return bus.lastGpsAt ? new Date(bus.lastGpsAt).toLocaleString(props.lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok' }) + ' (UTC+7)' : '—';
}
function speedText(bus: Bus) {
  if (typeof bus.speedKph === 'number') return `${bus.speedKph.toFixed(1)} km/h`;
  return typeof bus.speedRaw === 'number' ? `${bus.speedRaw} (${labels.value.unitUnknown})` : '—';
}
const drivingBuses = computed(() => props.buses.filter(bus => busActivity(bus) === 'driving').length);
const waitingBuses = computed(() => props.buses.filter(bus => busActivity(bus) === 'waiting').length);
const parkedBuses = computed(() => props.buses.filter(bus => busActivity(bus) === 'parked').length);
const unknownBuses = computed(() => props.buses.filter(bus => busActivity(bus) === null).length);
</script>

<template>
  <section class="bus-page dashboard-page">
    <header class="dashboard-page-header bus-page-header">
      <div>
        <p class="eyebrow">{{ text.tabs.buses }}</p>
        <h1>{{ text.allBuses }}</h1>
      </div>
    </header>

    <GpsNotice :status="gpsStatus" :load-failed="loadFailed" :lang="lang" />
    <p class="bus-status-guide">{{ labels.guide }}</p>
    <div class="bus-overview-layout">
      <article class="dashboard-chart-panel bus-list-panel">
        <div class="dashboard-panel-heading bus-list-heading">
          <div>
            <h2>{{ text.allBuses }}</h2>
            <span>{{ labels.total }}: {{ buses.length }}<template v-if="unknownBuses"> · {{ labels.movementUnknown }}: {{ unknownBuses }}</template></span>
          </div>
        </div>
        <div class="bus-list simple">
          <p v-if="!buses.length" class="function-empty-state">{{ text.noBuses }}</p>
          <article
            v-for="bus in buses"
            :key="bus._id || bus.busId || bus.busNumber"
            class="bus-card simple"
            :class="`gps-${gpsState(bus)}`"
          >
            <div class="bus-card-main">
              <span class="bus-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 16h.01" />
                  <path d="M17 16h.01" />
                  <path d="M7 20v-2" />
                  <path d="M17 20v-2" />
                  <path d="M5 11h14" />
                  <path d="M8 6h8" />
                  <path d="M6 18h12a2 2 0 0 0 2-2V8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2" />
                </svg>
              </span>
              <div class="bus-card-title">
                <strong>{{ text.busPrefix }} {{ busName(bus) }}</strong>
                <small>{{ busLine(bus) }}</small>
                <small>{{ connectionLabel(bus) }}</small>
                <small>{{ labels.speed }}: {{ speedText(bus) }}<template v-if="bus.alarm"> &middot; {{ bus.alarm }}</template></small>
                <span class="bus-gps-age">{{ labels.position }}: {{ ageText(bus) }}</span>
                <small>{{ labels.gpsTime }}: {{ gpsTime(bus) }}</small>
                <small v-if="typeof bus.lat === 'number' && typeof bus.lng === 'number'">{{ labels.position }}: {{ bus.lat.toFixed(6) }}, {{ bus.lng.toFixed(6) }}</small>
                <small v-else>{{ labels.noGps }}</small>
              </div>
            </div>

            <span class="bus-status-pill" :class="`activity-${busActivity(bus) || 'unknown'}`" :title="labels.lastMovement">
              {{ activityLabel(bus) }}
            </span>
          </article>
        </div>
      </article>

      <section class="dashboard-metric-grid bus-stat-grid">
        <article class="dashboard-metric-card">
          <div>
            <span>{{ labels.driving }}</span>
            <strong>{{ drivingBuses }}</strong>
            <small>{{ labels.drivingHint }}</small>
          </div>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 16h.01" />
            <path d="M17 16h.01" />
            <path d="M7 20v-2" />
            <path d="M17 20v-2" />
            <path d="M5 11h14" />
            <path d="M6 18h12a2 2 0 0 0 2-2V8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2" />
          </svg>
        </article>
        <article class="dashboard-metric-card">
          <div>
            <span>{{ labels.waiting }}</span>
            <strong>{{ waitingBuses }}</strong>
            <small>{{ labels.waitingHint }}</small>
          </div>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M7 16h.01" />
            <path d="M17 16h.01" />
            <path d="M7 20v-2" />
            <path d="M17 20v-2" />
            <path d="M5 11h6" />
            <path d="M14 11h5" />
            <path d="M6 18h12a2 2 0 0 0 2-2V8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2" />
          </svg>
        </article>
        <article class="dashboard-metric-card">
          <div>
            <span>{{ labels.parked }}</span>
            <strong>{{ parkedBuses }}</strong>
            <small>{{ labels.parkedHint }}</small>
          </div>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 16h.01" />
            <path d="M17 16h.01" />
            <path d="M7 20v-2" />
            <path d="M17 20v-2" />
            <path d="M5 11h14" />
            <path d="M8 6h8" />
            <path d="M6 18h12a2 2 0 0 0 2-2V8a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2" />
          </svg>
        </article>
      </section>
    </div>
  </section>
</template>

<style scoped>
.bus-status-guide { margin: 0 0 20px; color: var(--muted); font-size: 14px; line-height: 1.7; }
.bus-gps-age { display: block; margin-top: 6px; color: var(--ink); font-size: 14px; font-weight: 600; }
.bus-status-pill.activity-driving { background: #e7f5ec; color: #21613c; }
.bus-status-pill.activity-waiting { background: #fff3d6; color: #805600; }
.bus-status-pill.activity-parked, .bus-status-pill.activity-unknown { background: #edf0f4; color: #526075; }
.bus-status-pill { white-space: normal; text-align: center; }
</style>
