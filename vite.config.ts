import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@reactflow/core', replacement: path.resolve(__dirname, 'node_modules/@reactflow/core/dist/esm/index.js') },
    ],
  },
  server: {
    port: 5173,
  },
});
