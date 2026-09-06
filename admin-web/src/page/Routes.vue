<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { api } from '../services/api';
import type { ShuttleRoute, Station } from '../types';

const props = defineProps<{ routes: ShuttleRoute[]; stations: Station[]; lang: 'en' | 'th'; loadMaps: () => Promise<void> }>();
const emit = defineEmits<{ saved: [route: ShuttleRoute]; reloaded: [routes: ShuttleRoute[]]; dirty: [value: boolean] }>();
type Point = [number, number];
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const thai = computed(() => props.lang === 'th');
const tr = (en: string, th: string) => thai.value ? th : en;
const draft = reactive<ShuttleRoute>({ id: '', name: '', nameTH: '', color: '#8c1515', enabled: true, geometry: { type: 'LineString', coordinates: [] } });
const hasDraft = ref(false);
const original = ref('');
const points = ref<Point[]>([]);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const mapError = ref('');
const mapLoading = ref(true);
const drawing = ref(false);
const selectedPoint = ref<number | null>(null);
const mapEl = ref<HTMLElement | null>(null);
const fileEl = ref<HTMLInputElement | null>(null);
const history = ref<Point[][]>([]);
const historyIndex = ref(-1);
let map: any;
let polyline: any;
let markers: any[] = [];
let pathListeners: any[] = [];
let mapListeners: any[] = [];
let disposed = false;
const payload = () => ({ ...draft, geometry: { type: 'LineString' as const, coordinates: copy(points.value) } });
const dirty = computed(() => hasDraft.value && JSON.stringify(payload()) !== original.value);
watch(dirty, value => emit('dirty', value));
const routeName = (route: ShuttleRoute) => thai.value && route.nameTH ? route.nameTH : route.name;
function canDiscard() { return !dirty.value || window.confirm(tr('Discard unsaved route changes?', 'ทิ้งการแก้ไขเส้นทางที่ยังไม่ได้บันทึกหรือไม่?')); }

