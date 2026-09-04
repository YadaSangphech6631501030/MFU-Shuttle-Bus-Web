<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Report } from '../types';

type ReportView = 'active' | 'feedback' | 'history';
type DateTarget = 'from' | 'to';

const props = defineProps<{
  reports: Report[];
  text: Record<string, any>;
}>();

defineEmits<{
  updateReportStatus: [report: Report, status: string];
  deleteReport: [report: Report];
}>();

function selectValue(event: Event) {
  return (event.target as HTMLSelectElement).value;
}

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

function categoryClass(category: string) {
  return `report-category-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function shouldShowTableCategory(report: Report, category: string) {
  return reportTitle(report).trim().toLowerCase() !== category.trim().toLowerCase();
}

function reportDetail(report: Report) {
  return firstText(report.description, report.detail, props.text.noReportDetail);
}

function reportLocation(report: Report) {
  return firstText(report.location, props.text.noReportLocation);
}

function reporterSearchText() {
  return props.text.guestUser;
}

function isSameReport(a: Report, b: Report) {
  if (a._id && b._id) return a._id === b._id;
  return a === b;
}

function reporterName(report: Report) {
  const index = guestReportOrder.value.findIndex((item) => isSameReport(item, report));
  return `${props.text.guestUser} ${index >= 0 ? String(index + 1).padStart(2, '0') : ''}`.trim();
}

function normalizedStatus(report: Report) {
  const status = cleanText(report.status);
  return status || 'pending';
}

function statusLabel(status: string) {
  if (status === 'resolved') return props.text.resolvedStatus;
  if (status === 'in_progress') return props.text.inProgressStatus;
  return props.text.pendingStatus;
}

function statusClass(report: Report) {
  return `report-status-${normalizedStatus(report).replace(/_/g, '-')}`;
}

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

function setReportView(view: ReportView) {
  activeReportView.value = view;
  categoryFilter.value = 'all';
  statusFilter.value = 'all';
}

function reportDetailLines(report: Report) {
  return reportDetail(report).split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function ratingDetail(line: string) {
  const match = line.match(/^(.*?):\s*(\d+)\/5\s*(?:\((.*?)\))?$/);
  if (!match) return null;

  return {
    label: match[1].trim(),
    score: match[2],
    note: (match[3] || '').trim(),
  };
}

function structuredFeedbackRatings(report: Report) {
  return (report.feedbackRatings || [])
    .map((item) => ({
      label: firstText(item.label, item.key),
      score: Number(item.score),
      note: firstText(item.description),
    }))
    .filter((item) => item.label && Number.isFinite(item.score));
}

function hasStructuredFeedbackRatings(report: Report) {
  return structuredFeedbackRatings(report).length > 0;
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
    reporterSearchText(),
    statusLabel(normalizedStatus(report)),
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

const activeReportView = ref<ReportView>('active');
const searchQuery = ref('');
const categoryFilter = ref('all');
const statusFilter = ref('all');
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
const activeReports = computed(() => props.reports
  .filter((report) => !isFeedbackReport(report))
  .filter((report) => normalizedStatus(report) !== 'resolved'));
const historyReports = computed(() => props.reports
  .filter((report) => !isFeedbackReport(report))
  .filter((report) => normalizedStatus(report) === 'resolved'));
const visibleReports = computed(() => {
  if (activeReportView.value === 'feedback') return feedbackReports.value;
  if (activeReportView.value === 'history') return historyReports.value;
  return activeReports.value;
});

const guestReportOrder = computed(() => [...props.reports].sort((a, b) => {
  const aDate = reportDate(a)?.getTime() ?? 0;
  const bDate = reportDate(b)?.getTime() ?? 0;
  if (aDate !== bDate) return aDate - bDate;
  return String(a._id || '').localeCompare(String(b._id || ''));
}));

const categoryOptions = computed(() => {
  const categories = new Set(visibleReports.value.map((report) => reportCategory(report)));
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
});

const statusFilterOptions = computed(() => {
  if (activeReportView.value === 'history') {
    return [{ value: 'resolved', label: props.text.resolvedStatus }];
  }

  const options = [
    { value: 'pending', label: props.text.pendingStatus },
    { value: 'in_progress', label: props.text.inProgressStatus },
  ];

  if (activeReportView.value === 'feedback') {
    options.push({ value: 'resolved', label: props.text.resolvedStatus });
  }

  return options;
});

const filteredReports = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();

  return visibleReports.value.filter((report) => {
    if (activeReportView.value !== 'feedback' && categoryFilter.value !== 'all' && reportCategory(report) !== categoryFilter.value) return false;
    if (statusFilter.value !== 'all' && normalizedStatus(report) !== statusFilter.value) return false;
    if (!matchesDateRange(report)) return false;
    return matchesSearch(report, query);
  });
});

const reportGroups = computed(() => {
  if (activeReportView.value === 'feedback') {
    return [{ category: '', items: filteredReports.value }];
  }

  const groups = new Map<string, Report[]>();

  filteredReports.value.forEach((report) => {
    const category = reportCategory(report);
    const group = groups.get(category) || [];
    group.push(report);
    groups.set(category, group);
  });

  return Array.from(groups, ([category, items]) => ({ category, items }));
});
</script>

<template>
  <section class="panel report-panel">
    <div class="panel-heading report-heading">
      <div>
        <h2>{{ text.issueReports }}</h2>
      </div>
      <div class="report-heading-actions">
        <span class="report-total">{{ filteredReports.length }} / {{ visibleReports.length }} {{ text.reportsUnit }}</span>
      </div>
    </div>

    <div class="report-toolbar">
      <div class="report-view-toggle" role="tablist" :aria-label="text.reportViewLabel">
        <button
          type="button"
          :class="{ active: activeReportView === 'active' }"
          @click="setReportView('active')"
        >
          {{ text.activeReports }}
          <span>{{ activeReports.length }}</span>
        </button>
        <button
          type="button"
          :class="{ active: activeReportView === 'feedback' }"
          @click="setReportView('feedback')"
        >
          {{ text.feedbackReports }}
          <span>{{ feedbackReports.length }}</span>
        </button>
        <button
          type="button"
          :class="{ active: activeReportView === 'history' }"
          @click="setReportView('history')"
        >
          {{ text.historyReports }}
          <span>{{ historyReports.length }}</span>
        </button>
      </div>

      <div class="report-filters" :class="{ 'feedback-filters': activeReportView === 'feedback' }">
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
        <label v-if="activeReportView !== 'feedback'">
          {{ text.reportCategoryFilter }}
          <select v-model="categoryFilter">
            <option value="all">{{ text.allCategories }}</option>
            <option v-for="category in categoryOptions" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
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
                <button type="button" aria-label="Previous month" @click="shiftCalendarMonth(-1)">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <strong>{{ calendarMonthLabel }}</strong>
                <button type="button" aria-label="Next month" @click="shiftCalendarMonth(1)">
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
                <button type="button" @click="clearDateRange">Clear</button>
                <button type="button" @click="closeDatePicker">Done</button>
              </div>
            </div>
          </span>
        </label>
        <label v-if="activeReportView !== 'feedback'">
          {{ text.reportStatusFilter }}
          <select v-model="statusFilter">
            <option value="all">{{ text.allStatuses }}</option>
            <option v-for="option in statusFilterOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="filteredReports.length" class="report-category-list">
      <section v-for="group in reportGroups" :key="group.category" class="report-category-section">
        <header v-if="activeReportView !== 'feedback'" class="report-category-heading">
          <div>
            <span class="report-category-pill" :class="categoryClass(group.category)">{{ group.category }}</span>
          </div>
          <span>{{ group.items.length }} {{ text.reportsUnit }}</span>
        </header>

        <div class="report-table-wrap">
          <table class="report-table" :class="{ 'feedback-table': activeReportView === 'feedback' }">
            <thead>
              <tr>
                <th>#</th>
                <th>{{ text.reportTitleLabel }}</th>
                <th>{{ text.reportDetailLabel }}</th>
                <th v-if="activeReportView !== 'feedback'">{{ text.reportLocation }}</th>
                <th>{{ text.reportedBy }}</th>
                <th>{{ text.submittedAt }}</th>
                <th v-if="activeReportView !== 'feedback'">{{ text.reportStatus }}</th>
                <th class="report-actions-heading" :aria-label="text.reportActions"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(report, rowIndex) in group.items" :key="report._id">
                <td class="report-index">{{ rowIndex + 1 }}</td>
                <td>
                  <strong class="report-table-title">{{ reportTitle(report) }}</strong>
                  <span v-if="shouldShowTableCategory(report, group.category)" class="report-table-category">{{ group.category }}</span>
                </td>
                <td>
                  <div v-if="hasStructuredFeedbackRatings(report)" class="feedback-rating-list">
                    <div
                      v-for="rating in structuredFeedbackRatings(report)"
                      :key="rating.label"
                      class="feedback-rating-item"
                    >
                      <span>{{ rating.label }}</span>
                      <strong>{{ rating.score }}/5</strong>
                      <small v-if="rating.note">{{ rating.note }}</small>
                    </div>
                    <div v-if="report.feedbackAverage" class="feedback-rating-average">
                      <span>{{ text.feedbackAverage }}</span>
                      <strong>{{ report.feedbackAverage }}/5</strong>
                    </div>
                  </div>
                  <div v-else-if="isFeedbackReport(report)" class="feedback-rating-list">
                    <div v-for="line in reportDetailLines(report)" :key="line" class="feedback-rating-item">
                      <template v-if="ratingDetail(line)">
                        <span>{{ ratingDetail(line)?.label }}</span>
                        <strong>{{ ratingDetail(line)?.score }}/5</strong>
                        <small v-if="ratingDetail(line)?.note">{{ ratingDetail(line)?.note }}</small>
                      </template>
                      <span v-else>{{ line }}</span>
                    </div>
                  </div>
                  <span v-else class="report-table-detail">{{ reportDetail(report) }}</span>
                </td>
                <td v-if="activeReportView !== 'feedback'" class="report-table-location">{{ reportLocation(report) }}</td>
                <td>
                  <strong class="reporter-table-name">{{ reporterName(report) }}</strong>
                </td>
                <td class="report-table-time">{{ formatReportDateTime(report) }}</td>
                <td v-if="activeReportView !== 'feedback'">
                  <div class="report-status-cell">
                    <span
                      v-if="activeReportView === 'history'"
                      class="report-status-display report-status-resolved"
                    >
                      {{ text.resolvedStatus }}
                    </span>
                    <select
                      v-else
                      class="report-status-select"
                      :class="statusClass(report)"
                      :value="normalizedStatus(report)"
                      @change="$emit('updateReportStatus', report, selectValue($event))"
                    >
                      <option value="pending">{{ text.pendingStatus }}</option>
                      <option value="in_progress">{{ text.inProgressStatus }}</option>
                      <option value="resolved">{{ text.resolvedStatus }}</option>
                    </select>
                  </div>
                </td>
                <td>
                  <button class="report-delete-btn" type="button" :aria-label="text.deleteReport" @click="$emit('deleteReport', report)">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v5" />
                      <path d="M14 11v5" />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div v-else class="report-empty-state">
      <strong>{{ reports.length ? text.noFilteredReports : text.noReports }}</strong>
      <span>{{ reports.length ? text.noFilteredReportsHint : text.noReportsHint }}</span>
    </div>
  </section>
</template>
