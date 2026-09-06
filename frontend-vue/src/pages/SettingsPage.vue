<script setup lang="ts">
// Provides navigation to user preferences and support pages.
defineProps<{ t: any; languageLabel: string }>();
const emit = defineEmits<{ open: [page: 'transit' | 'favorites' | 'report' | 'language'] }>();
</script>

<template>
  <section class="screen page-screen settings-page">
    <p class="settings-section">{{ t.transitSection }}</p>
    <button class="setting-row" type="button" @click="emit('open', 'transit')"><span class="setting-icon">▣</span><strong>{{ t.transit }}</strong><b>›</b></button>
    <button class="setting-row" type="button" @click="emit('open', 'favorites')"><span class="setting-icon">♡</span><strong>{{ t.favorites }}</strong><b>›</b></button>
    <p class="settings-section">{{ t.supportSection }}</p>
    <button class="setting-row" type="button" @click="emit('open', 'report')"><span class="setting-icon">?</span><strong>{{ t.report }}</strong><b>›</b></button>
    <button class="setting-row" type="button" @click="emit('open', 'language')"><span class="setting-icon">文</span><strong>{{ t.language }}</strong><span class="setting-value">{{ languageLabel }}</span><b>›</b></button>
  </section>
</template>
