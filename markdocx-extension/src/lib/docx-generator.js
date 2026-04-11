import JSZip from 'jszip';
import htmlToDocx from 'html-to-docx';
import {
  DOCX_PAGE_SIZE,
  MERMAID_RENDER_SCALE,
} from './constants.js';
import { resolveDocumentStyle } from './document-style.js';
import { resolveDocumentLayout } from './document-layout.js';

const EMUS_PER_PIXEL = 9525;

function toCssFontFamily(primary, fallbacks = []) {
  const values = [primary, ...fallbacks].filter(Boolean);
  return values.map((value) => (value.includes(' ') ? `"${value}"` : value)).join(', ');
}

async function toUint8Array(data) {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new Error(`Unexpected htmlToDocx return type: ${typeof data} / ${data?.constructor?.name}`);
}

export function buildHtmlDocument(contentHtml, resolvedStyle = resolveDocumentStyle()) {
  const bodyFontFamily = toCssFontFamily(resolvedStyle.body.fontFamily, ['Noto Sans CJK SC', 'Microsoft YaHei', 'sans-serif']);
  const headingFontFamily = toCssFontFamily(resolvedStyle.headings.fontFamily, ['Noto Sans CJK SC', 'Microsoft YaHei', 'sans-serif']);
  const codeFontFamily = toCssFontFamily(resolvedStyle.code.fontFamily, ['Consolas', 'monospace']);
  const inlineCodeFontStyle = resolvedStyle.code.inlineItalic ? 'italic' : 'normal';
  const blockquoteFontStyle = resolvedStyle.blockquote.italic ? 'italic' : 'normal';

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <style>',
    `    body { font-family: ${bodyFontFamily}; font-size: ${resolvedStyle.body.fontSizePt}pt; line-height: ${resolvedStyle.body.lineHeight}; color: ${resolvedStyle.body.color}; }`,
    `    h1, h2, h3, h4, h5, h6 { font-family: ${headingFontFamily}; color: ${resolvedStyle.headings.color}; page-break-after: avoid; }`,
    '    h1 { font-size: 20pt; margin: 0 0 12pt; }',
    '    h2 { font-size: 16pt; margin: 18pt 0 10pt; }',
    '    h3 { font-size: 13pt; margin: 14pt 0 8pt; }',
    '    p, ul, ol, blockquote, pre, table { margin: 0 0 10pt; }',
    '    ul, ol { padding-left: 20pt; }',
    '    li { margin: 0 0 4pt; }',
    '    table { width: 100%; border-collapse: collapse; table-layout: fixed; }',
    `    th, td { border: 1px solid ${resolvedStyle.tables.borderColor}; padding: 6pt 8pt; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; word-break: break-word; }`,
    `    th { background-color: ${resolvedStyle.tables.headerBackgroundColor}; color: ${resolvedStyle.tables.headerTextColor}; font-weight: 700; }`,
    '    th code, td code { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }',
    `    code { font-family: ${codeFontFamily}; background-color: ${resolvedStyle.code.inlineBackgroundColor}; color: ${resolvedStyle.code.textColor}; padding: 1pt 3pt; border-radius: 2pt; font-style: ${inlineCodeFontStyle}; }`,
    `    pre { background-color: ${resolvedStyle.code.blockBackgroundColor}; border: 1px solid ${resolvedStyle.code.blockBorderColor}; padding: 10pt; overflow-wrap: anywhere; white-space: pre-wrap; }`,
    '    pre code { background: transparent; padding: 0; }',
    '    .code-block-table { width: 100%; border-collapse: collapse; margin: 0 0 10pt; table-layout: fixed; }',
    `    .code-block-table td.code-block-cell { border: 1px solid ${resolvedStyle.code.blockBorderColor}; background-color: ${resolvedStyle.code.blockBackgroundColor}; color: ${resolvedStyle.code.textColor}; padding: 8pt 10pt; }`,
    `    .inline-code { background-color: ${resolvedStyle.code.inlineBackgroundColor}; color: ${resolvedStyle.code.textColor}; font-style: ${inlineCodeFontStyle}; }`,
    `    .code-block-language { font-family: ${codeFontFamily}; font-size: 9pt; color: ${resolvedStyle.code.languageBadgeColor}; margin: 0 0 4pt; }`,
    `    .code-block-line { font-family: ${codeFontFamily}; font-size: ${resolvedStyle.code.fontSizePt}pt; color: ${resolvedStyle.code.textColor}; line-height: 1.35; white-space: nowrap; }`,
    `    blockquote { border-left: 4px solid ${resolvedStyle.blockquote.borderColor}; background-color: ${resolvedStyle.blockquote.backgroundColor}; color: ${resolvedStyle.blockquote.textColor}; font-style: ${blockquoteFontStyle}; margin-left: 0; padding: 6pt 0 6pt 12pt; }`,
    `    hr { border: none; border-top: 1px solid ${resolvedStyle.blockquote.borderColor}; margin: 14pt 0; }`,
    '    img { max-width: 100%; height: auto; display: block; margin: 8pt auto; }',
    '    .mermaid-diagram { text-align: center; margin: 12pt 0; }',
    '    .mermaid-diagram img { width: auto; height: initial; max-width: none; }',
    '  </style>',
    '</head>',
    '<body>',
    contentHtml,
    '</body>',
    '</html>',
  ].join('\n');
}

