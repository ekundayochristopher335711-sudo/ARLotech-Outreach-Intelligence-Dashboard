import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(rootDirectory, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
    environment: 'node',
  },
})

