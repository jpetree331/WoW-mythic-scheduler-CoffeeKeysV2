import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        strictPort: true,
        host: '0.0.0.0',
        // Dev proxy so frontend and backend appear same-origin to the browser.
        // This avoids cookie issues with Discord login during local development.
        proxy: {
          '/players': { target: 'http://localhost:8787', changeOrigin: true },
          '/coffee': { target: 'http://localhost:8787', changeOrigin: true },
          '/board': { target: 'http://localhost:8787', changeOrigin: true },
          '/admin': { target: 'http://localhost:8787', changeOrigin: true },
          '/events': { target: 'http://localhost:8787', changeOrigin: true },
          '/auth': { target: 'http://localhost:8787', changeOrigin: true },
          '/me': { target: 'http://localhost:8787', changeOrigin: true },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
