import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { JSDOM } from 'jsdom';

import {
  BODY_FONT_FAMILY_OPTIONS,
  CODE_FONT_FAMILY_OPTIONS,
  DEFAULT_STYLE_OPTIONS,
  DOCUMENT_MARGIN_PRESET_ORDER,
  DOCUMENT_STYLE_PRESET_ORDER,
  MERMAID_DOCX_DESCRIPTION_PREFIX,
  STYLE_SYNTAX_THEME_OPTIONS,
  assertRuntimeContracts,
  assertValidStyleOptions,
  buildHtmlDocument,
  createMarkdownRenderer,
  extractMermaidBlocks,
  generateDocx,
  highlightCode,
  inlineLocalImages,
  normalizeStyleOptions,
  normalizeTables,
  resolveDocumentLayout,
  resolveDocumentStyle,
} from '@markdocx/core';

import { generateDocx as generateDocxForExtension } from '../markdocx-extension/src/lib/docx-generator.js';
import { resolveDocumentStyle as resolveDocumentStyleFromShim } from '../markdocx-extension/src/lib/document-style.js';

function createJsdomRuntime() {
  const baseDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  return {
    dom: {
      parseHtml(html) {
        return new JSDOM(html).window.document;
      },
      Node: baseDom.window.Node,
      NodeFilter: baseDom.window.NodeFilter,
    },
  };
}

test('core package exports resolve style presets and layout presets consistently', () => {
  const defaultStyle = resolveDocumentStyle(DEFAULT_STYLE_OPTIONS);
  const minimalStyle = resolveDocumentStyle({ preset: 'minimal', overrides: {} });
  const reportStyle = resolveDocumentStyle({ preset: 'report', overrides: {} });

  assert.equal(defaultStyle.preset, 'default');
  assert.equal(minimalStyle.preset, 'minimal');
  assert.equal(reportStyle.preset, 'report');
  assert.equal(DOCUMENT_STYLE_PRESET_ORDER.includes(reportStyle.preset), true);
  assert.equal(DOCUMENT_MARGIN_PRESET_ORDER.includes(resolveDocumentLayout(defaultStyle.page.marginPreset).marginPreset), true);
  assert.equal(minimalStyle.page.marginPreset, 'compact');
  assert.equal(reportStyle.page.marginPreset, 'wide');
});

test('normalizeStyleOptions canonicalizes ordering and assertValidStyleOptions rejects unsupported fields', () => {
  const normalized = normalizeStyleOptions({
    overrides: {
      code: {
        fontSizePt: 10,
        blockBackgroundColor: '#000000',
      },
    },
    preset: 'minimal',
  });

  assert.deepEqual(normalized, {
    overrides: {
      code: {
        blockBackgroundColor: '#000000',
        fontSizePt: 10,
      },
    },
    preset: 'minimal',
  });

  assert.doesNotThrow(() => assertValidStyleOptions(DEFAULT_STYLE_OPTIONS));
  assert.throws(() => assertValidStyleOptions({ preset: 'default', overrides: {}, extra: true }), /not a supported field/);
  assert.throws(() => assertValidStyleOptions({ preset: 'default', overrides: { code: { nope: true } } }), /not a supported field/);
  assert.throws(() => assertValidStyleOptions({ preset: 'bogus', overrides: {} }), /must be one of/);
});

test('runtime contract assertions accept valid adapters and reject invalid ones', () => {
  assert.doesNotThrow(() => {
    assertRuntimeContracts({
      dom: { parseHtml: () => ({}), Node: class {}, NodeFilter: {} },
      images: { inlineImages: (html) => html },
      mermaid: { render: async () => ({ pngDataUri: 'data:image/png;base64,AA==', displayWidth: 1, displayHeight: 1 }) },
    });
  });

  assert.throws(() => {
    assertRuntimeContracts({ dom: { parseHtml: 'nope' } });
  }, /runtime\.dom\.parseHtml must be a function/);
});

