import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // Existing backend /api/* routes (dashboard, admin, etc.) — no rewrite needed
        '/api': { target: 'http://localhost:2000', changeOrigin: true },
        // Menu-specific routes: use /data-api prefix → rewrite to root on backend
        // This avoids conflict with SPA route /menu
        '/data-api': {
          target: 'http://localhost:2000',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/data-api/, ''),
        },
        '/branch': { target: 'http://localhost:2000', changeOrigin: true },
        '/uploads': { target: 'http://localhost:2000', changeOrigin: true },
      },
    },
  };
});
