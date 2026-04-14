import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

import JSZip from 'jszip';

import { convertMarkdownInNode } from '@markdocx/runtime-node';

const require = createRequire(import.meta.url);
const {
  collectWorkspaceImageMap,
  convertMarkdownToDocx,
  getMarkdownRelativeDir,
  resolveVsCodeStyleOptionsFromValues,
} = require('../apps/vscode-extension/src/convert.js');

function createFakeUri(filePath) {
  return {
    scheme: 'file',
    fsPath: filePath,
  };
}

function createFakeVscodeApi({ workspaceRoot, savePath, logs }) {
  return {
    Uri: {
      file: (filePath) => createFakeUri(filePath),
    },
    ViewColumn: { Beside: 'beside' },
    ProgressLocation: { Notification: 'notification' },
    workspace: {
      getConfiguration() {
        return {
          get(key) {
            if (key === 'stylePreset') return 'default';
            if (key === 'marginPreset') return '';
            if (key === 'styleJson') return '';
            if (key === 'styleSet') return [];
            return undefined;
          },
        };
      },
      getWorkspaceFolder() {
        return { uri: createFakeUri(workspaceRoot) };
      },
    },
    window: {
      activeTextEditor: undefined,
      showErrorMessage(message) {
        logs.errors.push(message);
      },
      showInformationMessage(message) {
        logs.info.push(message);
        return Promise.resolve(undefined);
      },
      showSaveDialog() {
        return Promise.resolve(createFakeUri(savePath));
      },
      withProgress(_options, task) {
        const progress = {
          report(update) {
            logs.progress.push(update?.message);
          },
        };
        return task(progress);
      },
    },
    commands: {
      executeCommand() {},
    },
  };
}

function createNodeWebviewHost() {
  return {
    async convert({ markdown, styleOptions, onProgress }) {
      const baseDir = path.resolve(process.cwd(), 'test-markdown');
      return convertMarkdownInNode({
        markdown,
        baseDir,
        styleOptions,
        onProgress,
      });
    },
  };
}

test('VSCode helper collects image data relative to the workspace root', async () => {
  const fixtureRoot = path.resolve(process.cwd(), 'test-markdown');
  const imageMap = await collectWorkspaceImageMap(fixtureRoot);

  assert.equal(typeof imageMap['images/test-image.png'], 'string');
  assert.equal(imageMap['images/test-image.png'].startsWith('data:image/png;base64,'), true);
});

test('VSCode helper computes markdown-relative directories against the workspace root', () => {
  const fixtureRoot = path.resolve(process.cwd(), 'test-markdown');

  assert.equal(getMarkdownRelativeDir(fixtureRoot, path.join(fixtureRoot, 'test.md')), '');
  assert.equal(
    getMarkdownRelativeDir(fixtureRoot, path.join(fixtureRoot, 'nested', 'report.md')),
    'nested'
  );
});

test('VSCode style mapping resolves through the shared styleOptions parser', async () => {
  const styleOptions = await resolveVsCodeStyleOptionsFromValues(
    {
      stylePreset: 'minimal',
      marginPreset: 'wide',
      styleJson: JSON.stringify({
        overrides: {
          blockquote: {
            italic: false,
          },
        },
      }),
      styleSet: ['body.fontSizePt=12'],
    },
    { cwd: process.cwd() }
  );

  assert.equal(styleOptions.preset, 'minimal');
  assert.equal(styleOptions.overrides.page.marginPreset, 'wide');
  assert.equal(styleOptions.overrides.blockquote.italic, false);
  assert.equal(styleOptions.overrides.body.fontSizePt, 12);
});

test('VSCode convert flow drives the host pipeline end-to-end on a fixture', async () => {
  const workspaceRoot = path.resolve(process.cwd(), 'test-markdown');
  const markdownPath = path.join(workspaceRoot, 'blockquote-regression.md');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdocx-vscode-smoke-'));
  const savePath = path.join(tempDir, 'blockquote-regression.docx');
  const logs = { errors: [], info: [], progress: [] };

  try {
    const vscodeApi = createFakeVscodeApi({ workspaceRoot, savePath, logs });
    const webviewHost = createNodeWebviewHost();
    const resourceUri = createFakeUri(markdownPath);

    await convertMarkdownToDocx({
      resourceUri,
      vscodeApi,
      webviewHost,
    });

    assert.deepEqual(logs.errors, []);
    assert.equal(logs.info.length, 1);
    assert.match(logs.info[0], /blockquote-regression\.docx/);
    assert.ok(logs.progress.length > 0, 'progress should be reported during conversion');

    const written = await fs.readFile(savePath);
    assert.ok(written.byteLength > 0, 'output DOCX should not be empty');

    const zip = await JSZip.loadAsync(written);
    const documentXml = zip.file('word/document.xml');
    assert.ok(documentXml, 'output DOCX should contain word/document.xml');
    const xml = await documentXml.async('string');
    assert.match(xml, /Blockquote Regression Fixture/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});