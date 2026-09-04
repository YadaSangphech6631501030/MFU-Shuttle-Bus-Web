<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Station } from '../types';

const props = defineProps<{
  editingStationKey: string | null;
  loading: boolean;
  stationForm: Station;
  stationMapError: string;
  stationMapLoading: boolean;
  stationRoiText: string;
  stations: Station[];
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
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>{{ text.stationName }}</th>
              <th>{{ text.line }}</th>
              <th>{{ text.camera }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="station in stations" :key="station._id || station.id">
              <td>{{ station.id }}</td>
              <td>{{ stationDisplayName(station) }}</td>
              <td>{{ station.lines.join(', ') }}</td>
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
          <label>ID <input v-model="stationForm.id" required :placeholder="text.stationIdPlaceholder" /></label>
          <label>{{ text.stationName }} <input v-model="stationForm.name" required :placeholder="text.stationNamePlaceholder" /></label>
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
          <div class="checkbox-row">
            <label><input v-model="stationForm.lines" type="checkbox" value="line1" /> {{ text.line1 }}</label>
            <label><input v-model="stationForm.lines" type="checkbox" value="line2" /> {{ text.line2 }}</label>
          </div>
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
          <button class="primary-btn" type="submit" :disabled="loading">
            {{ editingStationKey ? text.saveChanges : text.addStation }}
          </button>
        </form>
      </article>
    </div>
  </section>
</template>
