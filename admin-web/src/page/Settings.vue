<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { crowdColor } from '../services/crowd';
import type { CrowdThresholds } from '../types';

const props = defineProps<{ loading: boolean; thresholds: CrowdThresholds; savedVersion: number; text: Record<string, any> }>();
const emit = defineEmits<{ save: [thresholds: CrowdThresholds] }>();
const tr = (en: string, th: string) => props.text.language === 'TH' ? th : en;
const levels = ['low', 'medium', 'high'] as const;
// Keep draft numbers as strings so clearing an input does not silently turn it into zero.
const makeForm = () => Object.fromEntries(levels.map(level => [level, { min: String(props.thresholds[level].min), color: crowdColor(level, props.thresholds), max: props.thresholds[level].max === null ? '' : String(props.thresholds[level].max) }])) as Record<typeof levels[number], { min: string; max: string; color: string }>;
const form = reactive(makeForm());
const edited = ref(false);
const saved = ref(false);
const isHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);
const colorErrors = computed(() => levels.filter(level => !isHexColor(form[level].color)));
const previewColor = (level: typeof levels[number]) => isHexColor(form[level].color) ? form[level].color : crowdColor(level, props.thresholds);
const fieldsValid = computed(() => levels.every(level => {
  const { min, max, color } = form[level];
  return /^#[0-9a-f]{6}$/i.test(color) && min.trim() !== '' && Number.isSafeInteger(Number(min)) && Number(min) >= 0 &&
    (max === '' || (Number.isSafeInteger(Number(max)) && Number(max) >= Number(min)));
}));
const rangeError = computed(() => {
  // Bounds are inclusive: if Low ends at 5, Medium must start at 6 or higher.
  // Match the backend rules without changing another field while the admin types.
  if (!fieldsValid.value) return '';
  if (form.low.max === '' || form.medium.max === '') return tr('Set an end for Low and Medium. Only High can be unlimited.', 'กรอกค่าสิ้นสุดของ Low และ Medium โดยเว้นว่างได้เฉพาะ High');
  if (Number(form.medium.min) <= Number(form.low.max)) return tr(`Medium must start at ${Number(form.low.max) + 1} or more, after Low ends.`, `Medium ต้องเริ่มตั้งแต่ ${Number(form.low.max) + 1} ขึ้นไป เพื่อไม่ชนกับ Low`);
  if (Number(form.high.min) <= Number(form.medium.max)) return tr(`High must start at ${Number(form.medium.max) + 1} or more, after Medium ends.`, `High ต้องเริ่มตั้งแต่ ${Number(form.medium.max) + 1} ขึ้นไป เพื่อไม่ชนกับ Medium`);
  return '';
});
const valid = computed(() => fieldsValid.value && !rangeError.value);
function minimumStart(level: typeof levels[number]) {
  const previous = level === 'high' ? form.medium : level === 'medium' ? form.low : null;
  return previous && previous.max !== '' && Number.isSafeInteger(Number(previous.max)) ? Number(previous.max) + 1 : 0;
}
const rangeValue = (level: typeof levels[number]) => ({ min: Number(form[level].min), max: form[level].max === '' ? null : Number(form[level].max) });
const rangePayload = (): CrowdThresholds => ({ low: rangeValue('low'), medium: rangeValue('medium'), high: rangeValue('high') });
const payload = (): CrowdThresholds => ({ ...rangePayload(), colors: { low: form.low.color, medium: form.medium.color, high: form.high.color } });
const dirty = computed(() => !valid.value || levels.some(level => form[level].color.toLowerCase() !== crowdColor(level, props.thresholds).toLowerCase() || payload()[level].min !== props.thresholds[level].min || payload()[level].max !== props.thresholds[level].max));
function reset() { Object.assign(form, makeForm()); edited.value = false; saved.value = false; }
// Background refreshes must not overwrite unsaved edits. Reset after a confirmed save.
watch(() => props.thresholds, () => { if (!edited.value) reset(); });
watch(() => props.savedVersion, () => { reset(); saved.value = true; });
function update(level: typeof levels[number], bound: 'min' | 'max' | 'color', event: Event) {
  const value = (event.target as HTMLInputElement).value;
  const trimmed = value.trim();
  // Accept pasted HEX with or without '#'; leave incomplete input editable for validation.
  form[level][bound] = bound === 'color' ? (/^[0-9a-f]{6}$/i.test(trimmed) ? `#${trimmed}` : trimmed) : value;
  edited.value = true;
  saved.value = false;
}
function submit() {
  if (valid.value && dirty.value && !props.loading) emit('save', payload());
}
</script>

