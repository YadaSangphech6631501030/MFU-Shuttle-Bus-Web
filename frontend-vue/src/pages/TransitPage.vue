<script setup lang="ts">
// Displays shuttle bus lines and their station lists.
import { computed } from 'vue';
import type { ShuttleRoute, Station } from '../services/api';

type Line = string;

const fallbackRoutes: ShuttleRoute[] = [
  { id: 'line1', name: 'Line 1', nameTH: 'สาย 1', color: '#bc9945', enabled: true, geometry: { type: 'LineString', coordinates: [] } },
  { id: 'line2', name: 'Line 2', nameTH: 'สาย 2', color: '#777777', enabled: true, geometry: { type: 'LineString', coordinates: [] } },
];

const props = defineProps<{
  t: any;
  lang: 'en' | 'th';
  isLoading: boolean;
  routes: ShuttleRoute[];
  routesLoaded: boolean;
  expandedLines: Record<Line, boolean>;
  transitSearch: Record<Line, string>;
  lineStations: (line: Line) => Station[];
  filteredLineStations: (line: Line) => Station[];
  stationName: (station: Station) => string;
}>();

const visibleRoutes = computed(() => props.routesLoaded ? props.routes : fallbackRoutes);

const emit = defineEmits<{ select: [station: Station] }>();

function routeName(route: ShuttleRoute, t: any, lang: 'en' | 'th') {
  if (route.id === 'line1') return t.line1;
  if (route.id === 'line2') return t.line2;
  return lang === 'th' ? route.nameTH || route.name || route.id : route.name || route.id;
}

function routeSubtitle(route: ShuttleRoute, t: any, lang: 'en' | 'th') {
  if (route.id === 'line1') return t.mainRoute;
  if (route.id === 'line2') return t.medicalRoute;
  return lang === 'th' ? route.nameTH || route.name || route.id : route.name || route.id;
}
</script>

<template>
  <section class="screen page-screen">
    <div v-if="isLoading" class="loading-state">{{ t.loading }}</div>
    <article v-for="route in visibleRoutes" :key="route.id" class="line-section" :class="route.id">
      <button class="line-section-head" type="button" @click="expandedLines[route.id] = !expandedLines[route.id]">
        <span class="line-circle" :style="{ color: route.color }">
          <svg class="solid-bus-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 3h12a3 3 0 0 1 3 3v13h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3V6a3 3 0 0 1 3-3Z" fill="currentColor" />
            <rect x="6" y="6" width="12" height="5" rx="1" fill="#fff" />
            <circle cx="7.5" cy="16" r="1.2" fill="#fff" />
            <circle cx="16.5" cy="16" r="1.2" fill="#fff" />
          </svg>
        </span>
        <span><strong>{{ routeName(route, t, lang) }}</strong><small>{{ routeSubtitle(route, t, lang) }} · {{ lineStations(route.id).length }} {{ t.stations }}</small></span>
        <svg class="expand-icon" :class="{ expanded: expandedLines[route.id] }" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
        </svg>
      </button>
      <div v-if="expandedLines[route.id]" class="line-section-body">
        <div class="list-search">
          <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.2" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" />
          </svg>
          <input v-model="transitSearch[route.id]" :placeholder="t.findStation" />
        </div>
        <p v-if="!filteredLineStations(route.id).length" class="empty-state">{{ t.noStations }}</p>
        <button v-for="station in filteredLineStations(route.id)" :key="station.id" class="station-list-row" type="button" @click="emit('select', station)">
          <span class="station-icon" :style="{ color: route.color }">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2" />
              <circle cx="12" cy="10" r="2.2" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </span>
          <strong>{{ stationName(station) }}</strong>
          <svg class="row-chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
          </svg>
        </button>
      </div>
    </article>
  </section>
</template>
