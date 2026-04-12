#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';

import {
  convertFixtureWithExtension,
  createExtensionSession,
  extractVisualBaselines,
  fileSha256,
  getGitSha,
  getGitTreeState,
  normalizeStyleOptions,
  readJson,
  renderMermaidSvgMetadata,
  saveDocxBase64,
  sha256,
  styleOptionsDigest,
  summarizeFixtureProvenance,
  writeJson,
} from './lib/extension-parity.mjs';

const repoRoot = process.cwd();
const manifestPath = path.resolve(repoRoot, 'test-markdown', '__golden__', 'manifest.json');

function parseArgs(argv) {
  const options = {
    refresh: null,
    allowDirty: false,
    allowNoSandbox: process.env.MARKDOCX_PUPPETEER_NO_SANDBOX === '1' || process.env.CI === 'true',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-dirty') {
      options.allowDirty = true;
      continue;
    }
    if (arg === '--no-sandbox') {
      options.allowNoSandbox = true;
      continue;
    }
    if (arg === '--refresh' && argv[index + 1]) {
      options.refresh = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--refresh=')) {
      options.refresh = arg.slice('--refresh='.length);
    }
  }

  return options;
}

function shouldGenerateFixture(fixture, refresh) {
  if (!refresh) {
    return fixture.status !== 'verified';
  }

  if (refresh === 'all') {
    return true;
  }

  const ids = new Set(refresh.split(',').map((value) => value.trim()).filter(Boolean));
  return ids.has(fixture.id);
}

function updateTopLevelProvenance(manifest) {
  const summary = summarizeFixtureProvenance(manifest.fixtures);
  return {
    sourceSha: summary.sourceSha,
    sourceTreeState: summary.sourceTreeState,
    fixtures: manifest.fixtures,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readJson(manifestPath);
  const gitTreeState = await getGitTreeState();

  if (gitTreeState === 'dirty' && !options.allowDirty) {
    throw new Error('Refusing to generate goldens from a dirty working tree. Commit or stash changes first, or rerun with --allow-dirty if you intentionally want non-reproducible provenance.');
  }

  const fixturesToGenerate = manifest.fixtures.filter((fixture) => shouldGenerateFixture(fixture, options.refresh));
  if (fixturesToGenerate.length === 0) {
    console.log('No fixtures selected for golden generation. Use --refresh all or --refresh <fixture-id> to regenerate verified goldens.');
    return;
  }

  const sourceSha = await getGitSha();
  const session = await createExtensionSession({ allowNoSandbox: options.allowNoSandbox });

  try {
    let generatedCount = 0;

    for (const fixture of manifest.fixtures) {
      if (!fixturesToGenerate.includes(fixture)) {
        continue;
      }

      const result = await convertFixtureWithExtension(session, fixture);
      const outputPath = path.resolve(repoRoot, fixture.goldenDocxPath);
      await saveDocxBase64(result.base64, outputPath);

      fixture.status = 'verified';
      fixture.sourceSha = sourceSha;
      fixture.sourceTreeState = gitTreeState;
      fixture.markdownSha256 = sha256(result.markdown);
      fixture.styleOptions = normalizeStyleOptions(fixture.styleOptions);
      fixture.styleOptionsSha256 = styleOptionsDigest(fixture.styleOptions);
      fixture.goldenDocxSha256 = await fileSha256(outputPath);

      const containsMermaid = result.markdown.includes('```mermaid');
      const mermaidMetadata = await renderMermaidSvgMetadata(session, result.markdown, fixture.styleOptions);
      if (containsMermaid && mermaidMetadata.length === 0) {
        throw new Error(`Fixture ${fixture.id} contains Mermaid blocks but the extension runtime returned zero Mermaid artifacts.`);
      }

      if (mermaidMetadata.length > 0) {
        fixture.mermaid = {
          diagramCount: mermaidMetadata.length,
          svgHashes: mermaidMetadata.map((item) => item.sha256),
        };
        fixture.visualBaselineCount = await extractVisualBaselines(session, result.markdown, fixture.id, fixture.styleOptions);
        if (fixture.visualBaselineCount === 0) {
          throw new Error(`Fixture ${fixture.id} contains Mermaid blocks but no visual baselines were produced.`);
        }
      } else {
        delete fixture.mermaid;
        delete fixture.visualBaselineCount;
        await extractVisualBaselines(session, result.markdown, fixture.id, fixture.styleOptions);
      }

      generatedCount += 1;
    }

    await writeJson(manifestPath, updateTopLevelProvenance(manifest));
    console.log(`Generated ${generatedCount} golden fixture(s) from Chrome extension donor SHA ${sourceSha}.`);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});