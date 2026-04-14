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
    manifest: 'manifest.json',
    modulePreload: false,
    rollupOptions: {
      input: {
        'webview/index': resolve(__dirname, 'webview/index.js'),
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