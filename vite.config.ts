import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '')

  return {
    plugins: [react()],
    define: {
      // 這裡很重要！
      // 它會把 Vercel 上的環境變數 VITE_API_KEY 注入到程式碼的 process.env.API_KEY 中
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY),
    },
  }
})