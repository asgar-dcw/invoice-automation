import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/webhook': {
        target: 'https://hr.n8n.dcw.dev',
        changeOrigin: true,
        secure: true,
      },
      '/sheets': {
        target: 'https://sheets.googleapis.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sheets/, ''),
      },
    },
  },
});
