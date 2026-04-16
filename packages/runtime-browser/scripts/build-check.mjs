import assert from 'node:assert/strict';

import {
  convertMarkdownInBrowser,
  createBrowserRuntime,
  createNativeDomAdapter,
  inlineImagesFromMap,
  renderMermaidArtifacts,
  renderMermaidArtifactsForMarkdown,
  renderMermaidToImageTag,
} from '../src/index.js';

function main() {
  assert.equal(typeof createNativeDomAdapter, 'function');
  assert.equal(typeof createBrowserRuntime, 'function');
  assert.equal(typeof inlineImagesFromMap, 'function');
  assert.equal(typeof renderMermaidArtifacts, 'function');
  assert.equal(typeof renderMermaidToImageTag, 'function');
  assert.equal(typeof renderMermaidArtifactsForMarkdown, 'function');
  assert.equal(typeof convertMarkdownInBrowser, 'function');
  console.log('@marktodocx/runtime-browser build smoke passed');
}

main();
