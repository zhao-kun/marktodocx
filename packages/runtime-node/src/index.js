import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildHtmlDocument,
  createMarkdownRenderer,
  generateDocx,
  inlineLocalImages,
  normalizeTables,
  resolveDocumentLayout,
  resolveDocumentStyle,
} from '@marktodocx/core';

import { createJsdomDomAdapter, createNodeRuntime } from './dom-jsdom.js';
import { buildImageMapFromHtml, normalizeBaseDirForCore } from './image-fs.js';
import { renderMermaidFragmentsForNode } from './mermaid-adapter.js';
import {
  applyMarginPreset,
  parseStyleAssignments,
  parseStyleJsonInput,
  resolveNodeStyleOptions,
} from './style-options.js';

function reportProgress(onProgress, message) {
  if (typeof onProgress === 'function') {
    onProgress(message);
  }
}

export async function convertMarkdownInNode({
  markdown,
  baseDir,
  styleOptions,
  runtime = createNodeRuntime(),
  renderMermaid,
  onProgress,
} = {}) {
  if (typeof markdown !== 'string') {
    throw new TypeError('markdown must be a string');
  }
  if (typeof baseDir !== 'string' || baseDir.length === 0) {
    throw new TypeError('baseDir must be a non-empty string');
  }

  reportProgress(onProgress, 'Parsing Markdown...');
  const resolvedStyle = resolveDocumentStyle(styleOptions);
  const layoutMetrics = resolveDocumentLayout(resolvedStyle.page.marginPreset);
  const md = createMarkdownRenderer(resolvedStyle);

  const renderedMermaid = await renderMermaidFragmentsForNode(markdown, md, layoutMetrics, {
    renderMermaid,
    onProgress,
  });

  reportProgress(onProgress, 'Rendering HTML...');
  const htmlBody = md.render(markdown, { renderedMermaid: [...renderedMermaid] });

  reportProgress(onProgress, 'Resolving local images...');
  const imageMap = await buildImageMapFromHtml(htmlBody, path.resolve(baseDir), runtime);
  const inlinedHtml = inlineLocalImages(htmlBody, imageMap, normalizeBaseDirForCore(baseDir), runtime);
  const normalizedHtml = normalizeTables(inlinedHtml, resolvedStyle, layoutMetrics, runtime);
  const htmlDocument = buildHtmlDocument(normalizedHtml, resolvedStyle);

  reportProgress(onProgress, 'Generating DOCX...');
  return generateDocx(htmlDocument, resolvedStyle, layoutMetrics);
}

export async function convertMarkdownFileInNode({
  inputPath,
  outputPath,
  styleOptions,
  runtime = createNodeRuntime(),
  renderMermaid,
  onProgress,
} = {}) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    throw new TypeError('inputPath must be a non-empty string');
  }

  const resolvedInputPath = path.resolve(inputPath);
  const resolvedOutputPath = outputPath
    ? path.resolve(outputPath)
    : path.resolve(
      path.dirname(resolvedInputPath),
      `${path.basename(resolvedInputPath, path.extname(resolvedInputPath))}.docx`
    );

  const markdown = await fs.readFile(resolvedInputPath, 'utf8');
  const bytes = await convertMarkdownInNode({
    markdown,
    baseDir: path.dirname(resolvedInputPath),
    styleOptions,
    runtime,
    renderMermaid,
    onProgress,
  });

  await fs.writeFile(resolvedOutputPath, bytes);
  return {
    outputPath: resolvedOutputPath,
    bytes,
  };
}

export {
  applyMarginPreset,
  buildImageMapFromHtml,
  createJsdomDomAdapter,
  createNodeRuntime,
  normalizeBaseDirForCore,
  parseStyleAssignments,
  parseStyleJsonInput,
  renderMermaidFragmentsForNode,
  resolveNodeStyleOptions,
};