function readPngDimensions(bytes) {
  if (bytes.length < 24) {
    return null;
  }

  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) {
      return null;
    }
  }

  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function computeMermaidDisplaySize(imageWidth, imageHeight, layoutMetrics) {
  const naturalWidth = Math.max(1, Math.round(imageWidth / MERMAID_RENDER_SCALE));
  const naturalHeight = Math.max(1, Math.round(imageHeight / MERMAID_RENDER_SCALE));

  let displayWidth = Math.min(naturalWidth, layoutMetrics.contentWidthPx);
  let displayHeight = Math.round(naturalHeight * (displayWidth / naturalWidth));

  if (displayHeight > layoutMetrics.contentHeightPx) {
    displayHeight = layoutMetrics.contentHeightPx;
    displayWidth = Math.round(naturalWidth * (displayHeight / naturalHeight));
  }

  return {
    cx: Math.round(displayWidth * EMUS_PER_PIXEL),
    cy: Math.round(displayHeight * EMUS_PER_PIXEL),
  };
}

async function patchMermaidImageExtents(docxData, layoutMetrics) {
  const zip = await JSZip.loadAsync(docxData);
  const documentXmlFile = zip.file('word/document.xml');
  const documentRelsFile = zip.file('word/_rels/document.xml.rels');
  if (!documentXmlFile) {
    return docxData;
  }

  let documentXml = await documentXmlFile.async('string');
  const documentRels = documentRelsFile ? await documentRelsFile.async('string') : '';

  const relTargetById = new Map();
  for (const match of documentRels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    relTargetById.set(match[1], match[2]);
  }

  const drawingBlocks = [...documentXml.matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)].map((match) => match[0]);

  for (const drawingBlock of drawingBlocks) {
    if (!drawingBlock.includes('descr="Mermaid diagram ')) {
      continue;
    }

    const embedMatch = drawingBlock.match(/<a:blip[^>]*r:embed="([^"]+)"/);
    if (!embedMatch) {
      continue;
    }

    const target = relTargetById.get(embedMatch[1]);
    if (!target) {
      continue;
    }

    const mediaPath = target.startsWith('media/') ? `word/${target}` : `word/media/${target.split('/').pop()}`;
    const mediaFile = zip.file(mediaPath);
    if (!mediaFile) {
      continue;
    }

    const dimensions = readPngDimensions(await mediaFile.async('uint8array'));
    if (!dimensions) {
      continue;
    }

    const { cx, cy } = computeMermaidDisplaySize(dimensions.width, dimensions.height, layoutMetrics);
    let updatedBlock = drawingBlock.replace(/<wp:extent cx="\d+" cy="\d+"\/>/, `<wp:extent cx="${cx}" cy="${cy}"/>`);
    updatedBlock = updatedBlock.replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`);
    documentXml = documentXml.replace(drawingBlock, updatedBlock);
  }

  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'uint8array' });
}

export async function generateDocx(
  htmlDocument,
  resolvedStyle = resolveDocumentStyle(),
  layoutMetrics = resolveDocumentLayout(resolvedStyle.page.marginPreset)
) {
  const docxBuffer = await htmlToDocx(htmlDocument, null, {
    table: { row: { cantSplit: false } },
    pageSize: DOCX_PAGE_SIZE,
    margins: layoutMetrics.pageMargins,
    footer: false,
    header: false,
  });

  const patchedDocx = await patchMermaidImageExtents(docxBuffer, layoutMetrics);
  const uint8 = await toUint8Array(patchedDocx);

  if (uint8.byteLength === 0) {
    throw new Error(`html-to-docx returned empty output (type: ${docxBuffer?.constructor?.name})`);
  }

  // Convert to base64 for message passing
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}
