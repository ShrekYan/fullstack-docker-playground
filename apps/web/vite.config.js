import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      // 前端始终请求相对路径 /api/*，由代理转发到后端（避免 CORS）
      // 本地运行默认 http://localhost:3000，Docker 内由 compose 设置 API_PROXY_TARGET
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
