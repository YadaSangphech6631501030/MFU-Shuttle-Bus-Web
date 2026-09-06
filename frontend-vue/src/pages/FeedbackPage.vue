<script setup lang="ts">
// Collects feedback directly on the page instead of opening a modal.
import { reactive, ref } from 'vue';

type FeedbackPayload = {
  name: string;
  email: string;
  ratings: number[];
};

defineProps<{ t: any; isSubmitting: boolean }>();

const emit = defineEmits<{ submit: [payload: FeedbackPayload] }>();

const form = reactive<FeedbackPayload>({
  name: '',
  email: '',
  ratings: [0, 0, 0, 0, 0],
});
const ratingError = ref(false);

function submitForm() {
  ratingError.value = form.ratings.some((rating) => rating === 0);
  if (ratingError.value) return;
  emit('submit', { ...form });
}
</script>

<template>
  <section class="screen page-screen feedback-page">
    <form class="feedback-form" @submit.prevent="submitForm">
      <h2>{{ t.feedbackFormTitle }}</h2>
      <div class="feedback-fields">
        <label class="feedback-field">
          <span>{{ t.feedbackName }}</span>
          <input v-model.trim="form.name" type="text" autocomplete="name" :placeholder="t.feedbackNamePlaceholder" required />
        </label>
        <label class="feedback-field">
          <span>{{ t.feedbackEmail }}</span>
          <input v-model.trim="form.email" type="email" autocomplete="email" :placeholder="t.feedbackEmailPlaceholder" required />
        </label>
        <div class="feedback-ratings">
          <p>{{ t.ratingHint }}</p>
          <div v-for="(question, index) in t.ratingQuestions" :key="question" class="rating-row">
            <strong>{{ question }}</strong>
            <span class="rating-stars">
              <button v-for="star in 5" :key="star" type="button" :aria-label="`${question}: ${star}/5`" @click="form.ratings[index] = star">
                {{ star <= form.ratings[index] ? '★' : '☆' }}
              </button>
            </span>
          </div>
          <p v-if="ratingError" class="rating-error">{{ t.required }}</p>
        </div>
      </div>
      <button class="primary-btn feedback-submit" type="submit" :disabled="isSubmitting">
        {{ isSubmitting ? t.loading : t.feedbackSubmit }}
      </button>
    </form>
  </section>
</template>
