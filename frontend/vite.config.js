import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true
  },
  define: {
    __API_BASE_URL__: JSON.stringify('https://usa-spending-poller.bhargav-annem.workers.dev')
  }
}) 