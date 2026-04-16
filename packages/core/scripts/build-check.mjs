import assert from 'node:assert/strict';

import {
  buildHtmlDocument,
  generateDocx,
  normalizeStyleOptions,
  resolveDocumentStyle,
} from '../src/index.js';

async function main() {
  const normalized = normalizeStyleOptions({ preset: 'default', overrides: {} });
  const resolvedStyle = resolveDocumentStyle(normalized);
  const html = buildHtmlDocument('<p>Core build smoke test</p>', resolvedStyle);
  const docx = await generateDocx(html, resolvedStyle);

  assert.equal(docx instanceof Uint8Array, true);
  assert.equal(docx.byteLength > 0, true);
  console.log('@marktodocx/core build smoke passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});