function record() {
  history.value = history.value.slice(0, historyIndex.value + 1);
  history.value.push(copy(points.value));
  if (history.value.length > 60) history.value.shift();
  historyIndex.value = history.value.length - 1;
}
function bindPath() {
  pathListeners.forEach(listener => listener.remove());
  const path = polyline.getPath();
  const changed = () => {
    points.value = path.getArray().map((point: any) => [point.lng(), point.lat()]);
    selectedPoint.value = null;
    record();
    notice.value = '';
  };
  pathListeners = ['insert_at', 'set_at', 'remove_at'].map(event => path.addListener(event, changed));
}
function syncPath() {
  if (!polyline) return;
  polyline.setPath(points.value.map(([lng, lat]) => ({ lat, lng })));
  polyline.setOptions({ strokeColor: draft.color, editable: hasDraft.value && !drawing.value && !busy.value });
  bindPath();
}
function replacePoints(next: Point[], remember = true) {
  points.value = copy(next);
  selectedPoint.value = null;
  if (remember) record();
  syncPath();
  notice.value = '';
}
function selectRoute(route: ShuttleRoute) {
  if (busy.value || !canDiscard()) return;
  Object.assign(draft, copy(route));
  hasDraft.value = true;
  drawing.value = false;
  history.value = [];
  historyIndex.value = -1;
  replacePoints(route.geometry.coordinates);
  original.value = JSON.stringify(payload());
  error.value = '';
  fit();
}
function newRoute() {
  if (busy.value || !canDiscard()) return;
  let number = 1;
  while (props.routes.some(route => route.id === `line${number}`)) number++;
  Object.assign(draft, { id: `line${number}`, name: `Line ${number}`, nameTH: `สาย ${number}`, color: '#8c1515', enabled: true, revision: undefined });
  hasDraft.value = true;
  drawing.value = true;
  history.value = [];
  historyIndex.value = -1;
  replacePoints([]);
  original.value = JSON.stringify(payload());
  error.value = '';
}
function undo(delta: number) {
  const next = historyIndex.value + delta;
  if (next < 0 || next >= history.value.length) return;
  historyIndex.value = next;
  replacePoints(history.value[next], false);
}
function removePoint() {
  if (selectedPoint.value === null) return;
  replacePoints(points.value.filter((_, index) => index !== selectedPoint.value));
}
function clearPath() {
  if (points.value.length && window.confirm(tr('Clear all points in this draft?', 'ล้างจุดทั้งหมดในเส้นทางที่กำลังแก้ไขหรือไม่?'))) replacePoints([]);
}
function fit() {
  if (!map || !points.value.length) return;
  const bounds = new window.google!.maps.LatLngBounds();
  points.value.forEach(([lng, lat]) => bounds.extend({ lat, lng }));
  map.fitBounds(bounds, 48);
}
async function save() {
  if (busy.value) return;
  if (points.value.length < 2 || points.value.length > 5000) {
    error.value = tr('Draw between 2 and 5000 points.', 'กรุณาวาดเส้นทาง 2–5000 จุด'); return;
  }
  busy.value = true; error.value = ''; notice.value = '';
  try {
    const saved = await api.saveRoute(payload());
    Object.assign(draft, saved);
    original.value = JSON.stringify(payload());
    emit('saved', saved);
    notice.value = tr('Route saved. Passenger web uses it on its next refresh.', 'บันทึกแล้ว เว็บผู้ใช้จะแสดงเส้นทางนี้เมื่อรีเฟรชข้อมูล');
  } catch (err) { error.value = err instanceof Error ? err.message : 'Could not save route'; }
  finally { busy.value = false; }
}
async function reload() {
  if (!canDiscard() || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const routes = await api.getRoutes();
    emit('reloaded', routes);
    original.value = JSON.stringify(payload());
    busy.value = false;
    const selected = routes.find(route => route.id === draft.id) || routes[0];
    if (selected) selectRoute(selected); else { hasDraft.value = false; replacePoints([]); }
  } catch (err) { error.value = err instanceof Error ? err.message : 'Could not load routes'; }
  finally { busy.value = false; }
}
async function deleteRoute() {
  if (busy.value || !draft.revision) return;
  const name = routeName(draft);
  if (!window.confirm(tr(`Delete "${name}" (${draft.id})? Its route and any unsaved changes will be removed.`, `ลบสาย "${name}" (${draft.id}) หรือไม่? เส้นทางและการแก้ไขที่ยังไม่บันทึกจะถูกลบ`))) return;
  busy.value = true; error.value = ''; notice.value = '';
  try {
    await api.deleteRoute(draft.id, draft.revision);
    const remaining = props.routes.filter(route => route.id !== draft.id);
    original.value = JSON.stringify(payload());
    hasDraft.value = false;
    drawing.value = false;
    history.value = [];
    historyIndex.value = -1;
    replacePoints([], false);
    emit('reloaded', remaining);
    busy.value = false;
    if (remaining[0]) selectRoute(remaining[0]);
    notice.value = tr('Line deleted.', 'ลบสายเรียบร้อยแล้ว');
  } catch (err) { error.value = err instanceof Error ? err.message : 'Could not delete route'; }
  finally { busy.value = false; }
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  busy.value = true;
  try {
    if (file.size > 1024 * 1024) throw new Error(tr('File must be under 1 MB.', 'ไฟล์ต้องมีขนาดไม่เกิน 1 MB'));
    const json = JSON.parse(await file.text());
    if (disposed) return;
    const geometry = json.type === 'FeatureCollection' && json.features?.length === 1 ? json.features[0].geometry : json.type === 'Feature' ? json.geometry : json;
    const coordinates = geometry?.coordinates;
    if (geometry?.type !== 'LineString' || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 5000 || !coordinates.every((p: unknown) => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && Number.isFinite(v)) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85)) {
      throw new Error(tr('Use a GeoJSON file containing one LineString with 2–5000 [longitude, latitude] points.', 'ใช้ GeoJSON ที่มี LineString เดียว จำนวน 2–5000 จุด [ลองจิจูด, ละติจูด]'));
    }
    replacePoints(coordinates); fit(); error.value = '';
  } catch (err) { error.value = err instanceof Error ? err.message : 'Invalid GeoJSON'; }
  finally { busy.value = false; }
}
function exportFile() {
  const file = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { routeId: draft.id, name: draft.name, nameTH: draft.nameTH, color: draft.color }, geometry: payload().geometry }] };
  const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/geo+json' }));
  const link = document.createElement('a'); link.href = url; link.download = `polyline_${draft.id}_mfu.geojson`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function drawStations() {
  markers.forEach(marker => marker.setMap(null)); markers = [];
  if (!map) return;
  const maps = window.google!.maps;
  markers = props.stations.map(station => new maps.Marker({ map, position: { lat: station.lat, lng: station.lng }, title: `${station.id} · ${thai.value ? station.nameTH || station.name : station.name}`, clickable: false, icon: { path: maps.SymbolPath.CIRCLE, scale: 5, fillColor: '#ffffff', fillOpacity: 1, strokeColor: '#64748b', strokeWeight: 2 } }));
}
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = ''; } }
watch(() => draft.color, () => polyline?.setOptions({ strokeColor: draft.color }));
watch([drawing, busy], () => polyline?.setOptions({ editable: !drawing.value && !busy.value && hasDraft.value }));
watch(() => props.stations, drawStations);
watch(() => props.routes, routes => { if (!hasDraft.value && routes[0]) selectRoute(routes[0]); });
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload);
  if (props.routes[0]) selectRoute(props.routes[0]);
  try {
    await props.loadMaps();
    if (disposed || !mapEl.value) return;
    const maps = window.google!.maps as any;
    map = new maps.Map(mapEl.value, { center: { lat: 20.049, lng: 99.895 }, zoom: 15, mapTypeControl: true, streetViewControl: false, clickableIcons: false, disableDoubleClickZoom: true, gestureHandling: 'cooperative' });
    polyline = new maps.Polyline({ map, strokeWeight: 5, strokeOpacity: 0.9 });
    mapListeners.push(map.addListener('click', (event: any) => {
      if (drawing.value && !busy.value && hasDraft.value && event.latLng && points.value.length < 5000) replacePoints([...points.value, [event.latLng.lng(), event.latLng.lat()]]);
    }));
    mapListeners.push(polyline.addListener('click', (event: any) => { if (Number.isInteger(event.vertex)) selectedPoint.value = event.vertex; }));
    syncPath(); drawStations(); fit();
  } catch (err) { mapError.value = err instanceof Error ? err.message : 'Could not load map'; }
  finally { mapLoading.value = false; }
});
onUnmounted(() => {
  disposed = true; window.removeEventListener('beforeunload', beforeUnload);
  [...pathListeners, ...mapListeners].forEach(listener => listener.remove());
  markers.forEach(marker => marker.setMap(null)); polyline?.setMap(null); emit('dirty', false);
});
</script>

