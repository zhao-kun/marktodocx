import assert from 'node:assert/strict';

import {
  applyMarginPreset,
  buildImageMapFromHtml,
  convertMarkdownFileInNode,
  convertMarkdownInNode,
  createJsdomDomAdapter,
  createNodeRuntime,
  normalizeBaseDirForCore,
  parseStyleAssignments,
  parseStyleJsonInput,
  renderMermaidFragmentsForNode,
  resolveNodeStyleOptions,
} from '../src/index.js';

async function main() {
  assert.equal(typeof createJsdomDomAdapter, 'function');
  assert.equal(typeof createNodeRuntime, 'function');
  assert.equal(typeof buildImageMapFromHtml, 'function');
  assert.equal(typeof normalizeBaseDirForCore, 'function');
  assert.equal(typeof applyMarginPreset, 'function');
  assert.equal(typeof parseStyleAssignments, 'function');
  assert.equal(typeof parseStyleJsonInput, 'function');
  assert.equal(typeof resolveNodeStyleOptions, 'function');
  assert.equal(typeof renderMermaidFragmentsForNode, 'function');
  assert.equal(typeof convertMarkdownInNode, 'function');
  assert.equal(typeof convertMarkdownFileInNode, 'function');

  const runtime = createNodeRuntime();
  const bytes = await convertMarkdownInNode({
    markdown: '# Node runtime smoke\n\nPlain paragraph.',
    baseDir: process.cwd(),
    runtime,
  });

  assert.equal(bytes instanceof Uint8Array, true);
  assert.equal(bytes.byteLength > 0, true);
  console.log('@marktodocx/runtime-node build smoke passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
