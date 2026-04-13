import assert from 'node:assert/strict';

import {
  createPuppeteerMermaidRenderer,
  renderMermaidArtifactsInNode,
  renderMermaidToImageTagInNode,
} from '../src/index.js';

async function main() {
  assert.equal(typeof createPuppeteerMermaidRenderer, 'function');
  assert.equal(typeof renderMermaidArtifactsInNode, 'function');
  assert.equal(typeof renderMermaidToImageTagInNode, 'function');
  console.log('@markdocx/runtime-node-mermaid build smoke passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});