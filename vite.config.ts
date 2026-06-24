import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// Library build: bundles src/index.ts as the published package. React stays
// external (peer dependency). Demos use vite.demo.config.ts instead; tests use
// vitest.config.ts. vite-plugin-dts emits .d.ts alongside the bundle.
export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      rollupTypes: false,
    }),
  ],
  build: {
    lib: {
      entry: {
        index: r('./src/index.ts'),
        'core/index': r('./src/core/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    sourcemap: true,
  },
})
