<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { crowdColor } from '../services/crowd';
import type { CrowdThresholds } from '../types';

const props = defineProps<{ loading: boolean; thresholds: CrowdThresholds; savedVersion: number; text: Record<string, any> }>();
const emit = defineEmits<{ save: [thresholds: CrowdThresholds] }>();
const tr = (en: string, th: string) => props.text.language === 'TH' ? th : en;
const builtins = ['low', 'medium', 'high'] as const;
const isBuiltin = (id: string): id is typeof builtins[number] => (builtins as readonly string[]).includes(id);
type Draft = { min: string; max: string; color: string; name: string };
const makeForm = (): Record<string, Draft> => Object.fromEntries([
  ...builtins.map(id => [id, { min: String(props.thresholds[id].min), max: props.thresholds[id].max === null ? '' : String(props.thresholds[id].max), color: crowdColor(id, props.thresholds), name: props.thresholds.names?.[id] || id }]),
  ...(props.thresholds.customStatuses || []).map(item => [item.id, { min: String(item.min), max: item.max === null ? '' : String(item.max), color: item.color, name: item.name }]),
]);
// Keep incomplete input in the draft until Save; adding a row does not alter saved ranges.
const form = reactive(makeForm());
const levels = ref(Object.keys(form));
const edited = ref(false);
const editing = ref(false);
const saved = ref(false);
const lastUpdated = ref('');
const statusName = (id: string) => isBuiltin(id) && form[id].name === id ? props.text[id] : form[id].name || tr('New status', 'สถานะใหม่');
const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
const colorErrors = computed(() => levels.value.filter(level => !isHexColor(form[level].color)));
const previewColor = (level: string) => isHexColor(form[level].color) ? form[level].color : crowdColor(level, props.thresholds);
const fieldsValid = computed(() => levels.value.every(level => {
  const { min, max, color, name } = form[level];
  return isHexColor(color) && name.trim().length > 0 && name.trim().length <= 60 && min.trim() !== '' && Number.isSafeInteger(Number(min)) && Number(min) >= 0 &&
    (max === '' || (Number.isSafeInteger(Number(max)) && Number(max) > Number(min)));
}));
const rangeError = computed(() => {
  if (!fieldsValid.value) return '';
  const names = levels.value.map(id => form[id].name.trim().toLowerCase());
  if (new Set(names).size !== names.length || names.includes('unknown')) return tr('Use a unique name for each status.', 'กรุณาตั้งชื่อสถานะไม่ซ้ำกัน');
  for (let index = 1; index < levels.value.length; index++) {
    const previous = levels.value[index - 1];
    const current = levels.value[index];
    if (form[previous].max === '') return tr(`${statusName(previous)} needs an end. Only the last status can be unlimited.`, `${statusName(previous)} ต้องระบุสิ้นสุด เว้นว่างได้เฉพาะสถานะสุดท้าย`);
    if (Number(form[current].min) <= Number(form[previous].max)) return tr(`${statusName(current)} must start after ${statusName(previous)} ends.`, `${statusName(current)} ต้องเริ่มตั้งแต่ ${Number(form[previous].max) + 1} ขึ้นไป เพื่อไม่ชนกับ ${statusName(previous)}`);
  }
  return '';
});
const valid = computed(() => fieldsValid.value && !rangeError.value);
function minimumStart(level: string) {
  const index = levels.value.indexOf(level);
  const previous = index > 0 ? form[levels.value[index - 1]] : null;
  return previous && previous.max !== '' && Number.isSafeInteger(Number(previous.max)) ? Number(previous.max) + 1 : 0;
}
const rangeValue = (level: string) => ({ min: Number(form[level].min), max: form[level].max === '' ? null : Number(form[level].max) });
// Keep built-in IDs stable while serializing edited labels and custom rows.
const payload = (): CrowdThresholds => {
  const ordered = levels.value.map(id => ({ id, ...form[id] }));
  const first = ordered[0];
  const second = ordered[1] ?? first;
  const third = ordered[2] ?? second ?? first;
  const baseNames = [first, second, third].filter(Boolean).map(item => ({
    id: item.id,
    name: item.name.trim(),
    min: Number(item.min),
    max: item.max === '' ? null : Number(item.max),
    color: item.color.toLowerCase(),
  }));
  const lowItem = baseNames[0] ?? { id: 'low', name: form.low.name.trim(), min: Number(form.low.min), max: form.low.max === '' ? null : Number(form.low.max), color: form.low.color.toLowerCase() };
  const mediumItem = baseNames[1] ?? lowItem;
  const highItem = baseNames[2] ?? mediumItem;
  return {
    names: Object.fromEntries(
      [lowItem, mediumItem, highItem].filter(item => item.name.trim() && item.name.trim().toLowerCase() !== item.id.toLowerCase()).map(item => [item.id.toLowerCase(), item.name.trim()])
    ),
    low: { min: Number(lowItem.min), max: lowItem.max },
    medium: { min: Number(mediumItem.min), max: mediumItem.max },
    high: { min: Number(highItem.min), max: highItem.max },
    colors: { low: lowItem.color, medium: mediumItem.color, high: highItem.color },
    customStatuses: ordered.slice(3).map(item => ({ id: item.id, name: item.name.trim(), min: Number(item.min), max: item.max === '' ? null : Number(item.max), color: item.color.toLowerCase() })),
  };
};
const dirty = computed(() => {
  const original = makeForm();
  return !valid.value || JSON.stringify(levels.value) !== JSON.stringify(Object.keys(original)) || levels.value.some(id => {
    const before = original[id], now = form[id];
    return !before || before.name !== now.name.trim() || before.color.toLowerCase() !== now.color.toLowerCase() || Number(before.min) !== Number(now.min) || before.max !== now.max;
  });
});
function reset() {
  for (const id of Object.keys(form)) delete form[id];
  Object.assign(form, makeForm()); levels.value = Object.keys(form); edited.value = false; saved.value = false;
}
// Background refreshes preserve the draft; only a successful save resets it.
watch(() => props.thresholds, () => { if (!edited.value) reset(); });
// Show the timestamp only after the parent confirms that the save completed.
watch(() => props.savedVersion, () => {
  reset();
  saved.value = true;
  editing.value = false;
  const now = new Date();
  const formatted = new Intl.DateTimeFormat(props.text.language === 'TH' ? 'th-TH' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  lastUpdated.value = formatted;
});
function startEditing() {
  editing.value = true; saved.value = false;
  void nextTick(() => document.getElementById('crowd-low-name')?.focus());
}
function cancelEditing() { reset(); editing.value = false; }
function update(level: string, bound: keyof Draft, event: Event) {
  if (props.loading || !editing.value) return;
  const value = (event.target as HTMLInputElement).value;
  const trimmed = value.trim();
  form[level][bound] = bound === 'color' ? (/^[0-9a-f]{6}$/i.test(trimmed) ? `#${trimmed}` : trimmed) : value;
  edited.value = true; saved.value = false;
}
function addStatus() {
  if (props.loading || levels.value.length >= 23) return;
  editing.value = true;
  // getRandomValues also works on HTTP LAN addresses used for local device testing.
  const id = `custom_${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  const previous = form[levels.value[levels.value.length - 1]];
  const start = previous.max === '' ? '' : String(Number(previous.max) + 1);
  form[id] = { name: '', min: start, max: '', color: '#8b5cf6' };
  levels.value.push(id); edited.value = true; saved.value = false;
  void nextTick(() => document.getElementById(`crowd-${id}-name`)?.focus());
}
function removeStatus(id: string) {
  if (props.loading || !editing.value || levels.value.length <= 1) return;
  levels.value = levels.value.filter(level => level !== id); delete form[id]; edited.value = true; saved.value = false;
}
function submit() {
  if (editing.value && valid.value && dirty.value && !props.loading) emit('save', payload());
}
</script>

<template>
  <section class="crowd-settings">
    <header class="settings-heading">
      <span class="settings-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></svg></span>
      <div><h1>{{ text.tabs.settings }}</h1></div>
    </header>
    <form class="crowd-settings-card" @submit.prevent="submit">
      <div class="settings-intro">
        <div>
          <h2>{{ tr('Station crowd levels', 'ระดับความหนาแน่นของสถานี') }}</h2>
          <p>{{ tr('Apply the same ranges to all stations.', 'ใช้ช่วงจำนวนคนเดียวกันกับทุกสถานี') }}</p>
        </div>
        <div class="settings-actions"><button class="settings-edit" type="button" :disabled="loading || editing" :aria-label="tr('Edit statuses', 'แก้ไขสถานะ')" :aria-pressed="editing" @click="startEditing"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z" /></svg>{{ tr('Edit', 'แก้ไข') }}</button><button class="settings-add" type="button" :disabled="loading || levels.length >= 23" @click="addStatus"><span aria-hidden="true">+</span> {{ tr('Add status', 'เพิ่มสถานะ') }}</button></div>
      </div>
      <div v-for="level in levels" :key="level" class="settings-row" :class="level" :style="{ '--level-color': previewColor(level) }">
        <span class="settings-level"><i aria-hidden="true"></i><strong v-if="!editing">{{ statusName(level) }}</strong><input v-else :id="`crowd-${level}-name`" class="settings-name" :value="form[level].name" :placeholder="tr('Status name', 'ชื่อสถานะ')" :aria-label="tr('Status name', 'ชื่อสถานะ')" maxlength="60" required :disabled="loading || !editing" @input="update(level, 'name', $event)" /></span>
        <div class="settings-number">
          <div class="settings-color-group">
            <label :for="`crowd-${level}-hex`">{{ tr('Color', 'สี') }}</label>
            <div class="settings-color-control" :class="{ invalid: !isHexColor(form[level].color) }" role="group" :aria-label="`${statusName(level)} ${tr('color', 'สี')}`">
              <input :id="`crowd-${level}-color`" class="settings-swatch" :value="previewColor(level)" :aria-label="`${statusName(level)} ${tr('choose color', 'เลือกสี')}`" type="color" :disabled="loading || !editing" @input="update(level, 'color', $event)" />
              <input :id="`crowd-${level}-hex`" class="settings-hex" :value="form[level].color" :aria-label="`${statusName(level)} HEX`" :aria-invalid="!isHexColor(form[level].color)" :aria-describedby="!isHexColor(form[level].color) ? 'settings-color-error' : undefined" type="text" placeholder="#FF5733" spellcheck="false" autocomplete="off" required :disabled="loading || !editing" @input="update(level, 'color', $event)" />
            </div>
          </div>
          <label :for="`crowd-${level}-min`">{{ tr('From', 'เริ่ม') }}<input :id="`crowd-${level}-min`" :value="form[level].min" :aria-label="`${statusName(level)} ${tr('from', 'เริ่ม')}`" type="number" :min="minimumStart(level)" step="1" required :disabled="loading || !editing" @input="update(level, 'min', $event)" /></label>
          <label :for="`crowd-${level}-max`">{{ tr('To', 'สิ้นสุด') }}<input :id="`crowd-${level}-max`" :value="form[level].max" :aria-label="`${statusName(level)} ${tr('to', 'สิ้นสุด')}`" type="number" :min="Number(form[level].min) || 0" step="1" :required="level !== levels[levels.length - 1]" :placeholder="level === levels[levels.length - 1] ? tr('No limit', 'ไม่จำกัด') : tr('Required', 'ระบุเลข')" :disabled="loading || !editing" @input="update(level, 'max', $event)" /></label>
        </div>
        <button v-if="editing" class="settings-remove" type="button" :disabled="loading || levels.length <= 1" :aria-label="`${tr('Remove', 'ลบ')} ${statusName(level)}`" @click="removeStatus(level)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
        </button>
      </div>
      <div class="settings-preview" aria-live="polite">
        <template v-if="valid"><span v-for="level in levels" :key="level" :class="level" :style="{ borderLeft: `3px solid ${form[level].color}` }">{{ statusName(level) }} <b>{{ form[level].min }}{{ form[level].max === '' ? '+' : `–${form[level].max}` }}</b></span></template>
        <p v-else-if="colorErrors.length" id="settings-color-error" role="alert">{{ colorErrors.map(statusName).join(', ') }}: {{ tr('Enter a 6-digit HEX color, e.g. #FF5733.', 'กรอกรหัสสี HEX 6 หลัก เช่น #FF5733') }}</p>
        <p v-else-if="rangeError" role="alert">{{ rangeError }}</p>
        <p v-else role="alert">{{ tr('Enter a status name and non-negative whole numbers; the end must be at least the start.', 'กรอกชื่อสถานะและจำนวนเต็มตั้งแต่ 0 ค่าสิ้นสุดต้องไม่น้อยกว่าค่าเริ่ม') }}</p>
      </div>
      <p class="settings-help">{{ tr('Ranges increase from top to bottom without overlap. Each status must have a start lower than its end. Only the last status may have no end. Set the previous end before adding a higher range. Gaps show “Outside ranges”.', 'ช่วงเรียงจากบนลงล่างและไม่ทับกัน แต่ละสถานะต้องมีค่าเริ่มน้อยกว่าสิ้นสุด เว้นสิ้นสุดว่างได้เฉพาะสถานะสุดท้าย เมื่อเพิ่มสถานะให้กำหนดสิ้นสุดของช่วงก่อนหน้า หากเว้นช่วงจะแสดง “นอกช่วงที่กำหนด”') }}</p>
      <footer class="settings-footer">
        <span role="status">
          {{ saved ? tr('Changes saved', 'บันทึกเรียบร้อยแล้ว') : dirty ? tr('Unsaved changes', 'มีการแก้ไขที่ยังไม่บันทึก') : '' }}
          {{ lastUpdated ? ` · ${tr('Last updated', 'อัปเดตล่าสุด')}: ${lastUpdated}` : '' }}
        </span>
        <button v-if="editing" class="settings-reset" type="button" :disabled="loading" @click="cancelEditing">{{ tr('Cancel', 'ยกเลิก') }}</button>
        <button v-if="editing" class="settings-save" type="submit" :disabled="loading || !valid || !dirty">{{ loading ? tr('Saving…', 'กำลังบันทึก…') : tr('Save changes', 'บันทึก') }}</button>
      </footer>
    </form>
  </section>
</template>

<style scoped>
.crowd-settings { width: 100%; max-width: 540px; }
.settings-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.settings-heading h1 { margin: 0 0 3px; font-size: 20px; }
.settings-heading p, .settings-intro p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.settings-symbol { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 12px; background: #f8eded; color: var(--mfu-red); }
.settings-symbol svg { width: 21px; fill: #f8eded; stroke: currentColor; stroke-width: 1.7; }
.crowd-settings-card { background: white; border: 1px solid var(--line); border-radius: 16px; padding: 20px; box-shadow: 0 5px 20px #23324706; }
.settings-intro { flex-wrap: wrap; margin-bottom: 14px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.settings-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.settings-edit { display: inline-flex; align-items: center; gap: 5px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; color: var(--mfu-red); background: white; font-size: 12px; }
.settings-edit svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.settings-edit:disabled { opacity: .5; cursor: not-allowed; }
.settings-edit:focus-visible { outline: 2px solid var(--mfu-red); outline-offset: 2px; }
.settings-number input:disabled { opacity: 1; color: var(--muted); background: #f8fafc; cursor: default; }
.settings-add { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; padding: 7px 9px; border: 1px solid #ead3d3; border-radius: 8px; background: #fbf3f3; color: var(--mfu-red); font-size: 12px; cursor: pointer; }
.settings-add span { font-size: 18px; line-height: 1; }
.settings-add:disabled, .settings-remove:disabled { opacity: .5; cursor: not-allowed; }
.settings-name { width: 100px; font-size: 12px; padding: 7px; border-radius: 7px; }
.settings-remove { display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0; border: 0; border-radius: 6px; background: transparent; color: var(--mfu-red); padding: 6px; }
.settings-remove svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.settings-remove:hover:not(:disabled) { background: #fbf3f3; }
.settings-row { flex-wrap: wrap; }
.settings-number { margin-left: auto; }
.settings-add:focus-visible, .settings-remove:focus-visible { outline: 2px solid var(--mfu-red); outline-offset: 2px; }
.settings-intro h2 { margin: 0 0 4px; font-size: 15px; }
.settings-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid #edf0f4; }
.settings-level { display: flex; align-items: center; gap: 10px; }
.settings-level i { width: 8px; height: 8px; border-radius: 50%; background: var(--level-color); }
.settings-level strong { display: block; font-size: 13px; font-weight: 650; }
.settings-level small { display: block; margin-top: 3px; font-size: 11px; font-weight: 400; }
.low { --level-color: #27864b; } .medium { --level-color: #a56813; } .high { --level-color: #cc3347; }
.settings-number { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.settings-number input { width: 72px; height: 36px; padding: 6px 9px; border-radius: 8px; font-size: 14px; font-weight: 600; }
.settings-color-group { display: grid; gap: 4px; }
.settings-color-control { display: flex; align-items: center; height: 36px; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: white; }
.settings-color-control:focus-within { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(254, 194, 96, .2); }
.settings-color-control.invalid { border-color: #b42335; }
.settings-number .settings-color-control input { border: 0; border-radius: 4px; box-shadow: none; height: 28px; }
.settings-number .settings-color-control .settings-swatch { width: 28px; padding: 0; cursor: pointer; background: transparent; }
.settings-swatch::-webkit-color-swatch-wrapper { padding: 2px; }
.settings-swatch::-webkit-color-swatch { border: 1px solid #00000015; border-radius: 4px; }
.settings-swatch::-moz-color-swatch { border: 1px solid #00000015; border-radius: 4px; }
.settings-number .settings-color-control .settings-hex { width: 86px; padding: 4px 6px; font-family: ui-monospace, monospace; font-size: 12px; }
.settings-number label { font-size: 10px; font-weight: 500; color: var(--muted); gap: 4px; }
.settings-number span { font-size: 12px; color: var(--muted); min-width: 34px; }
.settings-preview { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.settings-preview span { border-radius: 6px; padding: 5px 8px; font-size: 11px; color: var(--level-color); background: #f7f9fb; }
.settings-preview b { margin-left: 4px; font-variant-numeric: tabular-nums; }
.settings-preview p { margin: 0; font-size: 12px; color: #b42335; }
.settings-help { margin: 10px 0 18px; color: var(--muted); font-size: 11px; line-height: 1.6; }
.settings-footer { display: flex; align-items: center; gap: 8px; padding-top: 14px; border-top: 1px solid #edf0f4; }
.settings-footer > span { flex: 1; font-size: 11px; color: var(--muted); }
.settings-footer button { border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; }
.settings-reset { border: 1px solid var(--line); background: white; color: var(--ink); }
.settings-save { border: 1px solid var(--mfu-red); background: var(--mfu-red); color: white; }
.settings-footer button:disabled { opacity: .45; cursor: not-allowed; }
.settings-footer button:focus-visible { outline: 2px solid var(--mfu-red); outline-offset: 3px; }
@media (max-width: 560px) { .settings-row { align-items: flex-start; flex-direction: column; gap: 10px; } }
@media (max-width: 420px) { .settings-number { gap: 6px; } .settings-number input { width: 60px; } .settings-row { gap: 8px; } .crowd-settings-card { padding: 16px; } .settings-footer { flex-wrap: wrap; } .settings-footer > span { flex-basis: 100%; } }
</style>
