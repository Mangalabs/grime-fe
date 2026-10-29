import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // /api goes to the same backend the app calls: Google's sign-in returns the
  // popup to this server (GOOGLE_REDIRECT_URI), so it must reach that backend.
  const apiBaseUrl = loadEnv(mode, process.cwd(), '').VITE_API_BASE_URL?.trim()
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': apiBaseUrl || 'http://localhost:3000',
      },
    },
  }
})
