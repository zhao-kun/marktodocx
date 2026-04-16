#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import {
  buildDetailedDiffSummary,
  compareDocxFiles,
  fileExists,
  formatDifferences,
  resolveFromRepoRoot,
} from './lib/docx-parity.mjs';

const execFile = promisify(execFileCallback);
const manifestPath = resolveFromRepoRoot('test-markdown', '__golden__', 'manifest.json');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function runCliConversion({ markdownPath, outputPath, styleOptions }) {
  const tempStylePath = path.join(path.dirname(outputPath), `${path.basename(outputPath, '.docx')}.style.json`);

  try {
    await fs.writeFile(tempStylePath, `${JSON.stringify(styleOptions, null, 2)}\n`, 'utf8');
    return await execFile(process.execPath, [
      resolveFromRepoRoot('md-to-docx.mjs'),
      markdownPath,
      outputPath,
      '--style-json',
      tempStylePath,
    ], {
      cwd: process.cwd(),
      env: process.env,
    });
  } finally {
    await fs.rm(tempStylePath, { force: true });
  }
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

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marktodocx-cli-parity-'));
  const failures = [];
  const passes = [];

  try {
    for (const fixture of verifiedFixtures) {
      const markdownPath = resolveFromRepoRoot(fixture.markdownPath);
      const goldenDocxPath = resolveFromRepoRoot(fixture.goldenDocxPath);
      const currentDocxPath = path.join(tempDir, `${fixture.id}.docx`);

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

      let cliStdout = '';
      try {
        const result = await runCliConversion({
          markdownPath,
          outputPath: currentDocxPath,
          styleOptions: fixture.styleOptions || { preset: 'default', overrides: {} },
        });
        cliStdout = result.stdout;
      } catch (error) {
        failures.push({
          id: fixture.id,
          message: [
            `CLI execution failed for ${fixture.id}.`,
            error.stderr?.trim() || error.stdout?.trim() || error.message,
          ].filter(Boolean).join('\n'),
        });
        continue;
      }

      const differences = await compareDocxFiles(currentDocxPath, goldenDocxPath);
      if (differences.length > 0) {
        const detail = await buildDetailedDiffSummary(currentDocxPath, goldenDocxPath, differences);
        failures.push({
          id: fixture.id,
          message: [
            formatDifferences(differences, currentDocxPath, goldenDocxPath),
            detail
              ? [
                  '',
                  `First word/document.xml difference at character ${detail.diffIndex}:`,
                  `- current: ${detail.leftSnippet}`,
                  `- golden: ${detail.rightSnippet}`,
                ].join('\n')
              : null,
          ].filter(Boolean).join('\n'),
        });
        continue;
      }

      passes.push({
        id: fixture.id,
        stdout: cliStdout.trim(),
      });
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`CLI parity failures: ${failures.length}/${verifiedFixtures.length}`);
    if (passes.length > 0) {
      console.error(`Passing fixtures: ${passes.map((pass) => pass.id).join(', ')}`);
    }
    for (const failure of failures) {
      console.error(`\n[${failure.id}]`);
      console.error(failure.message);
    }
    process.exit(1);
  }

  console.log(`CLI parity passed for ${passes.length} verified fixture(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});