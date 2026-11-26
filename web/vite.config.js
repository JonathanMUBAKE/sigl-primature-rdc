import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

// Racine « web » : index.html et src/ vivent ici. Le serveur Fastify écoute sur 3000.
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwind()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3200',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
