import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import * as compiler from '@vue/compiler-sfc';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [vue({ compiler })],
});
