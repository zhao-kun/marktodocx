#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { compareDocxFiles, fileExists, formatDifferences, resolveFromRepoRoot } from './lib/docx-parity.mjs';
import {
  convertFixtureWithExtension,
  createExtensionSession,
  normalizeStyleOptions,
  readJson,
  renderCurrentVisualBaselineHashes,
  renderMermaidSvgMetadata,
  sha256,
  styleOptionsDigest,
} from './lib/extension-parity.mjs';

const manifestPath = resolveFromRepoRoot('test-markdown', '__golden__', 'manifest.json');

async function listPngFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'));
}

async function readBaselineHashes(dirPath) {
  const entries = await listPngFiles(dirPath);
  const hashes = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))) {
    hashes.push(sha256(await fs.readFile(path.join(dirPath, entry.name))));
  }
  return hashes;
}

const allowedCategories = new Set([
  'integration',
  'long-document',
  'mermaid-heavy',
  'regression',
  'style-regression',
  'page-overflow',
]);

async function main() {
  if (!(await fileExists(manifestPath))) {
    throw new Error('No parity manifest found.');
  }

  const manifest = await readJson(manifestPath);
  const fixtures = Array.isArray(manifest.fixtures) ? manifest.fixtures : [];
  const verifiedFixtures = fixtures.filter((fixture) => fixture.status === 'verified');
  const pendingFixtures = fixtures.filter((fixture) => fixture.status !== 'verified');

  if (verifiedFixtures.length === 0) {
    throw new Error('Parity manifest has no verified fixtures. This is a failing configuration, not a passing skip.');
  }

  const failures = [];
  const warnings = [];

  if (!manifest.sourceSha) {
    failures.push({
      id: 'manifest',
      message: 'manifest.sourceSha is not recorded.',
    });
  }
  if (!manifest.sourceTreeState) {
    warnings.push('manifest.sourceTreeState is not recorded. Golden provenance is incomplete.');
  } else if (manifest.sourceTreeState !== 'clean') {
    warnings.push(`golden corpus was captured from a ${manifest.sourceTreeState} tree and is not fully reproducible until regenerated from a clean checkout.`);
  }

  const session = await createExtensionSession({
    allowNoSandbox: process.env.MARKDOCX_PUPPETEER_NO_SANDBOX === '1' || process.env.CI === 'true',
  });

  try {
    for (const fixture of verifiedFixtures) {
      const markdownPath = resolveFromRepoRoot(fixture.markdownPath);
      const goldenDocxPath = resolveFromRepoRoot(fixture.goldenDocxPath);

      if (!allowedCategories.has(fixture.category)) {
        failures.push({
          id: fixture.id,
          message: `Unknown fixture category: ${fixture.category}`,
        });
      }

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

      const markdown = await fs.readFile(markdownPath, 'utf8');
      const markdownDigest = sha256(markdown);
      if (fixture.markdownSha256 && fixture.markdownSha256 !== markdownDigest) {
        failures.push({
          id: fixture.id,
          message: `Fixture markdown hash mismatch. Expected ${fixture.markdownSha256}, got ${markdownDigest}. Regenerate the golden.`,
        });
      }

      const normalizedStyleOptions = normalizeStyleOptions(fixture.styleOptions);
      const styleDigest = styleOptionsDigest(normalizedStyleOptions);
      if (fixture.styleOptionsSha256 && fixture.styleOptionsSha256 !== styleDigest) {
        failures.push({
          id: fixture.id,
          message: `Fixture styleOptions hash mismatch. Expected ${fixture.styleOptionsSha256}, got ${styleDigest}. Regenerate the golden.`,
        });
      }

      const rerun = await convertFixtureWithExtension(session, fixture);
      const tempOutputPath = path.resolve(path.dirname(manifestPath), `${fixture.id}.current.docx`);
      await fs.writeFile(tempOutputPath, Buffer.from(rerun.base64, 'base64'));

      try {
        const differences = await compareDocxFiles(tempOutputPath, goldenDocxPath);
        if (differences.length > 0) {
          failures.push({
            id: fixture.id,
            message: formatDifferences(differences, tempOutputPath, goldenDocxPath),
          });
        }
      } finally {
        await fs.rm(tempOutputPath, { force: true });
      }

      if (!markdown.includes('```mermaid')) {
        continue;
      }

      const currentMermaid = await renderMermaidSvgMetadata(session, markdown, fixture.styleOptions);
      const currentSvgHashes = currentMermaid.map((item) => item.sha256);
      const expectedSvgHashes = fixture.mermaid?.svgHashes || [];
      if (expectedSvgHashes.length !== currentSvgHashes.length) {
        failures.push({
          id: fixture.id,
          message: `Mermaid SVG count mismatch. Expected ${expectedSvgHashes.length}, got ${currentSvgHashes.length}.`,
        });
      } else if (expectedSvgHashes.some((hash, index) => hash !== currentSvgHashes[index])) {
        failures.push({
          id: fixture.id,
          message: `Mermaid SVG hash mismatch. Expected ${expectedSvgHashes.join(', ')}, got ${currentSvgHashes.join(', ')}.`,
        });
      }

      const visualBaselineDir = path.resolve(path.dirname(manifestPath), 'visual-baselines', fixture.id);
      if (!(await fileExists(visualBaselineDir))) {
        failures.push({
          id: fixture.id,
          message: `Missing Mermaid visual baseline directory: ${visualBaselineDir}`,
        });
        continue;
      }

      const baselinePngs = await listPngFiles(visualBaselineDir);
      if (baselinePngs.length === 0) {
        failures.push({
          id: fixture.id,
          message: `Mermaid visual baseline directory has no PNGs: ${visualBaselineDir}`,
        });
      } else if (fixture.visualBaselineCount && baselinePngs.length !== fixture.visualBaselineCount) {
        warnings.push(`[${fixture.id}] visual baseline count changed: expected ${fixture.visualBaselineCount}, found ${baselinePngs.length}`);
      }

      const expectedBaselineHashes = await readBaselineHashes(visualBaselineDir);
      const currentBaselineHashes = await renderCurrentVisualBaselineHashes(session, markdown, fixture.styleOptions);
      if (expectedBaselineHashes.length === currentBaselineHashes.length) {
        const changed = expectedBaselineHashes.some((hash, index) => hash !== currentBaselineHashes[index]);
        if (changed) {
          warnings.push(`[${fixture.id}] Mermaid raster baseline drift detected. Review visual-baselines/${fixture.id}/ before accepting regenerated outputs.`);
        }
      }
    }
  } finally {
    await session.close();
  }

  if (failures.length > 0) {
    console.error('Golden corpus validation failures:');
    for (const failure of failures) {
      console.error(`\n[${failure.id}]`);
      console.error(failure.message);
    }
    process.exit(1);
  }

  console.log(`Golden corpus is valid for ${verifiedFixtures.length} verified fixture(s).`);
  if (warnings.length > 0) {
    console.warn('Visual baseline warnings:');
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }
  if (pendingFixtures.length > 0) {
    console.log(`Pending fixtures awaiting Chrome-extension goldens: ${pendingFixtures.length}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});