<template>
  <section class="route-page">
    <div class="route-heading">
      <div><h2>{{ tr('Route settings', 'ตั้งค่าเส้นทางรถ') }}</h2><p class="muted">{{ tr('Create lines and draw the paths buses follow.', 'สร้างสายรถและวาดเส้นทางเดินรถบนแผนที่') }}</p></div>
      <button class="secondary-btn compact-btn" :disabled="busy" @click="reload">{{ tr('Reload routes', 'โหลดเส้นทางใหม่') }}</button>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="notice" class="registration-notice" role="status">{{ notice }}</p>
    <div class="route-layout">
      <aside class="panel route-list">
        <div class="panel-heading"><h3>{{ tr('Lines', 'สายรถ') }} ({{ routes.length }})</h3><button class="primary-btn compact-btn" :disabled="busy" @click="newRoute">+ {{ tr('New line', 'เพิ่มสาย') }}</button></div>
        <button v-for="route in routes" :key="route.id" class="route-list-item" :class="{ selected: hasDraft && draft.id === route.id }" :disabled="busy" @click="selectRoute(route)">
          <span class="route-swatch" :style="{ background: route.color }"></span><span><strong>{{ routeName(route) }}</strong><small>{{ route.id }} · {{ route.geometry.coordinates.length }} {{ tr('points', 'จุด') }}{{ route.enabled ? '' : tr(' · Hidden', ' · ซ่อน') }}</small></span>
        </button>
        <p v-if="!routes.length" class="muted">{{ tr('No routes yet. Create your first line.', 'ยังไม่มีเส้นทาง กดเพิ่มสายเพื่อเริ่มวาด') }}</p>
      </aside>
      <article class="panel route-editor">
        <form v-if="hasDraft" @submit.prevent="save">
          <fieldset class="route-fields" :disabled="busy">
            <label>{{ tr('Line ID', 'รหัสสาย') }}<input v-model="draft.id" required pattern="[a-z][a-z0-9_-]{0,39}" maxlength="40" :disabled="Boolean(draft.revision)" placeholder="line3" /></label>
            <label>{{ tr('English name', 'ชื่อภาษาอังกฤษ') }}<input v-model="draft.name" required maxlength="100" /></label>
            <label>{{ tr('Thai name', 'ชื่อภาษาไทย') }}<input v-model="draft.nameTH" maxlength="100" /></label>
            <label>{{ tr('Color', 'สีเส้นทาง') }}<input v-model="draft.color" type="color" /></label>
            <label class="route-enabled"><input v-model="draft.enabled" type="checkbox" />{{ tr('Show on passenger web', 'แสดงในเว็บผู้ใช้') }}</label>
          </fieldset>
          <div class="route-toolbar">
            <button type="button" class="secondary-btn compact-btn" :class="{ 'route-tool-active': drawing }" :aria-pressed="drawing" :disabled="busy" @click="drawing = !drawing">{{ drawing ? tr('Finish drawing', 'เสร็จสิ้นการวาด') : tr('Add points', 'วาดเพิ่มจุด') }}</button>
            <button type="button" class="secondary-btn compact-btn" :disabled="busy || historyIndex <= 0" @click="undo(-1)">{{ tr('Undo', 'ย้อนกลับ') }}</button>
            <button type="button" class="secondary-btn compact-btn" :disabled="busy || historyIndex >= history.length - 1" @click="undo(1)">{{ tr('Redo', 'ทำซ้ำ') }}</button>
            <button type="button" class="secondary-btn compact-btn" :disabled="busy || selectedPoint === null" @click="removePoint">{{ tr('Delete selected point', 'ลบจุดที่เลือก') }}</button>
            <button type="button" class="secondary-btn compact-btn" :disabled="!points.length" @click="fit">{{ tr('Fit route', 'ดูทั้งเส้นทาง') }}</button>
            <button type="button" class="link-btn" :disabled="busy || !points.length" @click="clearPath">{{ tr('Clear points', 'ล้างจุด') }}</button>
          </div>
          <p class="route-hint">{{ drawing ? tr('Click the map to append points. Finish drawing to reshape the path.', 'คลิกบนแผนที่เพื่อเพิ่มจุดต่อท้าย กดเสร็จสิ้นการวาดเพื่อปรับเส้นทาง') : tr('Drag a vertex to move it; drag a midpoint to insert a point. Click a vertex to select it for deletion.', 'ลากจุดเพื่อย้ายตำแหน่ง ลากจุดกึ่งกลางเพื่อแทรกจุดใหม่ คลิกจุดเพื่อเลือกแล้วกดลบ') }}</p>
          <div class="route-save-bar"><span>{{ points.length }} {{ tr('points', 'จุด') }} <b v-if="dirty">· {{ tr('Unsaved changes', 'ยังไม่ได้บันทึก') }}</b></span><button class="primary-btn compact-btn" type="submit" :disabled="busy || points.length < 2">{{ busy ? tr('Saving...', 'กำลังบันทึก...') : tr('Save route', 'บันทึกเส้นทาง') }}</button></div>
        </form>
        <div v-else class="route-hint">{{ tr('Select a line or create one to begin.', 'เลือกสายรถหรือเพิ่มสายใหม่เพื่อเริ่มต้น') }}</div>
        <div class="route-map-wrap"><div ref="mapEl" class="route-map" :aria-label="tr('Route editor map', 'แผนที่แก้ไขเส้นทาง')"></div><p v-if="mapLoading" class="route-map-message">{{ tr('Loading map...', 'กำลังโหลดแผนที่...') }}</p><p v-if="mapError" class="route-map-message error-text" role="alert">{{ mapError }}</p></div>
        <div v-if="hasDraft" class="route-file-bar">
          <button v-if="draft.revision" class="danger-link" type="button" :disabled="busy" @click="deleteRoute">{{ tr('Delete line', 'ลบสาย') }}</button>
          <input ref="fileEl" type="file" accept=".geojson,.json,application/geo+json,application/json" hidden @change="importFile" />
          <button class="link-btn" :disabled="busy" @click="fileEl?.click()">{{ tr('Import GeoJSON', 'นำเข้า GeoJSON') }}</button>
          <button class="link-btn" :disabled="points.length < 2" @click="exportFile">{{ tr('Export GeoJSON', 'ส่งออก GeoJSON') }}</button>
          <small>{{ tr('Station markers are shown for reference.', 'จุดสถานีแสดงเพื่อใช้อ้างอิงตำแหน่ง') }}</small>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.route-heading,.route-toolbar,.route-save-bar,.route-file-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.route-heading,.route-save-bar { justify-content:space-between; }
