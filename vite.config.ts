import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode, command }) => {
  // Build de produção sem Supabase ficaria uma app sem ligação: falha cedo, com mensagem clara.
  if (command === 'build' && mode === 'production') {
    const env = loadEnv(mode, root, 'VITE_');
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Faltam variáveis de ambiente para o build: ${missing.join(', ')}. Define-as no .env ou na Vercel (Settings > Environment Variables).`);
  }
  return {
  esbuild: { jsx: 'automatic' },
  // Aceita ligações da rede e de túneis HTTPS (testes com telemóveis/iPads).
  server: { host: true, allowedHosts: true },
  build: {
    rollupOptions: {
      input: {
        // sim.html (simulador de mecânica) é só de desenvolvimento: o dev server serve-o,
        // mas não vai para o build de produção.
        main: resolve(root, 'index.html'),
      },
    },
  },
  };
});
