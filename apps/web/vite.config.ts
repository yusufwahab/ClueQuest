import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = env.VITE_DEV_API_TARGET || 'http://localhost:8790';
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    server: { port: 5174, proxy: { '/api': target, '/socket.io': { target, ws: true } } },
    preview: { port: 4174, proxy: { '/api': target, '/socket.io': { target, ws: true } } },
    build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  };
});
