import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base keeps the build working both locally and on GitHub Pages
// project sites (https://<user>.github.io/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
})
