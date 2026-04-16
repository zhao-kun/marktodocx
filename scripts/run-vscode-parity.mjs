#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

import { compareDocxFiles, fileExists, formatDifferences, resolveFromRepoRoot } from './lib/docx-parity.mjs';
import {
  convertWithExtensionInputs,
  createExtensionSession,
  readJson,
} from './lib/extension-parity.mjs';

const require = createRequire(import.meta.url);
const {
  convertMarkdownToDocx,
} = require('../apps/vscode-extension/src/convert.js');

const manifestPath = resolveFromRepoRoot('test-markdown', '__golden__', 'manifest.json');
const testMarkdownRoot = resolveFromRepoRoot('test-markdown');

function createFakeUri(filePath) {
  return {
    scheme: 'file',
    fsPath: filePath,
  };
}

function createFakeVscodeApi({ workspaceRoot, savePath, fixtureStyleOptions, logs }) {
  const stylePreset = typeof fixtureStyleOptions?.preset === 'string'
    ? fixtureStyleOptions.preset
    : 'default';
  const styleJson = JSON.stringify(fixtureStyleOptions || {});

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
            if (key === 'stylePreset') return stylePreset;
            if (key === 'marginPreset') return '';
            if (key === 'styleJson') return styleJson;
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
          report() {},
        };
        return task(progress);
      },
    },
    commands: {
      executeCommand() {},
    },
  };
}

function createExtensionWebviewHost(session, fixtureId) {
  return {
    async convert({ markdown, imageMap, mdRelativeDir, styleOptions }) {
      const base64 = await convertWithExtensionInputs(session, {
        fixtureId,
        markdown,
        imageMap,
        mdRelativeDir,
        styleOptions,
      });
      return new Uint8Array(Buffer.from(base64, 'base64'));
    },
  };
}

async function runFixtureThroughVscodeHost(session, fixture, tempDir) {
  const markdownPath = resolveFromRepoRoot(fixture.markdownPath);
  const savePath = path.join(tempDir, `${fixture.id}.docx`);
  const logs = { errors: [], info: [] };

  const vscodeApi = createFakeVscodeApi({
    workspaceRoot: testMarkdownRoot,
    savePath,
    fixtureStyleOptions: fixture.styleOptions,
    logs,
  });
  const webviewHost = createExtensionWebviewHost(session, fixture.id);

  await convertMarkdownToDocx({
    resourceUri: createFakeUri(markdownPath),
    vscodeApi,
    webviewHost,
  });

  if (logs.errors.length > 0) {
    throw new Error(`VSCode host reported errors: ${logs.errors.join(' | ')}`);
  }

  return savePath;
}

async function main() {
  if (!(await fileExists(manifestPath))) {
    throw new Error('No parity manifest found.');
  }

  const manifest = await readJson(manifestPath);
  const fixtures = Array.isArray(manifest.fixtures) ? manifest.fixtures : [];
  const verifiedFixtures = fixtures.filter((fixture) => fixture.status === 'verified');

  if (verifiedFixtures.length === 0) {
    throw new Error('Parity manifest has no verified fixtures.');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marktodocx-vscode-parity-'));
  const failures = [];
  const passes = [];

  const session = await createExtensionSession({
    allowNoSandbox: process.env.MARKTODOCX_PUPPETEER_NO_SANDBOX === '1' || process.env.CI === 'true',
  });

  try {
    for (const fixture of verifiedFixtures) {
      const markdownPath = resolveFromRepoRoot(fixture.markdownPath);
      const goldenDocxPath = resolveFromRepoRoot(fixture.goldenDocxPath);

      if (!(await fileExists(markdownPath))) {
        failures.push({
          id: fixture.id,
          message: `Missing markdown fixture: ${markdownPath}`,
        });
        continue;
      }

      if (!(await fileExists(goldenDocxPath))) {
        failures.push({
          id: fixture.id,
          message: `Missing golden DOCX: ${goldenDocxPath}`,
        });
        continue;
      }

      let currentDocxPath;
      try {
        currentDocxPath = await runFixtureThroughVscodeHost(session, fixture, tempDir);
      } catch (error) {
        failures.push({
          id: fixture.id,
          message: `VSCode host conversion failed: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      const differences = await compareDocxFiles(currentDocxPath, goldenDocxPath);
      if (differences.length > 0) {
        failures.push({
          id: fixture.id,
          message: formatDifferences(differences, currentDocxPath, goldenDocxPath),
        });
        continue;
      }

      passes.push(fixture.id);
    }
  } finally {
    await session.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`VSCode parity failures: ${failures.length}/${verifiedFixtures.length}`);
    if (passes.length > 0) {
      console.error(`Passing fixtures: ${passes.join(', ')}`);
    }
    for (const failure of failures) {
      console.error(`\n[${failure.id}]`);
      console.error(failure.message);
    }
    process.exit(1);
  }

  console.log(`VSCode parity passed for ${passes.length} verified fixture(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
