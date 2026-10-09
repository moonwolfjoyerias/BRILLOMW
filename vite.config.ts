import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' para que el mismo build funcione servido en web y empaquetado
// dentro de Tauri (escritorio) y Capacitor (tablet), que cargan archivos locales.
export default defineConfig({
  base: './',
  plugins: [react()],
  // El SDK de Firebase ocupa la mayor parte; en caja y tablet el archivo es local.
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node'
  }
});
