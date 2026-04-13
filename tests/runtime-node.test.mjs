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