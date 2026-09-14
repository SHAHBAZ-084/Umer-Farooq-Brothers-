import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** When Electron loads the Vite dev server, disable HMR so minimize/restore cannot trigger a full reload. */
const electronDev = process.env.ELECTRON_DEV === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: electronDev ? false : undefined,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
      },
    },
  },
});
