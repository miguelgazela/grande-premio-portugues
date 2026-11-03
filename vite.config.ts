import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  // Aceita ligações da rede e de túneis HTTPS (testes com telemóveis/iPads).
  server: { host: true, allowedHosts: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        sim: resolve(root, 'sim.html'),
      },
    },
  },
});
