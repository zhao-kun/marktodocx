import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildImageMapFromHtml,
  convertMarkdownFileInNode,
  convertMarkdownInNode,
  createJsdomDomAdapter,
  createNodeRuntime,
  normalizeBaseDirForCore,
  parseStyleAssignments,
  parseStyleJsonInput,
  resolveNodeStyleOptions,
} from '@markdocx/runtime-node';

const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=';

test('runtime-node exports an explicit jsdom-backed runtime adapter', () => {
  const runtime = createNodeRuntime();

  assert.equal(typeof createJsdomDomAdapter, 'function');
  assert.equal(typeof runtime.dom.parseHtml, 'function');
});

test('runtime-node builds a filesystem image map keyed for core resolution', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdocx-runtime-node-'));
  const imagePath = path.join(tempDir, 'diagram.png');
  await fs.writeFile(imagePath, Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'));

  try {
    const runtime = createNodeRuntime();
    const imageMap = await buildImageMapFromHtml('<p><img src="./diagram.png" /></p>', tempDir, runtime);
    const normalizedPath = normalizeBaseDirForCore(path.join(tempDir, 'diagram.png'));

    assert.equal(Object.keys(imageMap).length, 1);
    assert.equal(typeof imageMap[normalizedPath], 'string');
    assert.equal(imageMap[normalizedPath].startsWith('data:image/png;base64,'), true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime-node converts non-mermaid markdown through the explicit runtime package', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdocx-runtime-node-'));
  const imagePath = path.join(tempDir, 'diagram.png');
  await fs.writeFile(imagePath, Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'));

  try {
    const bytes = await convertMarkdownInNode({
      markdown: '# Runtime Node\n\n![diagram](./diagram.png)\n',
      baseDir: tempDir,
      runtime: createNodeRuntime(),
    });

    assert.equal(bytes instanceof Uint8Array, true);
    assert.equal(bytes.byteLength > 0, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime-node fails fast on Mermaid until an explicit mermaid adapter is provided', async () => {
  await assert.rejects(
    () => convertMarkdownInNode({
      markdown: '```mermaid\ngraph TD\n  A-->B\n```\n',
      baseDir: process.cwd(),
      runtime: createNodeRuntime(),
    }),
    /requires an explicit renderMermaid adapter/
  );
});

test('runtime-node can write a DOCX file through the file conversion entry point', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdocx-runtime-node-'));
  const markdownPath = path.join(tempDir, 'sample.md');
  await fs.writeFile(markdownPath, '# File Conversion\n\nBody text.\n', 'utf8');

  try {
    const result = await convertMarkdownFileInNode({
      inputPath: markdownPath,
      runtime: createNodeRuntime(),
    });

    const outputStat = await fs.stat(result.outputPath);
    assert.equal(result.bytes instanceof Uint8Array, true);
    assert.equal(outputStat.size > 0, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('runtime-node parses all documented styleSet dotted paths into overrides', () => {
  const overrides = parseStyleAssignments([
    'body.fontFamily=Georgia',
    'body.fontSizePt=12',
    'body.lineHeight=1.55',
    'body.color=#2F3A45',
    'headings.fontFamily=Cambria',
    'headings.color=#1B365D',
    'tables.borderColor=#C7D1DB',
    'tables.headerBackgroundColor=#EAF1F7',
    'tables.headerTextColor=#1B365D',
    'code.fontFamily=Cascadia Code',
    'code.fontSizePt=10',
    'code.syntaxTheme=dark',
    'code.inlineBackgroundColor=#EEF2F6',
    'code.inlineItalic=false',
    'code.blockBackgroundColor=#0F1720',
    'code.blockBorderColor=#243447',
    'code.languageBadgeColor=#5B708B',
    'blockquote.backgroundColor=#F6F8FA',
    'blockquote.textColor=#475467',
    'blockquote.borderColor=#98A2B3',
    'blockquote.italic=true',
    'page.marginPreset=wide',
  ].join(';'));

  assert.deepEqual(overrides, {
    body: {
      fontFamily: 'Georgia',
      fontSizePt: 12,
      lineHeight: 1.55,
      color: '#2F3A45',
    },
    headings: {
      fontFamily: 'Cambria',
      color: '#1B365D',
    },
    tables: {
      borderColor: '#C7D1DB',
      headerBackgroundColor: '#EAF1F7',
      headerTextColor: '#1B365D',
    },
    code: {
      fontFamily: 'Cascadia Code',
      fontSizePt: 10,
      syntaxTheme: 'dark',
      inlineBackgroundColor: '#EEF2F6',
      inlineItalic: false,
      blockBackgroundColor: '#0F1720',
      blockBorderColor: '#243447',
      languageBadgeColor: '#5B708B',
    },
    blockquote: {
      backgroundColor: '#F6F8FA',
      textColor: '#475467',
      borderColor: '#98A2B3',
      italic: true,
    },
    page: {
      marginPreset: 'wide',
    },
  });
});

test('runtime-node accepts the documented styleJson example file and shorthand JSON form', async () => {
  const examplePath = path.resolve(process.cwd(), 'docs', 'style-options.example.json');

  const parsedExample = await parseStyleJsonInput(examplePath);
  assert.equal(parsedExample.preset, 'report');
  assert.equal(parsedExample.overrides.body.fontFamily, 'Georgia');
  assert.equal(parsedExample.overrides.code.syntaxTheme, 'dark');

  const shorthand = await parseStyleJsonInput(JSON.stringify({
    body: { fontSizePt: 12 },
    page: { marginPreset: 'wide' },
  }));

  assert.deepEqual(shorthand, {
    overrides: {
      body: { fontSizePt: 12 },
      page: { marginPreset: 'wide' },
    },
  });
});

test('runtime-node resolves the documented example file and styleSet overrides together', async () => {
  const styleOptions = await resolveNodeStyleOptions({
    cwd: process.cwd(),
    styleJson: './docs/style-options.example.json',
    styleSet: [
      'body.fontSizePt=12',
      'blockquote.italic=false',
      'page.marginPreset=compact',
    ],
  });

  assert.equal(styleOptions.preset, 'report');
  assert.equal(styleOptions.overrides.body.fontFamily, 'Georgia');
  assert.equal(styleOptions.overrides.body.fontSizePt, 12);
  assert.equal(styleOptions.overrides.blockquote.italic, false);
  assert.equal(styleOptions.overrides.page.marginPreset, 'compact');
});
