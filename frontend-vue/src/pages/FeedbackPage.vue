<script setup lang="ts">
// Provides the entry point for submitting user feedback.
defineProps<{ t: any }>();
const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <section class="screen page-screen feedback-page">
    <p class="screen-caption">{{ t.feedback }}</p>
    <div class="feedback-grid">
      <button type="button" @click="emit('open')"><span class="feedback-icon red">♥</span><strong>{{ t.feedback }}</strong></button>
    </div>
  </section>
</template>
