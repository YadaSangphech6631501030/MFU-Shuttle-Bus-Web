<script setup lang="ts">
import { computed } from 'vue';
import type { Report } from '../types';
import { feedbackRatings, feedbackQuestions } from '../services/feedback';

const props = defineProps<{ reports: Report[]; language: string }>();
const copy = computed(() => props.language === 'TH' ? {
  categories: 'คะแนนเฉลี่ยแยกหัวข้อ', responses: 'คะแนน', title: 'ภาพรวมคะแนนประเมิน', note: 'สัดส่วนคะแนนจากทุกหัวข้อ ตามตัวกรองที่เลือก',
  positive: 'คะแนนระดับ 4–5 ดาว', breakdown: 'สัดส่วนคะแนน', average: 'เฉลี่ยทุกหัวข้อ', forms: 'แบบประเมิน', votes: 'คะแนนทั้งหมด', stars: 'ดาว',
  empty: 'ยังไม่มีคะแนนประเมิน', missing: 'แบบประเมินที่ไม่มีคะแนนจะไม่รวมในการคำนวณ',
} : {
  categories: 'Average by question', responses: 'ratings', title: 'Rating overview', note: 'Ratings across all questions, matching the selected filters',
  positive: 'Rated 4–5 stars', breakdown: 'Rating distribution', average: 'All-question average', forms: 'Feedback submissions', votes: 'Total ratings', stars: 'stars',
  empty: 'No ratings available', missing: 'Submissions without ratings are excluded from calculations',
});

const scores = computed(() => props.reports.flatMap(report => feedbackRatings(report).map(item => item.score)));
const average = computed(() => scores.value.length
  ? (scores.value.reduce((sum, score) => sum + score, 0) / scores.value.length).toFixed(1) : '—');
const colors = ['#16c784', '#22c9c3', '#f8c428', '#ff9234', '#f45176'];
// Use the same denominator as the chart: individual question ratings.
const positivePercent = computed(() => scores.value.length
  ? `${Math.round(scores.value.filter(score => score >= 4).length / scores.value.length * 100)}%` : '—');
const distribution = computed(() => [5, 4, 3, 2, 1].map((score, index) => {
  const count = scores.value.filter(value => value === score).length;
  return { score, count, color: colors[index], percent: scores.value.length ? count / scores.value.length * 100 : 0 };
}));
// Convert each rating share into a cumulative donut segment; use a neutral empty ring.
const chartBackground = computed(() => {
  if (!scores.value.length) return '#e9edf1';
  let offset = 0;
  return `conic-gradient(${distribution.value.map(item => {
    const start = offset;
    offset += item.percent;
    return `${item.color} ${start}% ${offset}%`;
  }).join(', ')})`;
});
// Keep per-question denominators separate when older submissions are incomplete.
const categoryAverages = computed(() => {
  const ratings = props.reports.flatMap(feedbackRatings);
  return feedbackQuestions.map(question => {
    const values = ratings.filter(item => item.key === question.key);
    return { ...question, count: values.length,
      average: values.length ? values.reduce((sum, item) => sum + item.score, 0) / values.length : null };
  });
});
</script>

