import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// VITE_MOCK=1 swaps @forge/bridge for an in-browser mock running the real engine on sample data (local dev + screenshots only).
const mock = process.env.VITE_MOCK === '1';
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: { alias: mock ? { '@forge/bridge': fileURLToPath(new URL('./src/mock/bridge.js', import.meta.url)) } : {} },
  build: { outDir: 'dist', sourcemap: false },
});
