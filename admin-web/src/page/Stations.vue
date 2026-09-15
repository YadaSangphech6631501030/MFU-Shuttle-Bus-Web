<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Station, ShuttleRoute } from '../types';

const props = defineProps<{
  editingStationKey: string | null;
  loading: boolean;
  stationForm: Station;
  stationMapError: string;
  stationMapLoading: boolean;
  stationRoiText: string;
  stations: Station[];
  routes: ShuttleRoute[];
  text: Record<string, any>;
}>();

const emit = defineEmits<{
  deleteStation: [station: Station];
  editStation: [station: Station];
  resetStationForm: [];
  saveStation: [];
  stationMapReady: [element: HTMLElement | null];
  updateStationRoiText: [value: string];
  useCurrentLocation: [];
}>();

const stationMapEl = ref<HTMLElement | null>(null);
const isStationModalOpen = ref(false);
let shouldCloseWhenReset = false;
const tr = (en: string, th: string) => props.text.language === 'TH' ? th : en;
const selectedLine = ref('');
const routeOptions = computed(() => [...props.routes].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })));
const routesById = computed(() => new Map(props.routes.map(route => [route.id, route])));
const filteredStations = computed(() => selectedLine.value
  ? props.stations.filter(station => station.lines.includes(selectedLine.value))
  : props.stations);
const unknownLines = computed(() => props.stationForm.lines.filter(id => !routesById.value.has(id)));
const validLines = computed(() => props.stationForm.lines.length > 0 && unknownLines.value.length === 0);
function routeName(id: string) {
  const route = routesById.value.get(id);
  return route ? (props.text.language === 'TH' && route.nameTH ? route.nameTH : route.name) : id;
}
watch(() => props.routes, () => {
  if (selectedLine.value && !routesById.value.has(selectedLine.value)) selectedLine.value = '';
});

function updateStationRoiText(event: Event) {
  emit('updateStationRoiText', (event.target as HTMLTextAreaElement).value);
}

function openStationModal() {
  isStationModalOpen.value = true;
  void nextTick(() => {
    emit('stationMapReady', stationMapEl.value);
  });
}

function openAddStationModal() {
  shouldCloseWhenReset = false;
  emit('resetStationForm');
  openStationModal();
}

function openEditStationModal(station: Station) {
  shouldCloseWhenReset = false;
  emit('editStation', station);
  openStationModal();
}

function closeStationModal(resetForm = true) {
  isStationModalOpen.value = false;
  shouldCloseWhenReset = false;
  if (resetForm) {
    emit('resetStationForm');
  }
  emit('stationMapReady', null);
}

function saveStation() {
  if (!validLines.value || props.loading) return;
  shouldCloseWhenReset = true;
  emit('saveStation');
}

function stationDisplayName(station: Station) {
  const thaiName = station.nameTH?.trim();
  return props.text.language === 'TH' && thaiName ? thaiName : station.name;
}

onMounted(() => {
  emit('stationMapReady', stationMapEl.value);
});

onUnmounted(() => {
  emit('stationMapReady', null);
});

watch(
  () => props.editingStationKey,
  (nextValue, previousValue) => {
    if (previousValue && !nextValue && shouldCloseWhenReset) {
      closeStationModal(false);
    }
  },
);

watch(
  () => props.stations,
  () => {
    if (shouldCloseWhenReset) {
      closeStationModal(false);
    }
  },
);
</script>

