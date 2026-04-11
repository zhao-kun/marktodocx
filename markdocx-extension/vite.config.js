import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    nodePolyfills({
      exclude: ['vm'],
      globals: {
        Buffer: true,
        process: true,
        global: true,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        'popup/popup': resolve(__dirname, 'src/popup/popup.js'),
        background: resolve(__dirname, 'src/background.js'),
        'offscreen/offscreen': resolve(__dirname, 'src/offscreen/offscreen.js'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
