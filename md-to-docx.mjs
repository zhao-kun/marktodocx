#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import htmlToDocx from 'html-to-docx';
import { JSDOM } from 'jsdom';
import MarkdownIt from 'markdown-it';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

const HIDDEN_CODE_BLOCK_LANGUAGES = new Set(['text']);

const FLOWCHART_WRAPPING_WIDTH = 560;
const FLOWCHART_NODE_SPACING = 60;
const FLOWCHART_RANK_SPACING = 45;
const DOCX_PAGE_SIZE = {
  width: 11906,
  height: 16838,
};
const DOCX_PAGE_MARGINS = {
  top: 1080,
  right: 900,
  bottom: 1080,
  left: 900,
};
const TWIPS_PER_PIXEL = 15;
const DOCX_CONTENT_WIDTH_PX = Math.floor(
  (DOCX_PAGE_SIZE.width - DOCX_PAGE_MARGINS.left - DOCX_PAGE_MARGINS.right) / TWIPS_PER_PIXEL
);

const IMAGE_EXTENSIONS = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

function printUsage() {
  console.log([
    'Usage:',
    '  node md-to-docx.mjs <input.md> [output.docx]',
    '',
    'Examples:',
    '  node md-to-docx.mjs zookeeper-accident-analysis-report-zh.md',
    '  node md-to-docx.mjs input.md output.docx',
  ].join('\n'));
}

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  if (argv.includes('--help') || argv.includes('-h') || positional.length === 0) {
    printUsage();
    process.exit(positional.length === 0 ? 1 : 0);
  }

  const [inputArg, outputArg] = positional;
  return {
    inputPath: path.resolve(process.cwd(), inputArg),
    outputPath: outputArg
      ? path.resolve(process.cwd(), outputArg)
      : path.resolve(
          process.cwd(),
          `${path.basename(inputArg, path.extname(inputArg))}.docx`
        ),
  };
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function preserveCodeWhitespace(line) {
  return escapeHtml(line)
    .replaceAll('\t', '&nbsp;&nbsp;&nbsp;&nbsp;')
    .replaceAll(' ', '&nbsp;');
}

function preserveInlineCodeWhitespace(text) {
  return escapeHtml(text)
    .replaceAll('\t', '&nbsp;&nbsp;&nbsp;&nbsp;')
    .replaceAll(' ', '&nbsp;');
}

function renderInlineCodeHtml(content) {
  return `<i><span class="inline-code" style="background-color: #EFEFEF;">${preserveInlineCodeWhitespace(content)}</span></i>`;
}

function renderCodeBlockHtml(content, language = '') {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const trailingEmptyLine = lines.length > 1 && lines.at(-1) === '';
  const visibleLines = trailingEmptyLine ? lines.slice(0, -1) : lines;
  const renderedLines = (visibleLines.length === 0 ? [''] : visibleLines)
    .map((line) => `<div class="code-block-line">${line === '' ? '&nbsp;' : preserveCodeWhitespace(line)}</div>`)
    .join('');
  const showLanguageBadge = language && !HIDDEN_CODE_BLOCK_LANGUAGES.has(language.toLowerCase());
  const languageBadge = showLanguageBadge
    ? `<div class="code-block-language">${escapeHtml(language)}</div>`
    : '';

  return [
    '<table class="code-block-table" role="presentation" width="100%" style="width: 100%; border-collapse: collapse; table-layout: fixed;">',
    '  <tr>',
    '    <td class="code-block-cell" style="border: 1px solid #d1d5db; background-color: #F0F0F0; padding: 8pt 10pt;">',
    languageBadge,
    renderedLines,
    '    </td>',
    '  </tr>',
    '</table>',
  ].join('\n');
}

