<script setup lang="ts">
// Displays and manages the user's favorite stations.
import type { Station } from '../services/api';

defineProps<{
  t: any;
  favoriteStations: Station[];
  stationName: (station: Station) => string;
}>();

const emit = defineEmits<{
  add: [];
  remove: [station: Station];
}>();
</script>

<template>
  <section class="screen page-screen favorites-page">
    <button class="add-favorite" type="button" @click="emit('add')">
      <span>+</span><strong>{{ t.addNew }}</strong><small>{{ t.saveFavorite }}</small>
    </button>
    <p v-if="!favoriteStations.length" class="empty-state large-empty">{{ t.noFavorites }}</p>
    <div v-else class="favorite-list">
      <article v-for="station in favoriteStations" :key="station.id" class="favorite-row">
        <span class="favorite-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M20.8 8.8c0 5.2-8.8 10.2-8.8 10.2S3.2 14 3.2 8.8A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z" />
          </svg>
        </span>
        <strong>{{ stationName(station) }}</strong>
        <button class="favorite-remove" type="button" :aria-label="t.remove" @click="emit('remove', station)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13M10 10v7m4-7v7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
          </svg>
        </button>
      </article>
    </div>
  </section>
</template>
