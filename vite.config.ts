import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const projectRoot = import.meta.dirname;

/** Emit /precache.json so the service worker can cache the whole engine on demand. */
function precacheManifest() {
  return {
    name: 'nova-precache-manifest',
    apply: 'build' as const,
    closeBundle() {
      const root = resolve(projectRoot, 'dist');
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          const stat = statSync(full);
          if (stat.isDirectory()) walk(full);
          else if (!name.endsWith('.map') && name !== 'precache.json') {
            files.push('/' + relative(root, full).split(sep).join('/'));
          }
        }
      };
      try {
        walk(root);
        writeFileSync(
          join(root, 'precache.json'),
          JSON.stringify({ generated: new Date().toISOString(), count: files.length, files }, null, 0),
        );
      } catch (error) {
        this.warn(`precache manifest skipped: ${String(error)}`);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheManifest()],
  server: { port: 4310, host: '127.0.0.1' },
  preview: { port: 4311, host: '127.0.0.1' },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2200,
    rollupOptions: {
      input: {
        main: resolve(projectRoot, 'index.html'),
        app: resolve(projectRoot, 'app/index.html'),
      },
      output: {
        manualChunks(id: string) {
          if (id.includes('@cantoo/pdf-lib') || id.includes('@pdf-lib/fontkit')) return 'pdfengine';
          if (id.includes('pdfjs-dist')) return 'pdfjs';
          return undefined;
        },
      },
    },
  },
});
