import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import compatColors from './build/compat-colors.js';

// In the desktop app the Laravel server serves this build and the API from
// the same origin, so the API base is relative (/api/v1). For `npm run dev`,
// /api is proxied to a locally running backend (BACKEND_URL).
export default defineConfig({
  // compatColors: the CSS also has to work in Electron 22 (Windows 7/8 build)
  plugins: [react(), tailwindcss(), compatColors()],
  server: {
    proxy: {
      '/api': process.env.BACKEND_URL || 'http://127.0.0.1:8766',
      '/storage': process.env.BACKEND_URL || 'http://127.0.0.1:8766',
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
