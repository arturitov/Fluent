import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build identity, shown in Settings so anyone can tell at a glance whether
// they're on the latest deploy or a cached build. GITHUB_SHA is set by Actions.
const sha = (process.env.GITHUB_SHA || '').slice(0, 7) || 'local'
const builtAt = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __BUILD_VERSION__: JSON.stringify(`${sha} · ${builtAt}`),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          pdf: ['pdfjs-dist'],
          docx: ['mammoth'],
          vendor: ['react', 'react-dom', '@supabase/supabase-js'],
        },
      },
    },
  },
})
