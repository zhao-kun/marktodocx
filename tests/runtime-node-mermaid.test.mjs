import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPuppeteerMermaidRenderer,
  renderMermaidToImageTagInNode,
} from '@marktodocx/runtime-node-mermaid';

test('runtime-node-mermaid renders a Mermaid diagram to an image tag', async () => {
  const rendered = await renderMermaidToImageTagInNode('graph TD\n  A-->B\n', 0);

  assert.match(rendered, /<div class="mermaid-diagram">/);
  assert.match(rendered, /data:image\/png;base64,/);
  assert.match(rendered, /Mermaid diagram 1/);
});

test('runtime-node-mermaid exposes a reusable renderer with close semantics', async () => {
  const renderer = await createPuppeteerMermaidRenderer();

  try {
    const rendered = await renderer.renderMermaidToImageTag('graph TD\n  Start-->Finish\n', 1);
    assert.match(rendered, /Mermaid diagram 2/);
  } finally {
    await renderer.close();
  }
});

test('runtime-node-mermaid injects bundled CJK Mermaid fonts into SVG output when needed', async () => {
  const renderer = await createPuppeteerMermaidRenderer();

  try {
    const artifact = await renderer.renderMermaidArtifacts('graph TD\n  A[事故分析] --> B[恢复服务]\n', 0);
    assert.match(artifact.svg, /Marktodocx Mermaid CJK/);
    assert.match(artifact.pngDataUri, /^data:image\/png;base64,/);
  } finally {
    await renderer.close();
  }
});