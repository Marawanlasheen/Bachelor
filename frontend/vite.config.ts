import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  server: {
    proxy: {
      '/chat': 'http://127.0.0.1:8001',
      '/chat/reset': 'http://127.0.0.1:8001',
      '/compare': 'http://127.0.0.1:8001',
      '/compile': 'http://127.0.0.1:8001',
      '/health': 'http://127.0.0.1:8001',
      '/tracker': 'http://127.0.0.1:8001',
      '/bank': 'http://127.0.0.1:8001',
    },
  },
})
