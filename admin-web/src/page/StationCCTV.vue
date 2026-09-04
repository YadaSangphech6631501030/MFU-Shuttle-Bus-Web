<script setup lang="ts">
import { computed } from 'vue';
import type { DetectorStatus, Station } from '../types';

type CameraPreviewKind = 'none' | 'rtsp' | 'image' | 'video' | 'link';

const props = defineProps<{
  detectorBusy: boolean;
  detectorFrameUrl: string;
  detectorStatus: DetectorStatus | null;
  hasCamera: (station?: Station | null) => boolean;
  isEditingRoi: boolean;
  roiDraft: Array<[number, number]>;
  selectedCameraPreviewKind: CameraPreviewKind;
  selectedCameraStation: Station | null;
  selectedCameraUrl: string;
  stations: Station[];
  text: Record<string, any>;
}>();

defineEmits<{
  cancelRoiEditor: [];
  clearRoiDraft: [];
  dragRoiPoint: [event: PointerEvent];
  handleRoiCanvasPointerDown: [event: PointerEvent];
  saveSelectedRoi: [];
  selectCameraStation: [station: Station];
  setRoiPreset: [preset: 'full' | 'right' | 'left' | 'bottom' | 'center'];
  startRoiEditor: [];
  startSelectedDetector: [];
  stopDragRoiPoint: [];
  stopSelectedDetector: [];
}>();

const roiBox = computed(() => {
  if (!props.roiDraft.length) return null;
  const xs = props.roiDraft.map((point) => point[0]);
  const ys = props.roiDraft.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
});
</script>

<template>
  <section class="cctv-layout">
    <article class="panel cctv-list-panel">
      <div class="panel-heading">
        <h2>{{ text.tabs.cctv }}</h2>
        <span>{{ stations.filter(hasCamera).length }} {{ text.camerasUnit }}</span>
      </div>
      <div class="cctv-station-list">
        <button
          v-for="station in stations"
          :key="station._id || station.id"
          class="cctv-station-item"
          :class="{ active: selectedCameraStation?.id === station.id }"
          type="button"
          @click="$emit('selectCameraStation', station)"
        >
          <span class="cctv-station-meta">
            <strong>{{ station.name }}</strong>
            <small>{{ station.id }} &middot; {{ station.lines.join(', ') }}</small>
          </span>
          <span class="chip" :class="{ 'chip-muted': !hasCamera(station) }">
            {{ hasCamera(station) ? text.ready : text.noCamera }}
          </span>
        </button>
      </div>
    </article>

    <article class="panel cctv-view-panel">
      <section class="camera-panel camera-panel-standalone">
        <div class="camera-panel-header">
          <div>
            <h3>{{ text.stationCamera }}</h3>
            <p v-if="selectedCameraStation">{{ selectedCameraStation.name }} &middot; {{ selectedCameraStation.id }}</p>
          </div>
          <span class="chip" :class="{ 'chip-muted': !hasCamera(selectedCameraStation) }">
            {{ hasCamera(selectedCameraStation) ? text.configured : text.noCamera }}
          </span>
        </div>

        <div
          class="camera-preview-shell cctv-preview"
          :class="{ 'roi-editing': isEditingRoi }"
          @pointerdown="$emit('handleRoiCanvasPointerDown', $event)"
          @pointermove="$emit('dragRoiPoint', $event)"
          @pointerup="$emit('stopDragRoiPoint')"
          @pointerleave="$emit('stopDragRoiPoint')"
        >
          <img
            v-if="detectorFrameUrl"
            class="camera-preview-media"
            :src="detectorFrameUrl"
            :alt="selectedCameraStation?.name || 'YOLO detector frame'"
          />
          <img
            v-else-if="selectedCameraPreviewKind === 'image' && selectedCameraUrl"
            class="camera-preview-media"
            :src="selectedCameraUrl"
            :alt="selectedCameraStation?.name || 'Station camera'"
          />
          <video
            v-else-if="selectedCameraPreviewKind === 'video' && selectedCameraUrl"
            class="camera-preview-media"
            :src="selectedCameraUrl"
            controls
            muted
            playsinline
          ></video>
          <div v-else class="camera-preview-empty">
            <strong v-if="selectedCameraPreviewKind === 'rtsp'">
              {{ detectorStatus?.running ? text.yoloStarting : text.rtspCameraSaved }}
            </strong>
            <strong v-else-if="selectedCameraPreviewKind === 'none'">{{ text.noCameraSource }}</strong>
            <strong v-else>{{ text.previewUnavailable }}</strong>
            <p v-if="selectedCameraPreviewKind === 'rtsp'">
              {{ detectorStatus?.running ? text.waitingFirstFrame : text.startRtspHint }}
            </p>
            <p v-else-if="selectedCameraPreviewKind === 'none'">
              {{ text.editCameraFirst }}
            </p>
            <p v-else>
              {{ text.browserPreviewUnavailable }}
            </p>
          </div>
          <svg
            v-if="roiBox"
            class="roi-overlay"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect
              class="roi-rect"
              :x="roiBox.x"
              :y="roiBox.y"
              :width="roiBox.width"
              :height="roiBox.height"
            />
          </svg>
        </div>

        <label v-if="selectedCameraUrl" class="camera-source-field">
          <span>{{ text.cameraSource }}</span>
          <input :value="selectedCameraUrl" readonly />
        </label>

        <div class="camera-control-row">
          <div class="roi-toolbar">
          <button v-if="!isEditingRoi" class="secondary-btn compact-btn" type="button" @click="$emit('startRoiEditor')">
            {{ text.drawDetectionArea }}
          </button>
          <template v-else>
            <button class="primary-btn compact-btn" type="button" @click="$emit('saveSelectedRoi')">{{ text.saveArea }}</button>
            <button class="secondary-btn compact-btn" type="button" @click="$emit('cancelRoiEditor')">{{ text.cancel }}</button>
            <button class="secondary-btn compact-btn" type="button" @click="$emit('clearRoiDraft')">{{ text.clear }}</button>
            <button class="secondary-btn compact-btn" type="button" @click="$emit('setRoiPreset', 'full')">{{ text.fullFrame }}</button>
          </template>
          </div>

          <div v-if="selectedCameraUrl" class="camera-actions">
          <button
            v-if="!detectorStatus?.running"
            class="primary-btn compact-btn"
            type="button"
            :disabled="detectorBusy"
            @click="$emit('startSelectedDetector')"
          >
            {{ detectorBusy ? text.starting : text.startDetection }}
          </button>
          <button
            v-else
            class="secondary-btn compact-btn"
            type="button"
            :disabled="detectorBusy"
            @click="$emit('stopSelectedDetector')"
          >
            {{ detectorBusy ? text.stopping : text.stopDetection }}
          </button>
          </div>
        </div>

        <div v-if="detectorStatus" class="detector-status">
          <span :class="{ live: detectorStatus.running }"></span>
          <strong>{{ detectorStatus.running ? text.detectorRunning : text.detectorStopped }}</strong>
          <small v-if="detectorStatus.lastError">{{ detectorStatus.lastError }}</small>
          <small v-else-if="detectorStatus.lastLog">{{ detectorStatus.lastLog }}</small>
        </div>
      </section>
    </article>
  </section>
</template>
