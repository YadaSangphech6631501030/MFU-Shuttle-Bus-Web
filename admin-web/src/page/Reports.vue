<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Report } from '../types';
import FeedbackSummary from './FeedbackSummary.vue';
import { feedbackRatings, feedbackAverage, feedbackIdentity, feedbackNotes, ratingLabel } from '../services/feedback';

type DateTarget = 'from' | 'to';

const props = defineProps<{
  reports: Report[];
  text: Record<string, any>;
}>();

defineEmits<{
  deleteReport: [report: Report];
}>();

function cleanText(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstText(...values: unknown[]) {
  return values.map(cleanText).find(Boolean) || '';
}

function isEnglishAdmin() {
  return props.text.language === 'EN';
}

const reportTextTranslations: Record<string, { en: string; th: string }> = {
  accident: { en: 'Accident', th: 'อุบัติเหตุ' },
  'อุบัติเหตุ': { en: 'Accident', th: 'อุบัติเหตุ' },
  breakdown: { en: 'Breakdown', th: 'รถเสีย' },
  'รถเสีย': { en: 'Breakdown', th: 'รถเสีย' },
  construction: { en: 'Construction', th: 'ก่อสร้าง' },
  'ก่อสร้าง': { en: 'Construction', th: 'ก่อสร้าง' },
  'road closed': { en: 'Road Closed', th: 'ปิดถนน' },
  'ปิดถนน': { en: 'Road Closed', th: 'ปิดถนน' },
  obstacle: { en: 'Obstacle', th: 'สิ่งกีดขวาง' },
  'สิ่งกีดขวาง': { en: 'Obstacle', th: 'สิ่งกีดขวาง' },
  complaint: { en: 'Complaint', th: 'ร้องเรียน' },
  'ร้องเรียน': { en: 'Complaint', th: 'ร้องเรียน' },
  feedback: { en: 'Feedback', th: 'ติชม' },
  'ส่งข้อเสนอแนะ': { en: 'Feedback', th: 'ติชม' },
  'ข้อเสนอแนะ': { en: 'Feedback', th: 'ติชม' },
  'ติชม': { en: 'Feedback', th: 'ติชม' },
};

function localizedReportText(value: string) {
  const normalized = value.trim().toLowerCase();
  const translation = reportTextTranslations[normalized] || reportTextTranslations[value.trim()];
  if (!translation) return value;
  return isEnglishAdmin() ? translation.en : translation.th;
}

function reportTitle(report: Report) {
  return localizedReportText(firstText(report.title, report.category, report.type, props.text.issueReport));
}

function rawReportCategory(report: Report) {
  return firstText(report.type, report.category, props.text.issueReport);
}

function reportCategory(report: Report) {
  return localizedReportText(rawReportCategory(report));
}

function reportDetail(report: Report) {
  return firstText(report.description, report.detail, props.text.noReportDetail);
}

function reportLocation(report: Report) {
  return firstText(report.location, props.text.noReportLocation);
}

// Use submitted identity when present; older anonymous entries retain a guest label.
function reporterName(report: Report) {
  return feedbackIdentity(report).name || props.text.guestUser;
}
function averageText(report: Report) {
  return feedbackAverage(report)?.toFixed(1) ?? '—';
}
const copy = computed(() => props.text.language === 'TH' ? {
  average: 'คะแนนเฉลี่ย', reviewer: 'ผู้ประเมิน', details: 'ดูรายละเอียด', hide: 'ซ่อนรายละเอียด',
  email: 'อีเมล', noEmail: 'ไม่ได้ระบุอีเมล', noRatings: 'ไม่มีคะแนนประเมิน',
  reset: 'ล้างตัวกรอง', all: 'ทั้งหมด', week: '7 วันล่าสุด', month: 'เดือนนี้',
  previous: 'ก่อนหน้า', next: 'ถัดไป', page: 'หน้า',
} : {
  average: 'Average rating', reviewer: 'Reviewer', details: 'View details', hide: 'Hide details',
  email: 'Email', noEmail: 'No email provided', noRatings: 'No ratings available',
  reset: 'Clear filters', all: 'All time', week: 'Last 7 days', month: 'This month',
  previous: 'Previous', next: 'Next', page: 'Page',
});
const expandedId = ref<string | null>(null);
const currentPage = ref(1);
const pageSize = 10;
function toggleDetails(id: string) { expandedId.value = expandedId.value === id ? null : id; }

function reportTimestamp(report: Report) {
  return firstText(report.createdAt, report.time);
}

function reportDate(report: Report) {
  const timestamp = reportTimestamp(report);
  if (!timestamp) return null;

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function reportDateValue(report: Report) {
  const date = reportDate(report);
  if (!date) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateInput(value: string) {
  if (!value) return dateInputPlaceholder();

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(reportLocale(), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function dateInputPlaceholder() {
  return props.text.language === 'TH' ? 'ดด/วว/ปปปป' : 'MM/DD/YYYY';
}

function dateInputToDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function reportLocale() {
  return props.text.language === 'TH' ? 'th-TH-u-ca-gregory' : 'en-US';
}

function formatReportDateTime(report: Report) {
  const date = reportDate(report);
  if (!date) return reportTimestamp(report) || props.text.unknownTime;

  return new Intl.DateTimeFormat(reportLocale(), {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function isFeedbackReport(report: Report) {
  return rawReportCategory(report).toLowerCase() === 'feedback';
}

function matchesSearch(report: Report, query: string) {
  if (!query) return true;

  const haystack = [
    reportTitle(report),
    reportCategory(report),
    reportDetail(report),
    reportLocation(report),
    reporterName(report),
    feedbackIdentity(report).email,
    formatReportDateTime(report),
  ].join(' ').toLowerCase();

  return haystack.includes(query);
}

function matchesDateRange(report: Report) {
  const reportDateText = reportDateValue(report);
  if (!reportDateText) return !dateFromFilter.value && !dateToFilter.value;
  if (dateFromFilter.value && reportDateText < dateFromFilter.value) return false;
  if (dateToFilter.value && reportDateText > dateToFilter.value) return false;
  return true;
}

const searchQuery = ref('');
const dateFromFilter = ref('');
const dateToFilter = ref('');
const datePickerRoot = ref<HTMLElement | null>(null);
const activeDateTarget = ref<DateTarget>('from');
const isDatePickerOpen = ref(false);
const calendarMonth = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

const calendarWeekdays = computed(() => (
  props.text.language === 'TH'
    ? ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
));

function openDatePicker(target: DateTarget) {
  activeDateTarget.value = target;
  const selectedDate = dateInputToDate(target === 'from' ? dateFromFilter.value : dateToFilter.value)
    || dateInputToDate(dateFromFilter.value)
    || dateInputToDate(dateToFilter.value)
    || new Date();
  calendarMonth.value = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  isDatePickerOpen.value = true;
}

function closeDatePicker() {
  isDatePickerOpen.value = false;
}

function handleReportClickOutside(event: MouseEvent) {
  if (!datePickerRoot.value?.contains(event.target as Node)) {
    closeDatePicker();
  }
}

function shiftCalendarMonth(amount: number) {
  calendarMonth.value = new Date(
    calendarMonth.value.getFullYear(),
    calendarMonth.value.getMonth() + amount,
    1,
  );
}

const calendarMonthLabel = computed(() => new Intl.DateTimeFormat(reportLocale(), {
  month: 'long',
  year: 'numeric',
}).format(calendarMonth.value));

const calendarDays = computed(() => {
  const firstOfMonth = calendarMonth.value;
  const start = new Date(firstOfMonth);
  start.setDate(1 - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const value = toDateInputValue(date);
    const from = dateFromFilter.value;
    const to = dateToFilter.value;

    return {
      date,
      value,
      label: date.getDate(),
      inCurrentMonth: date.getMonth() === firstOfMonth.getMonth(),
      isStart: value === from,
      isEnd: value === to,
      inRange: Boolean(from && to && value > from && value < to),
      isToday: value === toDateInputValue(new Date()),
    };
  });
});

function selectCalendarDate(value: string) {
  if (!dateFromFilter.value || dateToFilter.value || activeDateTarget.value === 'from') {
    dateFromFilter.value = value;
    dateToFilter.value = '';
    activeDateTarget.value = 'to';
    return;
  }

  if (value < dateFromFilter.value) {
    dateToFilter.value = dateFromFilter.value;
    dateFromFilter.value = value;
  } else {
    dateToFilter.value = value;
  }

  closeDatePicker();
}

function clearDateRange() {
  dateFromFilter.value = '';
  dateToFilter.value = '';
  activeDateTarget.value = 'from';
  closeDatePicker();
}

onMounted(() => {
  document.addEventListener('click', handleReportClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleReportClickOutside);
});

const feedbackReports = computed(() => props.reports.filter((report) => isFeedbackReport(report)));
// Display feedback only without deleting stored issue reports.
const visibleReports = feedbackReports;

const filteredReports = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  return visibleReports.value.filter((report) => {
    if (!matchesDateRange(report)) return false;
    return matchesSearch(report, query);
  }).sort((a, b) => (reportDate(b)?.getTime() ?? 0) - (reportDate(a)?.getTime() ?? 0));
});

// Paginate the table only; charts summarize every record matching the filters.
const pageCount = computed(() => Math.max(1, Math.ceil(filteredReports.value.length / pageSize)));
const pagedReports = computed(() => filteredReports.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize));
// User filter changes reset pagination, while background refreshes preserve the current page.
watch([searchQuery, dateFromFilter, dateToFilter], () => { currentPage.value = 1; expandedId.value = null; });
// Clamp the page after deletions so the table cannot remain on an empty last page.
watch(pageCount, count => { currentPage.value = Math.min(currentPage.value, count); });
</script>

<template>
  <section class="panel report-panel">
    <div class="panel-heading report-heading">
      <div>
        <h2>{{ text.feedbackReports }}</h2>
      </div>
      <div class="report-heading-actions">
        <span class="report-total">{{ filteredReports.length }} / {{ visibleReports.length }} {{ text.reportsUnit }}</span>
      </div>
    </div>


    <div class="report-toolbar">
      <div class="report-filters feedback-filters">
        <label class="report-search-field">
          {{ text.reportSearch }}
          <span class="report-search-input">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4 4" />
            </svg>
            <input v-model="searchQuery" type="search" :placeholder="text.reportSearchPlaceholder" />
          </span>
        </label>

        <label class="report-date-range-field">
          {{ text.reportDateRange }}
          <span ref="datePickerRoot" class="report-date-range">
            <span class="report-date-control">
              <span class="report-date-inline-label">{{ text.reportDateFromShort }}</span>
              <button
                class="report-date-input"
                :class="{ active: isDatePickerOpen && activeDateTarget === 'from' }"
                type="button"
                @click.stop="openDatePicker('from')"
              >
                <span :class="{ empty: !dateFromFilter }">{{ formatDateInput(dateFromFilter) }}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 2v4" />
                  <path d="M16 2v4" />
                  <rect x="4" y="5" width="16" height="17" rx="2" />
                  <path d="M4 10h16" />
                </svg>
              </button>
            </span>
            <span class="report-date-control">
              <span class="report-date-inline-label">{{ text.reportDateToShort }}</span>
              <button
                class="report-date-input"
                :class="{ active: isDatePickerOpen && activeDateTarget === 'to' }"
                type="button"
                @click.stop="openDatePicker('to')"
              >
                <span :class="{ empty: !dateToFilter }">{{ formatDateInput(dateToFilter) }}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 2v4" />
                  <path d="M16 2v4" />
                  <rect x="4" y="5" width="16" height="17" rx="2" />
                  <path d="M4 10h16" />
                </svg>
              </button>
            </span>
            <div v-if="isDatePickerOpen" class="report-calendar-popover" @click.stop>
              <div class="report-calendar-header">
                <button type="button" :aria-label="text.previousMonth" @click="shiftCalendarMonth(-1)">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <strong>{{ calendarMonthLabel }}</strong>
                <button type="button" :aria-label="text.nextMonth" @click="shiftCalendarMonth(1)">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              </div>
              <div class="report-calendar-weekdays">
                <span v-for="weekday in calendarWeekdays" :key="weekday">{{ weekday }}</span>
              </div>
              <div class="report-calendar-grid">
                <button
                  v-for="day in calendarDays"
                  :key="day.value"
                  class="report-calendar-day"
                  :class="{
                    muted: !day.inCurrentMonth,
                    today: day.isToday,
                    'in-range': day.inRange,
                    'range-start': day.isStart,
                    'range-end': day.isEnd,
                  }"
                  type="button"
                  @click="selectCalendarDate(day.value)"
                >
                  {{ day.label }}
                </button>
              </div>
              <div class="report-calendar-footer">
                <button type="button" @click="clearDateRange">{{ text.clear }}</button>
                <button type="button" @click="closeDatePicker">{{ text.done }}</button>
              </div>
            </div>
          </span>
        </label>

      </div>
    </div>

    <FeedbackSummary :reports="filteredReports" :language="text.language" />

    <div v-if="filteredReports.length" class="feedback-list">
      <div class="report-table-wrap" tabindex="0" role="region" :aria-label="text.feedbackReports">
        <table class="compact-feedback-table">
          <thead><tr><th>{{ text.submittedAt }}</th><th>{{ copy.reviewer }}</th><th>{{ copy.average }}</th><th>{{ text.reportActions }}</th></tr></thead>
          <tbody>
            <template v-for="report in pagedReports" :key="report._id">
              <tr>
                <td class="feedback-date">{{ formatReportDateTime(report) }}</td>
                <td><strong>{{ reporterName(report) }}</strong></td>
                <td><span class="feedback-score"><span aria-hidden="true">★</span> {{ averageText(report) }} / 5</span></td>
                <td><div class="feedback-row-actions">
                  <button type="button" class="feedback-detail-btn" :aria-expanded="expandedId === report._id" :aria-controls="`feedback-detail-${report._id}`" @click="toggleDetails(report._id)">{{ expandedId === report._id ? copy.hide : copy.details }}</button>
                  <button class="report-delete-btn" type="button" :aria-label="`${text.deleteReport}: ${reporterName(report)}`" @click="$emit('deleteReport', report)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" /></svg></button>
                </div></td>
              </tr>
              <tr v-if="expandedId === report._id" :id="`feedback-detail-${report._id}`" class="feedback-expanded-row">
                <td colspan="4"><section class="feedback-detail-panel" :aria-label="copy.details">
                  <p><strong>{{ copy.email }}:</strong> {{ feedbackIdentity(report).email || copy.noEmail }}</p>
                  <div class="feedback-question-details">
                    <div v-for="rating in feedbackRatings(report)" :key="rating.key">
                      <span>{{ ratingLabel(rating, text.language) }}</span><strong>{{ rating.score }} / 5</strong><small v-if="rating.note">{{ rating.note }}</small>
                    </div>
                  </div>
                  <p v-if="!feedbackRatings(report).length">{{ copy.noRatings }}</p>
                  <p v-for="(note, index) in feedbackNotes(report)" :key="index" class="feedback-note-text">{{ note }}</p>
                </section></td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <nav v-if="pageCount > 1" class="feedback-pagination" :aria-label="copy.page">
        <button type="button" :disabled="currentPage === 1" @click="currentPage--; expandedId = null">{{ copy.previous }}</button>
        <span>{{ copy.page }} {{ currentPage }} / {{ pageCount }}</span>
        <button type="button" :disabled="currentPage === pageCount" @click="currentPage++; expandedId = null">{{ copy.next }}</button>
      </nav>
    </div>

    <div v-else class="report-empty-state">
      <strong>{{ feedbackReports.length ? text.noFilteredReports : text.noReports }}</strong>
      <span>{{ feedbackReports.length ? text.noFilteredReportsHint : text.noReportsHint }}</span>
    </div>
  </section>
</template>

<style scoped>
.feedback-pagination button { padding: 8px 14px; border-radius: 9px; border: 1px solid #e1e6ee; background: #fff; color: #52627a; font: inherit; font-size: 12px; cursor: pointer; }
.feedback-detail-btn:hover { background: #fff3f1; border-color: #dab4af; color: #931d18; }
.feedback-pagination button:disabled { opacity: .45; cursor: default; }
.compact-feedback-table { width: 100%; min-width: 660px; border-collapse: collapse; font-size: 13px; }
.compact-feedback-table th { padding: 14px 18px; background: #f7f9fc; text-align: left; font-size: 12px; font-weight: 600; color: #6c7d94; }
.compact-feedback-table td { padding: 17px 18px; border-bottom: 1px solid #edf0f4; color: #324258; overflow-wrap: anywhere; }
.compact-feedback-table th:first-child { width: 26%; }
.compact-feedback-table th:nth-child(2) { width: 28%; }
.feedback-date { font-size: 12px; color: #718096; }
.feedback-score { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; background: #fff8e8; white-space: nowrap; font-weight: 600; }
.feedback-score > span { color: #eab325; }
.feedback-row-actions { display: flex; align-items: center; gap: 10px; }
.feedback-detail-btn { border: 1px solid #e4e8ef; border-radius: 8px; background: #fff; color: #53637a; padding: 8px 12px; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.feedback-detail-panel { padding: 6px 8px 14px; }
.feedback-expanded-row { background: #fafbfe; }
.feedback-detail-panel > p { margin: 8px 0 18px; overflow-wrap: anywhere; }
.feedback-question-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.feedback-question-details > div { display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 14px; background: #fff; border: 1px solid #e7ecf3; border-radius: 10px; }
.feedback-question-details small { grid-column: 1 / -1; color: #718096; }
.feedback-question-details strong { color: #9b6812; }
.feedback-note-text { white-space: pre-wrap; }
.feedback-pagination { display: flex; justify-content: flex-end; align-items: center; gap: 16px; padding: 18px 0 0; font-size: 12px; color: #718096; }
@media (max-width: 760px) {
  .feedback-detail-btn, .feedback-row-actions .report-delete-btn, .feedback-pagination button { min-height: 44px; }
  .feedback-pagination { justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .compact-feedback-table td, .compact-feedback-table th { padding: 12px; }
}
</style>
