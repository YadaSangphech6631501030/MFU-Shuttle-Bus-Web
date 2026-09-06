<script setup lang="ts">
// Lets the user switch the application language.
import type { Lang } from '../types';

defineProps<{ t: any; lang: Lang }>();
const emit = defineEmits<{ select: [lang: Lang] }>();
</script>

<template>
  <section class="screen page-screen language-page">
    <button class="language-option" :class="{ selected: lang === 'en' }" type="button" @click="emit('select', 'en')"><span>{{ t.languageEnglish }}</span><b v-if="lang === 'en'">✓</b></button>
    <button class="language-option" :class="{ selected: lang === 'th' }" type="button" @click="emit('select', 'th')"><span>{{ t.languageThai }}</span><b v-if="lang === 'th'">✓</b></button>
  </section>
</template>
