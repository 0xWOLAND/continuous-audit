import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'https://d17b1ef7-usa-spending-poller.bhargav-annem.workers.dev/',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
}) 