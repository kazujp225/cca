import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')
  
  console.log('Vite config env:', { PORT: env.PORT, VITE_PORT: env.VITE_PORT })
  
  return {
    plugins: [react()],
    server: {
      port: parseInt(env.VITE_PORT) || 6667,
      host: true,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://localhost:${env.PORT || 6666}`,
          changeOrigin: true,
          secure: false
        }
      }
    },
    build: {
      outDir: 'dist'
    }
  }
})