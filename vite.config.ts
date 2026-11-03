import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));

/** Hash curto do commit: o da Vercel se existir, senão o do git, senão 'dev'. */
function appVersion(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode, command }) => {
  // Build de produção sem Supabase ficaria uma app sem ligação: falha cedo, com mensagem clara.
  if (command === 'build' && mode === 'production') {
    const env = loadEnv(mode, root, 'VITE_');
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter((k) => !env[k]);
    if (missing.length) throw new Error(`Faltam variáveis de ambiente para o build: ${missing.join(', ')}. Define-as no .env ou na Vercel (Settings > Environment Variables).`);
  }
  return {
  esbuild: { jsx: 'automatic' },
  define: { __APP_VERSION__: JSON.stringify(appVersion()), __APP_BUILT__: JSON.stringify(new Date().toISOString()) },
  // Aceita ligações da rede e de túneis HTTPS (testes com telemóveis/iPads).
  server: { host: true, allowedHosts: true },
  build: {
    rollupOptions: {
      input: {
        // sim.html (simulador de mecânica) é só de desenvolvimento: o dev server serve-o,
        // mas não vai para o build de produção.
        main: resolve(root, 'index.html'),
        // /prof: página para instalar a app da professora no ecrã principal (manifest com start_url próprio).
        prof: resolve(root, 'prof.html'),
      },
    },
  },
  };
});
