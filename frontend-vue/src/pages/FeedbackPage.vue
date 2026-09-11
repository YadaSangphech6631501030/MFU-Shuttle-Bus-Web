<script setup lang="ts">
// Collects feedback directly on the page instead of opening a modal.
import { computed, reactive, ref } from 'vue';

type FeedbackPayload = {
  name: string;
  email: string;
  ratings: number[];
};

const props = defineProps<{ t: any; isSubmitting: boolean }>();

const emit = defineEmits<{ submit: [payload: FeedbackPayload] }>();

const form = reactive<FeedbackPayload>({
  name: '',
  email: '',
  ratings: [0, 0, 0, 0, 0],
});
const hoverRatings = reactive([0, 0, 0, 0, 0]);
// Show validation warnings only after the first submission attempt.
const hasSubmitted = ref(false);
// Recompute warnings as the user types so corrected fields clear immediately.
const fieldErrors = computed(() => ({
  name: hasSubmitted.value && !form.name.trim(),
  email: hasSubmitted.value && !isValidEmail(form.email.trim()),
}));
// Clear the rating warning automatically once every question has a score.
const ratingError = computed(() =>
  hasSubmitted.value && form.ratings.some((rating) => rating === 0),
);

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function submitForm() {
  // Ignore repeated submissions while the current request is pending.
  if (props.isSubmitting) return;
  hasSubmitted.value = true;
  if (fieldErrors.value.name || fieldErrors.value.email || ratingError.value) return;
  // Copy the ratings so later form edits cannot change the submitted payload.
  emit('submit', { ...form, ratings: [...form.ratings] });
}
</script>

<template>
  <section class="screen page-screen feedback-page">
    <form class="feedback-form" novalidate @submit.prevent="submitForm">
      <header class="feedback-form-head">
        <span class="feedback-form-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.6 4v-4.1a2.5 2.5 0 0 1-2.4-2.4Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8" />
            <path d="M8 8h8M8 11.5h5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
          </svg>
        </span>
        <h2>{{ props.t.feedbackFormTitle }}</h2>
      </header>
      <div class="feedback-fields">
        <label class="feedback-field" :class="{ 'has-error': fieldErrors.name }">
          <span>{{ props.t.feedbackName }}</span>
          <span class="feedback-input-wrap" :class="{ 'has-error': fieldErrors.name }">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="M5.5 20a6.5 6.5 0 0 1 13 0" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8" />
            </svg>
            <input v-model.trim="form.name" type="text" autocomplete="name" :placeholder="props.t.feedbackNamePlaceholder" :aria-invalid="fieldErrors.name" />
          </span>
          <small v-if="fieldErrors.name" class="feedback-error">{{ props.t.required }}</small>
        </label>
        <label class="feedback-field" :class="{ 'has-error': fieldErrors.email }">
          <span>{{ props.t.feedbackEmail }}</span>
          <span class="feedback-input-wrap" :class="{ 'has-error': fieldErrors.email }">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="5.5" width="17" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8" />
              <path d="m5 7 7 5 7-5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
            </svg>
            <input v-model.trim="form.email" type="email" autocomplete="email" :placeholder="props.t.feedbackEmailPlaceholder" :aria-invalid="fieldErrors.email" />
          </span>
          <small v-if="fieldErrors.email" class="feedback-error">{{ props.t.required }}</small>
        </label>
        <div class="feedback-ratings">
          <div v-for="(question, index) in props.t.ratingQuestions" :key="question" class="rating-row">
            <strong>{{ question }}</strong>
            <span class="rating-stars" @mouseleave="hoverRatings[index] = 0">
              <button v-for="star in 5" :key="star" :class="{ 'is-selected': star <= (hoverRatings[index] || form.ratings[index]) }" type="button" :aria-label="`${question}: ${star}/5`" :aria-pressed="star <= form.ratings[index]" @mouseenter="hoverRatings[index] = star" @click="form.ratings[index] = star">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z" />
                </svg>
              </button>
            </span>
          </div>
          <p v-if="ratingError" class="rating-error">{{ props.t.required }}</p>
        </div>
      </div>
      <button class="primary-btn feedback-submit" type="submit" :disabled="props.isSubmitting">
        {{ props.isSubmitting ? props.t.loading : props.t.feedbackSubmit }}
      </button>
    </form>
  </section>
</template>
