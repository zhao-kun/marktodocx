import { extractMermaidBlocks } from '@markdocx/core';

function reportProgress(onProgress, message) {
  if (typeof onProgress === 'function') {
    onProgress(message);
  }
}

export async function renderMermaidFragmentsForNode(markdown, md, layoutMetrics, { renderMermaid, onProgress } = {}) {
  const mermaidCodes = extractMermaidBlocks(markdown, md);
  if (mermaidCodes.length === 0) {
    return [];
  }

  if (typeof renderMermaid !== 'function') {
    throw new Error('Mermaid rendering requires an explicit renderMermaid adapter. Provide one from @markdocx/runtime-node-mermaid.');
  }

  const renderedMermaid = [];
  for (let index = 0; index < mermaidCodes.length; index += 1) {
    reportProgress(onProgress, `Rendering diagram ${index + 1} of ${mermaidCodes.length}...`);
    try {
      renderedMermaid.push(await renderMermaid(mermaidCodes[index], index, layoutMetrics));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Mermaid diagram ${index + 1} failed: ${message}. Check the diagram syntax.`);
    }
  }

  return renderedMermaid;
}
