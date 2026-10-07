import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In the desktop app the Laravel server serves this build and the API from
// the same origin, so the API base is relative (/api/v1). For `npm run dev`,
// /api is proxied to a locally running backend (BACKEND_URL).
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