.route-heading h2 { margin-bottom:6px; }.route-heading p { margin-bottom:16px; }
.route-layout { display:grid; grid-template-columns:250px minmax(0,1fr); gap:18px; margin-top:16px; align-items:start; }
.route-list,.route-editor { min-width:0; }.route-list h3 { margin:0; }
.route-list-item { display:flex; gap:12px; align-items:center; width:100%; padding:14px 10px; margin:6px 0; text-align:left; border:1px solid transparent; border-radius:12px; background:#f8fafc; color:var(--ink); }
.route-list-item.selected { border-color:var(--mfu-red); background:#fff5f4; }.route-list-item small { display:block; margin-top:4px; }
.route-list-item > span:last-child { min-width:0; overflow-wrap:anywhere; }
.route-swatch { width:24px; height:5px; border-radius:3px; flex-shrink:0; }
.route-fields { border:0; padding:0; margin:0 0 16px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.route-fields input[type=color] { height:44px; padding:4px; }.route-enabled { display:flex; align-items:center; grid-column:1 / -1; }.route-enabled input { width:auto; }
.route-tool-active { background:var(--mfu-red); color:white; }.route-hint { font-size:13px; line-height:1.65; color:var(--muted); margin:12px 0; }
.route-save-bar { margin:12px 0; font-size:13px; }.route-save-bar b { color:var(--mfu-red); }
.route-map-wrap { position:relative; margin-top:12px; }.route-map { height:530px; min-height:320px; border:1px solid var(--line); border-radius:16px; background:#eef2f6; }
.route-map-message { position:absolute; top:16px; left:16px; right:16px; padding:16px; background:white; border-radius:10px; }
.route-file-bar { margin-top:14px; }.route-file-bar small { margin-left:auto; }
@media(max-width:1100px) { .route-layout { grid-template-columns:1fr; }.route-list { max-height:280px; overflow:auto; } }
@media(max-width:600px) { .route-fields { grid-template-columns:1fr; }.route-map { height:420px; }.route-toolbar { gap:6px; }.route-file-bar small { margin-left:0; } }
</style>
