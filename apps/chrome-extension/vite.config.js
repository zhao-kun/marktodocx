import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
);

const syncManifestVersion = () => ({
  name: 'marktodocx-sync-manifest-version',
  apply: 'build',
  closeBundle() {
    const manifestPath = resolve(__dirname, 'dist/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.version !== pkg.version) {
      manifest.version = pkg.version;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  },
});

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
    syncManifestVersion(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        'page/page': resolve(__dirname, 'src/page/page.js'),
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
