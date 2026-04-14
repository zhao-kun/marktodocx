import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'node20',
    ssr: true,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/extension.js'),
      external: (id) => id === 'vscode' || nodeBuiltins.has(id) || id.startsWith('node:'),
      output: {
        format: 'cjs',
        entryFileNames: 'extension.cjs',
        chunkFileNames: 'chunks/extension-[name]-[hash].cjs',
        exports: 'auto',
        codeSplitting: false,
      },
    },
  },
  ssr: {
    target: 'node',
    noExternal: true,
  },
});
