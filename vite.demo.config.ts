import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Demo app build: a normal SPA rooted at demos/. `npm run dev` also serves
// this (root is set so index.html resolves under demos/).
//
// On GitHub Pages the demo is served from a project subpath
// (https://<user>.github.io/dag-browser-widget/), so the Pages build sets
// DEMO_BASE=/dag-browser-widget/ to fix asset URLs. Local dev/build use '/'.
export default defineConfig({
  base: process.env.DEMO_BASE ?? '/',
  plugins: [react()],
  root: r('./demos'),
  build: {
    outDir: r('./dist-demo'),
    emptyOutDir: true,
  },
})
