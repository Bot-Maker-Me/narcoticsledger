import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import dyadComponentTagger from '@dyad-sh/react-vite-component-tagger';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // The component tagger only helps the Dyad editor; it must not tag production markup.
  plugins: [mode === 'development' && dyadComponentTagger(), react()],
  base: '/', // Set base path to root for proper deployment
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  // The parsing worker lazy-loads `xlsx`, which needs code-splitting (ES module workers).
  worker: { format: 'es' },
  // Debug/log output never ships; console.error/warn stay for genuine failures.
  esbuild: mode === 'production' ? { pure: ['console.log', 'console.debug', 'console.info'], drop: ['debugger'] } : {},
  build: {
    outDir: 'dist',
    // Source maps published next to the bundle hand anyone the original source, comments
    // and all. They are not needed in production.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Stable vendor chunks: an app-code deploy no longer invalidates the browser's
        // cached copy of React, the router, Supabase or React Query.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@tanstack')) return 'vendor-query';
          return undefined;
        },
      },
    },
  },
}));
