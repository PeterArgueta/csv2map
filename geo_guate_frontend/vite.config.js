import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Configurar proxy para las solicitudes a la API de FastAPI
      '/procesar_csv': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },

    }
  }
});