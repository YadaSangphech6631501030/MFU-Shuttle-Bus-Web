<script setup lang="ts">
// Displays shuttle bus lines and their station lists.
import type { Station } from '../services/api';

type Line = 'line1' | 'line2';

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
</script>

<template>
  <section class="screen page-screen">
    <div v-if="isLoading" class="loading-state">{{ t.loading }}</div>
    <article v-for="line in (['line1', 'line2'] as Line[])" :key="line" class="line-section" :class="line">
      <button class="line-section-head" type="button" @click="expandedLines[line] = !expandedLines[line]">
        <span class="line-circle"><img :src="busIconUrl" alt="" /></span>
        <span><strong>{{ line === 'line1' ? t.line1 : t.line2 }}</strong><small>{{ line === 'line1' ? t.mainRoute : t.medicalRoute }} · {{ lineStations(line).length }} {{ t.stations }}</small></span>
        <b>{{ expandedLines[line] ? '⌃' : '⌄' }}</b>
      </button>
      <div v-if="expandedLines[line]" class="line-section-body">
        <div class="list-search"><span>⌕</span><input v-model="transitSearch[line]" :placeholder="t.findStation" /></div>
        <p v-if="!filteredLineStations(line).length" class="empty-state">{{ t.noStations }}</p>
        <button v-for="station in filteredLineStations(line)" :key="station.id" class="station-list-row" type="button" @click="emit('select', station)">
          <span class="station-dot">●</span><strong>{{ stationName(station) }}</strong><span>›</span>
        </button>
      </div>
    </article>
  </section>
</template>