test('inlineLocalImages and normalizeTables work with a jsdom runtime adapter', () => {
  const runtime = createJsdomRuntime();
  const resolvedStyle = resolveDocumentStyle({ preset: 'minimal', overrides: {} });
  const layout = resolveDocumentLayout(resolvedStyle.page.marginPreset);
  const html = '<p><img src="../images/diagram.png" /></p><blockquote><p>line 1\nline 2</p></blockquote><table><tr><th>A</th><td>B</td></tr></table>';

  const inlined = inlineLocalImages(html, { 'docs/images/diagram.png': 'data:image/png;base64,AA==' }, 'docs/guides', runtime);
  const normalized = normalizeTables(inlined, resolvedStyle, layout, runtime);

  assert.equal(inlined.includes('data:image/png;base64,AA=='), true);
  assert.equal(normalized.includes('blockquote-table'), true);
  assert.equal(normalized.includes(String(layout.contentWidthPx)), true);
  assert.equal(normalized.includes('background-color:'), true);
  assert.equal(normalized.includes('word-break: break-word'), true);
});

test('markdown renderer utilities highlight code and extract Mermaid blocks', () => {
  const renderer = createMarkdownRenderer(resolveDocumentStyle(DEFAULT_STYLE_OPTIONS));
  const markdown = ['```mermaid', 'graph TD', '  A-->B', '```', '', '```js', 'const answer = 42;', '```'].join('\n');
  const highlighted = highlightCode('const answer = 42;\n', 'javascript');
  const mermaidBlocks = extractMermaidBlocks(markdown, renderer);
  const rendered = renderer.render(markdown, { renderedMermaid: ['<div class="mermaid-diagram"></div>'] });

  assert.equal(Array.isArray(highlighted), true);
  assert.equal(highlighted[0].includes('color:'), true);
  assert.deepEqual(mermaidBlocks, ['graph TD\n  A-->B\n']);
  assert.equal(rendered.includes('mermaid-diagram'), true);
});

test('buildHtmlDocument and generateDocx return runtime-neutral bytes while the extension shim still returns base64', async () => {
  const resolvedStyle = resolveDocumentStyle(DEFAULT_STYLE_OPTIONS);
  const htmlDocument = buildHtmlDocument(`<p>${MERMAID_DOCX_DESCRIPTION_PREFIX}smoke</p>`, resolvedStyle);

  const bytes = await generateDocx(htmlDocument, resolvedStyle);
  const base64 = await generateDocxForExtension(htmlDocument, resolvedStyle);

  assert.equal(bytes instanceof Uint8Array, true);
  assert.equal(bytes.byteLength > 0, true);
  assert.equal(typeof base64, 'string');
  assert.equal(base64.length > 0, true);
});

test('extension shims still expose the extracted core surface', () => {
  const resolvedFromShim = resolveDocumentStyleFromShim(DEFAULT_STYLE_OPTIONS);
  const resolvedFromCore = resolveDocumentStyle(DEFAULT_STYLE_OPTIONS);

  assert.deepEqual(resolvedFromShim, resolvedFromCore);
});

test('shared styleOptions schema stays aligned with the exported code enums', async () => {
  const schemaPath = new URL('../packages/core/src/style/style-options.schema.json', import.meta.url);
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

  assert.deepEqual(schema.properties.preset.enum, DOCUMENT_STYLE_PRESET_ORDER);
  assert.deepEqual(schema.$defs.bodyFontFamily.enum, [...new Set([...BODY_FONT_FAMILY_OPTIONS, ...CODE_FONT_FAMILY_OPTIONS])]);
  assert.deepEqual(schema.$defs.codeFontFamily.enum, CODE_FONT_FAMILY_OPTIONS);
  assert.deepEqual(schema.$defs.codeStyle.properties.syntaxTheme.enum, STYLE_SYNTAX_THEME_OPTIONS);
});