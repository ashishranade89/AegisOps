import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5176,
    proxy: {
      '/api': {
        // Use 127.0.0.1 explicitly — on Windows, 'localhost' can resolve to ::1 (IPv6)
        // while uvicorn only listens on 127.0.0.1, causing ECONNREFUSED errors
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8004',
        changeOrigin: true,
      },
    },
  },
})
