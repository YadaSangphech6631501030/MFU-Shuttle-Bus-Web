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
        <span class="favorite-icon">♥</span><strong>{{ stationName(station) }}</strong>
        <button type="button" :aria-label="t.remove" @click="emit('remove', station)">⌫</button>
      </article>
    </div>
  </section>
</template>
