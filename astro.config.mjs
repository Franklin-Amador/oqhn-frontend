// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    // Pre-bundle heavy deps so Vite doesn't re-optimize on first page load
    // (avoids "Failed to fetch dynamically imported module" blank screen on cold start)
    optimizeDeps: {
      include: [
        'leaflet',
        'react-leaflet',
        'react-leaflet > leaflet',
      ],
    },
  },
});