<template>
  <section class="crowd-settings">
    <header class="settings-heading">
      <span class="settings-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></svg></span>
      <div><h1>{{ text.tabs.settings }}</h1><p>{{ tr('Station crowd levels', 'ระดับความหนาแน่นของสถานี') }}</p></div>
    </header>
    <form class="crowd-settings-card" @submit.prevent="submit">
      <div class="settings-intro"><h2>{{ tr('Passenger thresholds', 'เกณฑ์จำนวนคน') }}</h2><p>{{ tr('Apply the same ranges to all stations.', 'ใช้ช่วงจำนวนคนเดียวกันกับทุกสถานี') }}</p></div>
      <div v-for="level in levels" :key="level" class="settings-row" :class="level" :style="{ '--level-color': previewColor(level) }">
        <span class="settings-level"><i aria-hidden="true"></i><strong>{{ text[level] }}</strong></span>
        <div class="settings-number">
          <div class="settings-color-group">
            <label :for="`crowd-${level}-hex`">{{ tr('Color', 'สี') }}</label>
            <div class="settings-color-control" :class="{ invalid: !isHexColor(form[level].color) }" role="group" :aria-label="`${text[level]} ${tr('color', 'สี')}`">
              <input :id="`crowd-${level}-color`" class="settings-swatch" :value="previewColor(level)" :aria-label="`${text[level]} ${tr('choose color', 'เลือกสี')}`" type="color" :disabled="loading" @input="update(level, 'color', $event)" />
              <input :id="`crowd-${level}-hex`" class="settings-hex" :value="form[level].color" :aria-label="`${text[level]} HEX`" :aria-invalid="!isHexColor(form[level].color)" :aria-describedby="!isHexColor(form[level].color) ? 'settings-color-error' : undefined" type="text" placeholder="#FF5733" spellcheck="false" autocomplete="off" required :disabled="loading" @input="update(level, 'color', $event)" />
            </div>
          </div>
          <label :for="`crowd-${level}-min`">{{ tr('From', 'เริ่ม') }}<input :id="`crowd-${level}-min`" :value="form[level].min" :aria-label="`${text[level]} ${tr('from', 'เริ่ม')}`" type="number" :min="minimumStart(level)" step="1" required :disabled="loading" @input="update(level, 'min', $event)" /></label>
          <label :for="`crowd-${level}-max`">{{ tr('To', 'สิ้นสุด') }}<input :id="`crowd-${level}-max`" :value="form[level].max" :aria-label="`${text[level]} ${tr('to', 'สิ้นสุด')}`" type="number" :min="Number(form[level].min) || 0" step="1" :required="level !== 'high'" :placeholder="level === 'high' ? tr('No limit', 'ไม่จำกัด') : tr('Required', 'ระบุเลข')" :disabled="loading" @input="update(level, 'max', $event)" /></label>
        </div>
      </div>
      <div class="settings-preview" aria-live="polite">
        <template v-if="valid"><span v-for="level in levels" :key="level" :class="level" :style="{ borderLeft: `3px solid ${form[level].color}` }">{{ text[level] }} <b>{{ form[level].min }}{{ form[level].max === '' ? '+' : `–${form[level].max}` }}</b></span></template>
        <p v-else-if="colorErrors.length" id="settings-color-error" role="alert">{{ colorErrors.map(level => text[level]).join(', ') }}: {{ tr('Enter a 6-digit HEX color, e.g. #FF5733.', 'กรอกรหัสสี HEX 6 หลัก เช่น #FF5733') }}</p>
        <p v-else-if="rangeError" role="alert">{{ rangeError }}</p>
        <p v-else role="alert">{{ tr('Use non-negative whole numbers; each end must be at least its start.', 'กรอกจำนวนเต็มตั้งแต่ 0 และค่าสิ้นสุดต้องไม่น้อยกว่าค่าเริ่มของช่วงนั้น') }}</p>
      </div>
      <p class="settings-help">{{ tr('Ranges must increase: Low → Medium → High, without overlap. Example: 0–5, 6–9, 10+. Only High may have no end. Gaps show “Outside ranges”.', 'ช่วงต้องเรียง Low → Medium → High และไม่ซ้อนกัน เช่น 0–5, 6–9, 10 ขึ้นไป เว้นช่องสิ้นสุดว่างได้เฉพาะ High หากเว้นช่วงจะแสดง “นอกช่วงที่กำหนด”') }}</p>
      <footer class="settings-footer">
        <span role="status">{{ saved ? tr('Changes saved', 'บันทึกเรียบร้อยแล้ว') : dirty ? tr('Unsaved changes', 'มีการแก้ไขที่ยังไม่บันทึก') : '' }}</span>
        <button class="settings-reset" type="button" :disabled="loading || !dirty" @click="reset">{{ tr('Cancel', 'ยกเลิก') }}</button>
        <button class="settings-save" type="submit" :disabled="loading || !valid || !dirty">{{ loading ? tr('Saving…', 'กำลังบันทึก…') : tr('Save changes', 'บันทึก') }}</button>
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
.settings-intro { margin-bottom: 14px; }
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
