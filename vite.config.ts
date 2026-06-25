import { defineConfig } from "@lovable.dev/vite-tanstack-config";
// vite.config.ts
import react from '@vitejs/plugin-react'
import path from 'path'

export default {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: true,
});
