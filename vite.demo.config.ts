import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Demo app build: a normal SPA rooted at demos/. `npm run dev` also serves
// this (root is set so index.html resolves under demos/).
export default defineConfig({
  plugins: [react()],
  root: r('./demos'),
  build: {
    outDir: r('./dist-demo'),
    emptyOutDir: true,
  },
})
