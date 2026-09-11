<script setup lang="ts">
import { computed } from 'vue';
import type { Bus, GpsStatus } from '../types';
import GpsNotice from '../components/GpsStatus.vue';

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

function isOffline(bus: Bus) {
  return bus.connectionStatus !== 'fresh' || !bus.feedHealthy;
}

function connectionLabel(bus: Bus) {
  if (bus.connectionStatus === 'fresh' && bus.feedHealthy) return labels.value.fresh;
  return bus.connectionStatus === 'stale' ? labels.value.stale : labels.value.unknown;
}

const labels = computed(() => props.lang === 'th' ? {
  fresh: 'ข้อมูลล่าสุด', stale: 'ข้อมูลเก่า', unknown: 'ยังยืนยันไม่ได้', gpsTime: 'เวลา GPS ล่าสุด',
  noGps: 'ยังไม่มีพิกัด', speed: 'ความเร็ว', unitUnknown: 'ยังไม่ระบุหน่วย',
  stopped: 'จอด', moving: 'กำลังวิ่ง', total: 'รถในทะเบียน', position: 'พิกัดล่าสุด',
} : {
  fresh: 'Fresh data', stale: 'Stale data', unknown: 'Unconfirmed', gpsTime: 'Last GPS time',
  noGps: 'No position yet', speed: 'Speed', unitUnknown: 'unit unconfirmed',
  stopped: 'Stopped', moving: 'Moving', total: 'Registered vehicles', position: 'Last position',
});
function gpsTime(bus: Bus) {
  return bus.lastGpsAt ? new Date(bus.lastGpsAt).toLocaleString(props.lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok' }) + ' (UTC+7)' : '—';
}
function speedText(bus: Bus) {
  if (typeof bus.speedKph === 'number') return `${bus.speedKph.toFixed(1)} km/h`;
  return typeof bus.speedRaw === 'number' ? `${bus.speedRaw} (${labels.value.unitUnknown})` : '—';
}
const onlineBuses = computed(() => props.buses.filter((bus) => !isOffline(bus)).length);
const offlineBuses = computed(() => props.buses.filter(bus => bus.connectionStatus === 'stale').length);
const unknownBuses = computed(() => props.buses.length - onlineBuses.value - offlineBuses.value);
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
    <div class="bus-overview-layout">
      <article class="dashboard-chart-panel bus-list-panel">
        <div class="dashboard-panel-heading bus-list-heading">
          <div>
            <h2>{{ text.allBuses }}</h2>
            <span>{{ text.busesDescription }}</span>
          </div>
        </div>
        <div class="bus-list simple">
          <p v-if="!buses.length" class="function-empty-state">{{ text.noBuses }}</p>
          <article
            v-for="bus in buses"
            :key="bus._id || bus.busId || bus.busNumber"
            class="bus-card simple"
            :class="{ offline: isOffline(bus) }"
          >
            <div class="bus-card-main">
              <span class="bus-icon" :class="{ muted: isOffline(bus) }">
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
                <small>{{ busLine(bus) }} &middot; {{ bus.status === 'RUNNING' ? labels.moving : bus.status === 'STOPPED' ? labels.stopped : labels.unknown }}</small>
                <small>{{ labels.speed }}: {{ speedText(bus) }}<template v-if="bus.alarm"> &middot; {{ bus.alarm }}</template></small>
                <small>{{ labels.gpsTime }}: {{ gpsTime(bus) }}</small>
                <small v-if="typeof bus.lat === 'number' && typeof bus.lng === 'number'">{{ labels.position }}: {{ bus.lat.toFixed(6) }}, {{ bus.lng.toFixed(6) }}</small>
                <small v-else>{{ labels.noGps }}</small>
              </div>
            </div>

            <span class="bus-status-pill" :class="{ offline: isOffline(bus), online: !isOffline(bus) }">
              {{ connectionLabel(bus) }}
            </span>
          </article>
        </div>
      </article>

      <section class="dashboard-metric-grid bus-stat-grid">
        <article class="dashboard-metric-card">
          <div>
            <span>{{ labels.fresh }}</span>
            <strong>{{ onlineBuses }}</strong>
            <small>{{ labels.gpsTime }}</small>
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
            <span>{{ labels.stale }}</span>
            <strong>{{ offlineBuses }}</strong>
            <small>{{ gpsStatus ? Math.round(gpsStatus.staleAfterMs / 1000) : '—' }} {{ lang === 'th' ? 'วินาทีขึ้นไป' : 'seconds or older' }}</small>
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
            <span>{{ text.total }}</span>
            <strong>{{ buses.length }}</strong>
            <small>{{ labels.unknown }}: {{ unknownBuses }}</small>
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
