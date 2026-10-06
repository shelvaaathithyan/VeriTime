import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:phone` serves over HTTPS on the local network so students can open
// the site on their phones — browsers only allow microphone access on HTTPS.
export default defineConfig(({ mode }) => {
  const phone = mode === 'phone'
  return {
    plugins: phone ? [react(), basicSsl()] : [react()],
    server: {
      port: 5173,
      host: phone ? true : undefined,
      proxy: {
        // API calls go through the dev server, so phones only need to reach this one address
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true,
        }
      }
    }
  }
})