<template>
  <section class="station-setting-page">
    <article class="panel">
      <div class="panel-heading">
        <div>
          <h2>{{ text.stationList }}</h2>
          <span>{{ stations.length }} {{ text.stationsUnit }}</span>
        </div>
        <button class="primary-btn compact-btn station-add-btn" type="button" @click="openAddStationModal">
          <svg class="action-btn-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          {{ text.addStation }}
        </button>
      </div>
      <label class="station-line-filter">
        {{ tr('Filter by line', 'กรองตามสายรถ') }}
        <select v-model="selectedLine">
          <option value="">{{ tr('All lines', 'ทุกสายรถ') }}</option>
          <option v-for="route in routeOptions" :key="route.id" :value="route.id">{{ routeName(route.id) }}</option>
        </select>
      </label>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ text.stationId }}</th>
              <th>{{ text.stationName }}</th>
              <th>{{ text.line }}</th>
              <th>{{ text.camera }}</th>
              <th class="actions">{{ text.actions }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!stations.length"><td colspan="5" class="function-empty-state">{{ text.noStations }}<small>{{ text.noStationsHint }}</small></td></tr>
            <tr v-else-if="!filteredStations.length"><td colspan="5" class="function-empty-state">{{ tr('No stations assigned to this line.', 'ยังไม่มีสถานีในสายรถนี้') }}</td></tr>
            <tr v-for="station in filteredStations" :key="station._id || station.id">
              <td>{{ station.id }}</td>
              <td>{{ stationDisplayName(station) }}</td>
              <td><div class="station-line-badges"><span v-for="id in station.lines" :key="id" class="station-line-badge" :title="id"><span class="station-line-swatch" :style="{ background: routesById.get(id)?.color || '#64748b' }"></span>{{ routeName(id) }}<small v-if="routesById.get(id)?.enabled === false">{{ tr('Hidden', 'ซ่อน') }}</small></span></div></td>
              <td>
                <span class="chip" :class="{ 'chip-muted': !station.cameraUrl }">
                  {{ station.cameraUrl ? text.connect : text.noConnect }}
                </span>
              </td>
              <td class="actions">
                <button class="link-btn" @click="openEditStationModal(station)">{{ text.edit }}</button>
                <button class="danger-link" @click="$emit('deleteStation', station)">{{ text.delete }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <div v-if="isStationModalOpen" class="modal-backdrop" @click.self="() => closeStationModal()">
      <article class="panel station-modal" role="dialog" aria-modal="true">
        <div class="panel-heading">
          <h2>{{ editingStationKey ? text.editStation : text.addStation }}</h2>
          <button class="link-btn" type="button" @click="() => closeStationModal()">{{ text.cancel }}</button>
        </div>
        <form class="station-form" @submit.prevent="saveStation">
          <label>{{ text.stationId }} <input v-model="stationForm.id" required :placeholder="text.stationIdPlaceholder" /></label>
          <label>{{ text.stationNameEN }} <input v-model="stationForm.name" required :placeholder="text.stationNamePlaceholder" /></label>
          <label>{{ text.stationNameTH }} <input v-model="stationForm.nameTH" :placeholder="text.stationNameTHPlaceholder" /></label>
          <div class="split">
            <label>{{ text.latitude }} <input v-model.number="stationForm.lat" required type="number" step="any" /></label>
            <label>{{ text.longitude }} <input v-model.number="stationForm.lng" required type="number" step="any" /></label>
          </div>
          <div class="map-picker">
            <div class="map-picker-header">
              <div>
                <strong>{{ text.mapPicker }}</strong>
                <p>{{ text.mapHint }}</p>
              </div>
              <button class="secondary-btn compact-btn" type="button" @click="$emit('useCurrentLocation')">
                {{ text.useCurrentLocation }}
              </button>
            </div>
            <div ref="stationMapEl" class="station-map"></div>
            <div v-if="stationMapLoading" class="map-overlay">{{ text.mapLoading }}</div>
            <p v-if="stationMapError" class="map-error">{{ stationMapError }}</p>
          </div>
          <fieldset class="station-line-picker">
            <legend>{{ tr('Service lines', 'สายรถที่ผ่านสถานี') }}</legend>
            <p class="muted">{{ tr('Choose one or more lines. Add new lines in Routes first.', 'เลือกได้มากกว่าหนึ่งสาย หากต้องการสายใหม่ ให้เพิ่มในหน้าเส้นทางรถก่อน') }}</p>
            <div class="station-line-options">
              <label v-for="route in routeOptions" :key="route.id" :class="{ selected: stationForm.lines.includes(route.id) }">
                <input v-model="stationForm.lines" type="checkbox" :value="route.id" />
                <span class="station-line-swatch" :style="{ background: route.color }"></span>
                <span>{{ routeName(route.id) }}<small>{{ route.id }}{{ route.enabled ? '' : tr(' · Hidden', ' · ซ่อน') }}</small></span>
              </label>
              <label v-for="id in unknownLines" :key="id">
                <input v-model="stationForm.lines" type="checkbox" :value="id" />
                <span>{{ id }}<small>{{ tr('Unavailable — uncheck and choose an existing line.', 'ไม่พบสายรถนี้ กรุณายกเลิกแล้วเลือกสายที่มีอยู่') }}</small></span>
              </label>
            </div>
            <p v-if="!routes.length" class="muted">{{ tr('No lines yet. Create a line in Routes before saving a station.', 'ยังไม่มีสายรถ กรุณาสร้างสายในหน้าเส้นทางรถก่อนบันทึกสถานี') }}</p>
            <p v-else-if="!validLines" class="muted" role="status">{{ tr('Select at least one existing line to save.', 'กรุณาเลือกสายรถที่มีอยู่อย่างน้อยหนึ่งสายเพื่อบันทึก') }}</p>
          </fieldset>
          <label>{{ text.cameraUrl }} <input v-model="stationForm.cameraUrl" placeholder="rtsp://... or https://..." /></label>
          <label>
            {{ text.detectionRoi }}
            <textarea
              :value="stationRoiText"
              placeholder="[[0.1,0.2],[0.9,0.2],[0.9,0.8],[0.1,0.8]]"
              rows="3"
              @input="updateStationRoiText"
            ></textarea>
          </label>
          <button class="primary-btn" type="submit" :disabled="loading || !validLines">
            {{ editingStationKey ? text.saveChanges : text.addStation }}
          </button>
        </form>
      </article>
    </div>
  </section>
</template>

<style scoped>
.station-line-filter { max-width: 320px; margin-bottom: 16px; }
.station-line-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.station-line-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border: 1px solid var(--line); border-radius: 12px; overflow-wrap: anywhere; white-space: normal; }
.station-line-swatch { width: 20px; height: 5px; border-radius: 3px; flex-shrink: 0; }
.station-line-picker { min-width: 0; margin: 0; padding: 14px; border: 1px solid var(--line); border-radius: 12px; }
.station-line-picker p { font-size: 13px; line-height: 1.6; }
.station-line-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap: 8px; }
.station-line-options label { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.station-line-options label.selected { border-color: var(--mfu-red); background: #fff5f4; }
.station-line-options input { width: auto; flex-shrink: 0; }
.station-line-options label > span:last-child { min-width: 0; overflow-wrap: anywhere; }
.station-line-options small { display: block; margin-top: 4px; color: var(--muted); }
</style>
