import { defineConfig } from 'vite';

// El cliente vive en client/. En desarrollo Vite proxifica el WebSocket del
// servidor autoritativo (puerto 8790) para que el navegador use un solo origen.
export default defineConfig({
  root: 'client',
  publicDir: false,
  server: {
    port: 5180,
    // client/ importa shared/ y maps/ desde la carpeta del proyecto.
    fs: { allow: ['..'] },
    proxy: {
      '/ws': { target: 'ws://localhost:8790', ws: true },
      '/api': { target: 'http://localhost:8790' },
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    // Phaser va en su propio fichero (cacheable entre versiones del juego).
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
});
