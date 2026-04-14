const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const extensionSourceEntry = path.join(rootDir, 'src', 'extension.js');
  const extensionBundlePath = path.join(rootDir, 'dist', 'extension.cjs');
  const manifestPath = path.join(rootDir, 'dist', 'manifest.json');

  await fs.access(extensionSourceEntry);
  await fs.access(extensionBundlePath);

  const bundleSource = await fs.readFile(extensionBundlePath, 'utf8');
  assert.ok(
    !/require\(['"]@markdocx\//.test(bundleSource) && !/from ['"]@markdocx\//.test(bundleSource),
    'Bundled extension.cjs still references @markdocx/* workspace packages at runtime.'
  );

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const entry = manifest['webview/index.js'] || Object.values(manifest).find((item) => item.isEntry);

  assert.ok(entry?.file, 'Built webview entry was not found in the Vite manifest.');
  await fs.access(path.join(rootDir, 'dist', entry.file));

  console.log('VSCode extension build smoke passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});