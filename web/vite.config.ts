import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:6324',
      '/ws': {
        target: 'ws://127.0.0.1:6324',
        ws: true
      }
    }
  }
})
