import type { Report } from '../types';

export const feedbackQuestions = [
  { key: 'stationService', en: 'Station service', th: 'การบริการที่สถานี', aliases: ['Station service rating'] },
  { key: 'busCondition', en: 'Bus condition', th: 'สภาพรถรับส่ง', aliases: ['Bus condition rating'] },
  { key: 'drivingSafety', en: 'Driving manners and safety', th: 'มารยาทและความปลอดภัยในการขับรถ', aliases: ['Driving safety rating'] },
  { key: 'driverPoliteness', en: 'Driver politeness', th: 'ความสุภาพของพนักงานขับรถ', aliases: ['Driver politeness rating'] },
  { key: 'overallSatisfaction', en: 'Overall satisfaction', th: 'ความพึงพอใจโดยรวม', aliases: ['Overall satisfaction rating'] },
];

export type FeedbackRating = { key: string; label: string; score: number; note: string };
const normalize = (value: string) => value.trim().toLowerCase();
function questionKey(key: string, label: string) {
  return feedbackQuestions.find(question => [question.key, question.en, question.th, ...question.aliases]
    .some(alias => [normalize(key), normalize(label)].includes(normalize(alias))))?.key || key || label;
}
export function feedbackLines(report: Report) {
  return String(report.description || report.detail || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
}
function parseRating(line: string): FeedbackRating | null {
  const match = line.match(/^(.*?):\s*([1-5])\/5\s*(?:\((.*?)\))?$/);
  if (!match) return null;
  return { key: questionKey('', match[1]), label: match[1].trim(), score: Number(match[2]), note: match[3] || '' };
}

// Prefer valid structured scores and supplement missing questions from legacy text.
// Match by question identity, never by array position, to avoid mixing categories.
export function feedbackRatings(report: Report): FeedbackRating[] {
  const ratings = new Map<string, FeedbackRating>();
  for (const item of report.feedbackRatings || []) {
    const score = Number(item.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) continue;
    const label = String(item.label || item.key || '').trim();
    if (!label) continue;
    const key = questionKey(item.key || '', label);
    ratings.set(key, { key, label, score, note: item.description || '' });
  }
  for (const line of feedbackLines(report)) {
    const rating = parseRating(line);
    if (rating && !ratings.has(rating.key)) ratings.set(rating.key, rating);
  }
  return [...ratings.values()];
}
export function feedbackAverage(report: Report): number | null {
  const ratings = feedbackRatings(report);
  return ratings.length ? ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length : null;
}
export function ratingLabel(rating: FeedbackRating, language: string) {
  const question = feedbackQuestions.find(item => item.key === rating.key);
  return question ? (language === 'TH' ? question.th : question.en) : rating.label;
}
// Legacy web submissions store name and email as labeled lines in the detail field.
export function feedbackIdentity(report: Report) {
  const lines = feedbackLines(report);
  const field = (pattern: RegExp) => lines.map(line => line.match(pattern)?.[1]?.trim()).find(Boolean) || '';
  return {
    name: field(/^(?:Name|ชื่อ|ชื่อผู้ประเมิน)\s*:\s*(.*)$/i) || report.username || report.user?.username || '',
    email: field(/^(?:Email|E-mail|อีเมล)\s*:\s*(.*)$/i) || report.user?.email || '',
  };
}
// Keep free-text remarks separate from identity fields and parsed rating rows.
export function feedbackNotes(report: Report) {
  return feedbackLines(report).filter(line => !parseRating(line)
    && !/^(?:Name|ชื่อ|ชื่อผู้ประเมิน|Email|E-mail|อีเมล)\s*:/i.test(line));
}
