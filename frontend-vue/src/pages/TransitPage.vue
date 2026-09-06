<script setup lang="ts">
// Displays shuttle bus lines and their station lists.
import type { Station } from '../services/api';

type Line = 'line1' | 'line2';

const routes: Array<{ id: Line; color: string }> = [
  { id: 'line1', color: '#bc9945' },
  { id: 'line2', color: '#777777' },
];

defineProps<{
  t: any;
  busIconUrl: string;
  isLoading: boolean;
  expandedLines: Record<Line, boolean>;
  transitSearch: Record<Line, string>;
  lineStations: (line: Line) => Station[];
  filteredLineStations: (line: Line) => Station[];
  stationName: (station: Station) => string;
}>();

const emit = defineEmits<{ select: [station: Station] }>();

function routeName(route: { id: Line }, t: any) {
  return route.id === 'line1' ? t.line1 : t.line2;
}
</script>

<template>
  <section class="screen page-screen">
    <div v-if="isLoading" class="loading-state">{{ t.loading }}</div>
    <article v-for="route in routes" :key="route.id" class="line-section" :class="route.id">
      <button class="line-section-head" type="button" @click="expandedLines[route.id] = !expandedLines[route.id]">
        <span class="line-circle" :style="{ borderColor: route.color }"><img :src="busIconUrl" alt="" /></span>
        <span><strong>{{ routeName(route, t) }}</strong><small>{{ route.id }} · {{ lineStations(route.id).length }} {{ t.stations }}</small></span>
        <b>{{ expandedLines[route.id] ? '⌃' : '⌄' }}</b>
      </button>
      <div v-if="expandedLines[route.id]" class="line-section-body">
        <div class="list-search"><span>⌕</span><input v-model="transitSearch[route.id]" :placeholder="t.findStation" /></div>
        <p v-if="!filteredLineStations(route.id).length" class="empty-state">{{ t.noStations }}</p>
        <button v-for="station in filteredLineStations(route.id)" :key="station.id" class="station-list-row" type="button" @click="emit('select', station)">
          <span class="station-dot">●</span><strong>{{ stationName(station) }}</strong><span>›</span>
        </button>
      </div>
    </article>
  </section>
</template>