<template>
  <section class="feedback-summary" aria-labelledby="rating-summary-title">
    <header class="summary-header">
      <span class="summary-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 18V6m0 12h16M8 14v-3m5 3V7m5 7V4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
      <div><h3 id="rating-summary-title">{{ copy.title }}</h3><p>{{ copy.note }}</p></div>
    </header>
    <div class="summary-body">
      <div class="chart-panel">
        <div class="rating-donut" :style="{ background: chartBackground }">
          <div class="donut-center">
            <span>{{ copy.average }}</span>
            <strong>{{ average }}<small> / 5</small></strong>
            <svg class="average-star" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" /></svg>
          </div>
        </div>
        <p v-if="!scores.length" class="summary-empty">{{ copy.empty }}</p>
        <div v-else class="positive-badge"><span aria-hidden="true">★</span> {{ positivePercent }} · {{ copy.positive }}</div>
      </div>
      <div class="summary-details">
        <div class="summary-totals">
          <div><span>{{ copy.forms }}</span><strong>{{ reports.length.toLocaleString() }}</strong></div>
          <div><span>{{ copy.votes }}</span><strong>{{ scores.length.toLocaleString() }}</strong></div>
        </div>
        <h4>{{ copy.breakdown }}</h4>
        <ul class="rating-legend">
          <li v-for="item in distribution" :key="item.score">
            <span class="rating-label" :style="{ '--rating-color': item.color }">{{ item.score }}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" /></svg><span class="sr-only">{{ copy.stars }}</span></span>
            <span class="rating-track" aria-hidden="true"><span :style="{ width: `${item.percent}%`, background: item.color }"></span></span>
            <strong class="rating-percent">{{ item.percent.toFixed(1) }}%</strong><span class="rating-count">({{ item.count }})</span>
          </li>
        </ul>
      </div>
    </div>
    <div class="question-summary">
      <h4>{{ copy.categories }}</h4>
      <div class="question-grid">
        <article v-for="(question, index) in categoryAverages" :key="question.key" class="question-card">
          <div><span>{{ language === 'TH' ? question.th : question.en }}</span><strong>{{ question.average === null ? '—' : question.average.toFixed(1) }}<small> / 5</small></strong></div>
          <div class="question-track" aria-hidden="true"><span :style="{ width: `${(question.average ?? 0) * 20}%`, background: colors[index] }"></span></div>
          <small>{{ question.count }} {{ copy.responses }}</small>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.feedback-summary { margin-bottom: 24px; overflow: hidden; border: 1px solid #e8e9ed; border-radius: 20px; background: #fff; box-shadow: 0 4px 20px rgba(34, 46, 63, .035); }
.summary-header { display: flex; align-items: center; gap: 14px; padding: 24px 28px; border-bottom: 1px solid #f0f1f3; }
.summary-icon { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 13px; background: #fff0f4; color: #dc285c; }
.summary-icon svg { width: 24px; height: 24px; }
.feedback-summary h3 { margin: 0; font-size: 19px; font-weight: 700; color: #253247; letter-spacing: -.3px; }
.summary-header p { margin: 5px 0 0; color: #718096; font-size: 12px; line-height: 1.6; }
.summary-body { display: grid; grid-template-columns: minmax(240px, .85fr) minmax(0, 1.6fr); padding: 28px; gap: 36px; }
.chart-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; padding: 10px 24px 10px 0; border-right: 1px solid #edf0f3; }
.rating-donut { width: 210px; height: 210px; border-radius: 50%; display: grid; place-items: center; box-shadow: 0 0 0 8px #f7f9f9; }
.donut-center { width: 166px; height: 166px; border-radius: 50%; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
.donut-center > span { color: #718096; font-size: 12px; }
.donut-center strong { color: #253247; font-size: 44px; line-height: 1.1; letter-spacing: -1.5px; font-variant-numeric: tabular-nums; }
.donut-center small { font-size: 15px; font-weight: 500; color: #8b95a4; letter-spacing: 0; }
.average-star { width: 20px; height: 20px; fill: #f8b916; }
.positive-badge { display: flex; align-items: center; gap: 7px; border: 1px solid #a6edce; border-radius: 24px; padding: 7px 12px; background: #e9fff3; color: #08784e; font-size: 12px; font-weight: 600; text-align: center; }
.summary-details { min-width: 0; }
.summary-totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.summary-totals > div { display: flex; flex-direction: column; gap: 9px; padding: 16px 18px; border-radius: 12px; background: #f8f9fb; border: 1px solid #eef0f4; }
.summary-totals > div:first-child { background: #eff6ff; border-color: #cfe3ff; }
.summary-totals > div:first-child strong { color: #2563d9; }
.summary-totals > div:last-child { background: #f4efff; border-color: #e2d4ff; }
.summary-totals > div:last-child strong { color: #7c3bd1; }
.summary-totals strong { color: #253247; font-size: 28px; line-height: 1; font-variant-numeric: tabular-nums; }
.summary-totals span { color: #68788e; font-size: 12px; }
.summary-details h4 { margin: 24px 0 16px; color: #48566a; font-size: 13px; font-weight: 600; }
.rating-legend { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.rating-legend li { display: grid; grid-template-columns: 35px minmax(0, 1fr) 58px 40px; align-items: center; gap: 12px; font-size: 12px; }
.rating-label { display: flex; align-items: center; gap: 6px; color: #48566a; font-weight: 600; }
.rating-label svg { width: 13px; height: 13px; fill: var(--rating-color); }
.rating-track { height: 9px; border-radius: 8px; background: #f0f2f5; overflow: hidden; }
.rating-track > span { display: block; height: 100%; border-radius: inherit; transition: width .35s ease; }
.rating-percent { text-align: right; color: #48566a; font-variant-numeric: tabular-nums; }
.rating-count { text-align: right; color: #798596; font-variant-numeric: tabular-nums; }
.summary-note { display: flex; align-items: center; gap: 8px; padding: 13px 28px; background: #fbfcfd; border-top: 1px solid #eef0f3; color: #7b8798; font-size: 11px; line-height: 1.6; }
.summary-empty { color: #718096; font-size: 13px; text-align: center; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media (max-width: 760px) { .summary-body { grid-template-columns: 1fr; gap: 24px; padding: 22px; } .chart-panel { border-right: 0; border-bottom: 1px solid #edf0f3; padding: 8px 0 24px; } .summary-header { padding: 20px; } .summary-note { padding: 13px 20px; } }
@media (max-width: 420px) { .summary-totals { gap: 8px; } .summary-totals > div { padding: 14px 12px; } .rating-legend li { gap: 8px; grid-template-columns: 30px minmax(0, 1fr) 52px 32px; } }
@media (prefers-reduced-motion: reduce) { .rating-track > span { transition: none; } }
.question-summary { padding: 24px 28px; border-top: 1px solid #edf0f3; }
.question-summary h4 { margin: 0 0 18px; font-size: 15px; color: #253247; }
.question-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.question-card { padding: 16px; background: #fafbfe; border: 1px solid #edf0f3; border-radius: 14px; }
.question-card > div:first-child { display: flex; flex-direction: column; gap: 12px; }
.question-card span { font-size: 13px; color: #4c5a6e; }
.question-card strong { font-size: 24px; color: #253247; }
.question-card small { color: #718096; font-size: 12px; font-weight: 400; }
.question-track { height: 7px; margin: 12px 0 8px; background: #e9edf3; border-radius: 6px; overflow: hidden; }
.question-track span { display: block; height: 100%; border-radius: inherit; }
@media (max-width: 480px) {
  .summary-header { padding: 16px; gap: 10px; }
  .feedback-summary h3 { font-size: 17px; }
  .summary-body { padding: 18px 14px; }
  .summary-totals { grid-template-columns: 1fr 1fr; }
  .question-summary { padding: 18px 14px; }
  .question-grid { grid-template-columns: minmax(0, 1fr); }
  .rating-donut { width: 190px; height: 190px; }
  .donut-center { width: 148px; height: 148px; }
  .summary-icon { width: 36px; height: 36px; }
}
/* Prevent long headings and chart children from creating an intrinsic minimum width. */
.feedback-summary, .summary-body, .summary-details, .chart-panel, .question-summary { min-width: 0; max-width: 100%; }
.summary-header > div { min-width: 0; }
.summary-header h3, .summary-header p, .positive-badge { overflow-wrap: anywhere; white-space: normal; }
@media (max-width: 480px) {
  .summary-body { grid-template-columns: minmax(0, 1fr); }
  .summary-header { align-items: flex-start; }
  .rating-donut { width: min(190px, 100%); height: auto; aspect-ratio: 1; }
  .donut-center { width: 78%; height: 78%; }
  .donut-center strong { font-size: 36px; }
  .donut-center > span { max-width: 115px; text-align: center; }
  .positive-badge { justify-content: center; flex-wrap: wrap; }
  .summary-totals { grid-template-columns: minmax(0, 1fr); }
}
</style>
