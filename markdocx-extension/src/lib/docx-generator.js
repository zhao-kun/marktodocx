import JSZip from 'jszip';
import htmlToDocx from 'html-to-docx';
import { DOCX_PAGE_SIZE, DOCX_PAGE_MARGINS } from './constants.js';

const EMUS_PER_PIXEL = 9525;

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

export function buildHtmlDocument(contentHtml) {
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8" />',
    '  <style>',
    '    body { font-family: "Calibri", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; font-size: 11pt; line-height: 1.5; color: #111827; }',
    '    h1, h2, h3, h4, h5, h6 { color: #0f172a; page-break-after: avoid; }',
    '    h1 { font-size: 20pt; margin: 0 0 12pt; }',
    '    h2 { font-size: 16pt; margin: 18pt 0 10pt; }',
    '    h3 { font-size: 13pt; margin: 14pt 0 8pt; }',
    '    p, ul, ol, blockquote, pre, table { margin: 0 0 10pt; }',
    '    ul, ol { padding-left: 20pt; }',
    '    li { margin: 0 0 4pt; }',
    '    table { width: 100%; border-collapse: collapse; table-layout: fixed; }',
    '    th, td { border: 1px solid #4b5563; padding: 6pt 8pt; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; word-break: break-word; }',
    '    th { background-color: #595959; color: #FFFFFF; font-weight: 700; }',
    '    th code, td code { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }',
    '    code { font-family: "Cascadia Code", "Consolas", monospace; background-color: #EFEFEF; padding: 1pt 3pt; border-radius: 2pt; font-style: italic; }',
    '    pre { background-color: #F0F0F0; border: 1px solid #d1d5db; padding: 10pt; overflow-wrap: anywhere; white-space: pre-wrap; }',
    '    pre code { background: transparent; padding: 0; }',
    '    .code-block-table { width: 100%; border-collapse: collapse; margin: 0 0 10pt; table-layout: fixed; }',
    '    .code-block-table td.code-block-cell { border: 1px solid #d1d5db; background-color: #F0F0F0; padding: 8pt 10pt; }',
    '    .inline-code { background-color: #EFEFEF; font-style: italic; }',
    '    .code-block-language { font-family: "Cascadia Code", "Consolas", monospace; font-size: 9pt; color: #475569; margin: 0 0 4pt; }',
    '    .code-block-line { font-family: "Cascadia Code", "Consolas", monospace; font-size: 10pt; line-height: 1.35; white-space: nowrap; }',
    '    blockquote { border-left: 4px solid #cbd5e1; background-color: #EFEFEF; color: #334155; font-style: italic; margin-left: 0; padding: 6pt 0 6pt 12pt; }',
    '    hr { border: none; border-top: 1px solid #cbd5e1; margin: 14pt 0; }',
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

function collectMermaidExtents(htmlDocument) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlDocument, 'text/html');
  const mermaidImages = [...doc.querySelectorAll('.mermaid-diagram img')];

  return mermaidImages.map((image) => ({
    descr: image.getAttribute('alt') || '',
    cx: Math.round(Number(image.getAttribute('width') || '0') * EMUS_PER_PIXEL),
    cy: Math.round(Number(image.getAttribute('height') || '0') * EMUS_PER_PIXEL),
  })).filter((image) => image.descr && image.cx > 0 && image.cy > 0);
}

function patchDrawingExtent(block, image) {
  let updated = block.replace(/<wp:extent cx="\d+" cy="\d+"\/>/, `<wp:extent cx="${image.cx}" cy="${image.cy}"/>`);
  updated = updated.replace(/<a:ext cx="\d+" cy="\d+"\/>/, `<a:ext cx="${image.cx}" cy="${image.cy}"/>`);
  return updated;
}

async function patchMermaidImageExtents(docxData, mermaidImages) {
  if (mermaidImages.length === 0) {
    return docxData;
  }

  const zip = await JSZip.loadAsync(docxData);
  const documentXmlFile = zip.file('word/document.xml');
  if (!documentXmlFile) {
    return docxData;
  }

  let documentXml = await documentXmlFile.async('string');

  for (const image of mermaidImages) {
    const escapedDescr = image.descr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const drawingPattern = new RegExp(`(<w:drawing>[\\s\\S]*?<pic:cNvPr[^>]*descr="${escapedDescr}"[^>]*\/>[\\s\\S]*?<wp:extent cx=")\\d+(" cy=")\\d+("\\/>[\\s\\S]*?<a:ext cx=")\\d+(" cy=")\\d+("\\/[\\s\\S]*?<\\/w:drawing>)`);

    documentXml = documentXml.replace(drawingPattern, (match, wpPrefix, wpCyPrefix, wpSuffix, aPrefix, aCyPrefix, aSuffix) => {
      return `${wpPrefix}${image.cx}${wpCyPrefix}${image.cy}${wpSuffix}${aPrefix}${image.cx}${aCyPrefix}${image.cy}${aSuffix}`;
    });
  }

  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'uint8array' });
}

export async function generateDocx(htmlDocument) {
  const mermaidImages = collectMermaidExtents(htmlDocument);

  const docxBuffer = await htmlToDocx(htmlDocument, null, {
    table: { row: { cantSplit: false } },
    pageSize: DOCX_PAGE_SIZE,
    margins: DOCX_PAGE_MARGINS,
    footer: false,
    header: false,
  });

  const patchedDocx = await patchMermaidImageExtents(docxBuffer, mermaidImages);
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
