import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

import { JSDOM } from 'jsdom';

import {
  BODY_FONT_FAMILY_OPTIONS,
  CODE_FONT_FAMILY_OPTIONS,
  DEFAULT_STYLE_OPTIONS,
  DOCUMENT_MARGIN_PRESET_ORDER,
  DOCUMENT_STYLE_PRESET_ORDER,
  MERMAID_DOCX_DESCRIPTION_PREFIX,
  STYLE_SYNTAX_THEME_OPTIONS,
  assertCanonicalRenderedMermaidFragment,
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

const execFile = promisify(execFileCallback);

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

function createDomParserRuntime() {
  const baseDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  return {
    dom: {
      parseHtml(html) {
        return new baseDom.window.DOMParser().parseFromString(html, 'text/html');
      },
      Node: baseDom.window.Node,
      NodeFilter: baseDom.window.NodeFilter,
    },
  };
}

async function runNodeEval(script) {
  try {
    const result = await execFile(process.execPath, ['--input-type=module', '--eval', script]);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout,
      stderr: error.stderr,
      message: error.message,
    };
  }
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
    });
  });

  assert.throws(() => {
    assertRuntimeContracts({ dom: { parseHtml: 'nope' } });
  }, /runtime\.dom\.parseHtml must be a function/);

  assert.throws(() => {
    assertRuntimeContracts({ dom: { parseHtml: () => ({}), Node: 'nope' } });
  }, /runtime\.dom\.Node must be a constructor/);
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

test('html normalization stays stable across supported DOM adapter implementations', () => {
  const runtimes = [createJsdomRuntime(), createDomParserRuntime()];
  const resolvedStyle = resolveDocumentStyle({ preset: 'minimal', overrides: {} });
  const layout = resolveDocumentLayout(resolvedStyle.page.marginPreset);
  const html = '<p><img src="../images/diagram.png" /></p><blockquote><p>line 1\nline 2</p></blockquote><table><tr><th>A</th><td>B</td></tr></table>';

  const outputs = runtimes.map((runtime) => {
    const inlined = inlineLocalImages(html, { 'docs/images/diagram.png': 'data:image/png;base64,AA==' }, 'docs/guides', runtime);
    return normalizeTables(inlined, resolvedStyle, layout, runtime);
  });

  assert.equal(outputs[0], outputs[1]);
});

test('markdown renderer utilities highlight code, extract Mermaid blocks, and enforce canonical Mermaid fragments', () => {
  const renderer = createMarkdownRenderer(resolveDocumentStyle(DEFAULT_STYLE_OPTIONS));
  const markdown = ['```mermaid', 'graph TD', '  A-->B', '```', '', '```js', 'const answer = 42;', '```'].join('\n');
  const highlighted = highlightCode('const answer = 42;\n', 'javascript');
  const mermaidBlocks = extractMermaidBlocks(markdown, renderer);
  const canonicalFragment = '<div class="mermaid-diagram">\n  <img src="data:image/png;base64,AA==" alt="Mermaid diagram 1" width="1" height="1" style="width: 1px; height: 1px;" />\n</div>';
  const rendered = renderer.render(markdown, { renderedMermaid: [canonicalFragment] });

  assert.equal(Array.isArray(highlighted), true);
  assert.equal(highlighted[0].includes('color:'), true);
  assert.deepEqual(mermaidBlocks, ['graph TD\n  A-->B\n']);
  assert.equal(rendered.includes('mermaid-diagram'), true);
  assert.equal(assertCanonicalRenderedMermaidFragment(canonicalFragment, 0), canonicalFragment);

  assert.throws(() => {
    renderer.render(markdown, { renderedMermaid: ['<img src="data:image/png;base64,AA==" alt="Mermaid diagram 1" />'] });
  }, /canonical <div class="mermaid-diagram"> wrapper/);
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

  assert.deepEqual(schema.required ?? [], []);
  assert.deepEqual(schema.properties.preset.enum, DOCUMENT_STYLE_PRESET_ORDER);
  assert.deepEqual(schema.$defs.textFontFamily.enum, [...new Set([...BODY_FONT_FAMILY_OPTIONS, ...CODE_FONT_FAMILY_OPTIONS])]);
  assert.deepEqual(schema.$defs.codeFontFamily.enum, CODE_FONT_FAMILY_OPTIONS);
  assert.deepEqual(schema.$defs.codeStyle.properties.syntaxTheme.enum, STYLE_SYNTAX_THEME_OPTIONS);
  assert.equal(schema.properties.overrides.type, 'object');
});

test('docx generator requires Buffer on the DOCX execution path in browser-like environments', async () => {
  const moduleHref = new URL('../packages/core/src/docx/docx-generator.js', import.meta.url).href;
  const html = '<!DOCTYPE html><html><body><p>x</p></body></html>';

  const missingBuffer = await runNodeEval(`
    delete globalThis.Buffer;
    const mod = await import(${JSON.stringify(moduleHref)});
    await mod.generateDocx(${JSON.stringify(html)});
  `);
  assert.equal(missingBuffer.ok, false);
  assert.match(`${missingBuffer.stderr || ''}${missingBuffer.message || ''}`, /Buffer|html-to-docx|loaded zip file/i);

  const restoredBuffer = await runNodeEval(`
    delete globalThis.Buffer;
    globalThis.Buffer = (await import('node:buffer')).Buffer;
    const mod = await import(${JSON.stringify(moduleHref)});
    await mod.generateDocx(${JSON.stringify(html)});
    process.stdout.write('ok');
  `);
  assert.equal(restoredBuffer.ok, true);
  assert.equal(restoredBuffer.stdout, 'ok');
});
