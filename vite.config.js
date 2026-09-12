import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/valhalla': { target: 'http://localhost:8002', rewrite: path => path.replace(/^\/valhalla/, '') } },
  },
})
