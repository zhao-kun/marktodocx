import {
  buildHtmlDocument,
  createMarkdownRenderer,
  extractMermaidBlocks,
  generateDocx,
  normalizeTables,
  resolveDocumentLayout,
  resolveDocumentStyle,
} from '@markdocx/core';

import { createBrowserRuntime, createNativeDomAdapter } from './dom-native.js';
import { inlineImagesFromMap } from './image-map.js';
import { renderMermaidArtifacts, renderMermaidToImageTag } from './mermaid-browser.js';

function reportProgress(onProgress, message) {
  if (typeof onProgress === 'function') {
    onProgress(message);
  }
}

export async function convertMarkdownInBrowser({
  markdown,
  imageMap = {},
  mdRelativeDir = '',
  styleOptions,
  onProgress,
} = {}) {
  if (typeof markdown !== 'string') {
    throw new TypeError('markdown must be a string');
  }

  reportProgress(onProgress, 'Parsing Markdown...');
  const resolvedStyle = resolveDocumentStyle(styleOptions);
  const layoutMetrics = resolveDocumentLayout(resolvedStyle.page.marginPreset);
  const runtime = createBrowserRuntime();
  const md = createMarkdownRenderer(resolvedStyle);

  const mermaidCodes = extractMermaidBlocks(markdown, md);
  const renderedMermaid = [];
  for (let index = 0; index < mermaidCodes.length; index += 1) {
    reportProgress(onProgress, `Rendering diagram ${index + 1} of ${mermaidCodes.length}...`);
    try {
      renderedMermaid.push(await renderMermaidToImageTag(mermaidCodes[index], index, layoutMetrics));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Mermaid diagram ${index + 1} failed: ${message}. Check the diagram syntax.`);
    }
  }

  reportProgress(onProgress, 'Rendering HTML...');
  const htmlBody = md.render(markdown, { renderedMermaid: [...renderedMermaid] });
  const inlinedHtml = inlineImagesFromMap(htmlBody, imageMap, mdRelativeDir, runtime);
  const normalizedHtml = normalizeTables(inlinedHtml, resolvedStyle, layoutMetrics, runtime);
  const htmlDocument = buildHtmlDocument(normalizedHtml, resolvedStyle);

  reportProgress(onProgress, 'Generating DOCX...');
  return generateDocx(htmlDocument, resolvedStyle, layoutMetrics);
}

export async function renderMermaidArtifactsForMarkdown(markdown, styleOptions) {
  const resolvedStyle = resolveDocumentStyle(styleOptions);
  const layoutMetrics = resolveDocumentLayout(resolvedStyle.page.marginPreset);
  const md = createMarkdownRenderer(resolvedStyle);
  const mermaidCodes = extractMermaidBlocks(markdown, md);
  const results = [];

  for (let index = 0; index < mermaidCodes.length; index += 1) {
    const artifact = await renderMermaidArtifacts(mermaidCodes[index], index, layoutMetrics);
    results.push({
      index,
      svg: artifact.svg,
      pngDataUri: artifact.pngDataUri,
      displayWidth: artifact.displayWidth,
      displayHeight: artifact.displayHeight,
    });
  }

  return results;
}

export {
  createBrowserRuntime,
  createNativeDomAdapter,
  inlineImagesFromMap,
  renderMermaidArtifacts,
  renderMermaidToImageTag,
};