async function renderMermaidToImageTag(code, index) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-docx-mermaid-'));
  const inputFile = path.join(tempDir, `diagram-${index + 1}.mmd`);
  const outputFile = path.join(tempDir, `diagram-${index + 1}.png`);
  const configFile = path.join(tempDir, 'mermaid-config.json');
  const puppeteerConfigFile = path.join(tempDir, 'puppeteer-config.json');

  const mermaidConfig = {
    theme: 'default',
    securityLevel: 'loose',
    markdownAutoWrap: true,
    fontFamily:
      'Noto Sans CJK SC, Microsoft YaHei, PingFang SC, Helvetica, Arial, sans-serif',
    flowchart: {
      htmlLabels: true,
      curve: 'linear',
      wrappingWidth: FLOWCHART_WRAPPING_WIDTH,
      nodeSpacing: FLOWCHART_NODE_SPACING,
      rankSpacing: FLOWCHART_RANK_SPACING,
      padding: 10,
    },
  };

  const puppeteerConfig = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  try {
    await Promise.all([
      fs.writeFile(inputFile, code, 'utf8'),
      fs.writeFile(configFile, JSON.stringify(mermaidConfig), 'utf8'),
      fs.writeFile(puppeteerConfigFile, JSON.stringify(puppeteerConfig), 'utf8'),
    ]);

    const mmdcPath = path.resolve(process.cwd(), 'node_modules/.bin/mmdc');
    await execFileAsync(mmdcPath, [
      '-i',
      inputFile,
      '-o',
      outputFile,
      '-t',
      'default',
      '-b',
      'transparent',
      '--scale',
      '2',
      '--configFile',
      configFile,
      '--puppeteerConfigFile',
      puppeteerConfigFile,
    ]);

    const pngBuffer = await fs.readFile(outputFile);
    const trimmedPngBuffer = await sharp(pngBuffer)
      .trim()
      .png({ compressionLevel: 9 })
      .toBuffer();
    const metadata = await sharp(trimmedPngBuffer).metadata();
    const dataUri = `data:image/png;base64,${trimmedPngBuffer.toString('base64')}`;
    const width = Math.min(metadata.width || 960, 960);

    return [
      '<div class="mermaid-diagram">',
      `  <img src="${dataUri}" alt="Mermaid diagram ${index + 1}" width="${width}" />`,
      '</div>',
    ].join('\n');
  } catch (error) {
    const message = error.stderr || error.stdout || error.message;
    throw new Error(`Failed to render Mermaid block #${index + 1}: ${message}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
  });

  const defaultFenceRenderer =
    md.renderer.rules.fence ||
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/)[0];

    if (language === 'mermaid') {
      if (!env.renderedMermaid || env.renderedMermaid.length === 0) {
        throw new Error('Mermaid renderer queue is empty.');
      }

      return `${env.renderedMermaid.shift()}\n`;
    }

    return `${renderCodeBlockHtml(token.content, language)}\n`;
  };

  md.renderer.rules.code_block = (tokens, idx) => {
    const token = tokens[idx];
    return `${renderCodeBlockHtml(token.content)}\n`;
  };

  md.renderer.rules.code_inline = (tokens, idx) => {
    const token = tokens[idx];
    return renderInlineCodeHtml(token.content);
  };

  return md;
}

async function renderMermaidBlocks(markdown, md) {
  const tokens = md.parse(markdown, {});
  const mermaidBlocks = tokens
    .filter((token) => token.type === 'fence')
    .filter((token) => token.info.trim().split(/\s+/)[0] === 'mermaid')
    .map((token) => token.content);

  const rendered = [];
  for (let index = 0; index < mermaidBlocks.length; index += 1) {
    rendered.push(await renderMermaidToImageTag(mermaidBlocks[index], index));
  }

  return rendered;
}

async function inlineLocalImages(html, baseDir) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const images = [...dom.window.document.querySelectorAll('img')];

  for (const image of images) {
    const src = image.getAttribute('src');
    if (!src || src.startsWith('data:') || /^[a-z]+:/i.test(src)) {
      continue;
    }

    const decodedSrc = decodeURIComponent(src);
    const absolutePath = path.resolve(baseDir, decodedSrc);
    const extension = path.extname(absolutePath).toLowerCase();
    const mimeType = IMAGE_EXTENSIONS.get(extension);

    if (!mimeType) {
      throw new Error(`Unsupported image format: ${absolutePath}`);
    }

    const fileBuffer = await fs.readFile(absolutePath);
    image.setAttribute('src', `data:${mimeType};base64,${fileBuffer.toString('base64')}`);
  }

  return dom.window.document.body.innerHTML;
}

function getTableCellSpan(cell) {
  const colspan = Number.parseInt(cell.getAttribute('colspan') || '1', 10);
  return Number.isFinite(colspan) && colspan > 0 ? colspan : 1;
}

function getTableColumnCount(table) {
  const rows = [...table.querySelectorAll('tr')];
  return Math.max(
    1,
    ...rows.map((row) => [...row.children].reduce((sum, cell) => sum + getTableCellSpan(cell), 0))
  );
}

function normalizeTables(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const tables = [...dom.window.document.querySelectorAll('table')]
    .filter((table) => !table.classList.contains('code-block-table'));

  for (const table of tables) {
    const columnCount = getTableColumnCount(table);
    table.setAttribute('width', String(DOCX_CONTENT_WIDTH_PX));
    table.style.width = `${DOCX_CONTENT_WIDTH_PX}px`;
    table.style.maxWidth = `${DOCX_CONTENT_WIDTH_PX}px`;
    table.style.tableLayout = 'fixed';
    table.style.borderCollapse = 'collapse';

    const cells = [...table.querySelectorAll('th, td')];
    for (const cell of cells) {
      const span = getTableCellSpan(cell);
      const cellWidthPx = Math.max(
        48,
        Math.floor((DOCX_CONTENT_WIDTH_PX * span) / columnCount)
      );

      cell.setAttribute('width', String(cellWidthPx));
      cell.style.width = `${cellWidthPx}px`;
      cell.style.maxWidth = `${cellWidthPx}px`;
      cell.style.overflowWrap = 'anywhere';
      cell.style.wordBreak = 'break-word';
      cell.style.whiteSpace = 'normal';

        if (cell.tagName === 'TH') {
          cell.style.backgroundColor = '#595959';
          cell.style.color = '#FFFFFF';
          cell.style.fontWeight = '700';
        }
    }
  }

    const blockquotes = [...dom.window.document.querySelectorAll('blockquote')];
    for (const blockquote of blockquotes) {
      blockquote.style.display = 'block';
      blockquote.style.backgroundColor = '#EFEFEF';
      blockquote.style.color = '#334155';
      blockquote.style.fontStyle = 'italic';
      blockquote.style.borderLeft = '4px solid #cbd5e1';
      blockquote.style.marginLeft = '0';
      blockquote.style.padding = '6pt 0 6pt 12pt';
    }

  return dom.window.document.body.innerHTML;
}

function buildHtmlDocument(contentHtml, sourcePath) {
  const sourceUri = pathToFileURL(sourcePath).href;

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8" />',
    `  <base href="${sourceUri}" />`,
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
    '  </style>',
    '</head>',
    '<body>',
    contentHtml,
    '</body>',
    '</html>',
  ].join('\n');
}

async function convertMarkdownToDocx(inputPath, outputPath) {
  const markdown = await fs.readFile(inputPath, 'utf8');
  const baseDir = path.dirname(inputPath);
  const md = createMarkdownRenderer();
  const renderedMermaid = await renderMermaidBlocks(markdown, md);
  const htmlBody = md.render(markdown, { renderedMermaid: [...renderedMermaid] });
  const inlinedHtmlBody = await inlineLocalImages(htmlBody, baseDir);
  const normalizedHtmlBody = normalizeTables(inlinedHtmlBody);
  const htmlDocument = buildHtmlDocument(normalizedHtmlBody, inputPath);

  const docxBuffer = await htmlToDocx(htmlDocument, null, {
    table: {
      row: {
        cantSplit: true,
      },
    },
    pageSize: DOCX_PAGE_SIZE,
    margins: DOCX_PAGE_MARGINS,
    footer: false,
    header: false,
  });

  await fs.writeFile(outputPath, docxBuffer);
}

async function main() {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2));
  await convertMarkdownToDocx(inputPath, outputPath);
  console.log(`DOCX written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});