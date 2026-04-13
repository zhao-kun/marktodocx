import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeStyleOptions,
  styleOptionsDigest,
  summarizeFixtureProvenance,
  summarizeFixtureSourceSha,
  summarizeFixtureSourceTreeState,
  verifyPinnedMermaidVersion,
  verifySharedDependencyVersions,
} from '../scripts/lib/extension-parity.mjs';

test('normalizeStyleOptions canonicalizes missing overrides and nested key order', () => {
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
});

test('styleOptionsDigest treats omitted empty overrides and different key order as equivalent', () => {
  const left = styleOptionsDigest({ preset: 'minimal' });
  const right = styleOptionsDigest({ overrides: {}, preset: 'minimal' });
  const reordered = styleOptionsDigest({
    preset: 'default',
    overrides: {
      headings: { color: '#111111', fontFamily: 'Times New Roman' },
      body: { lineHeight: 1.6, color: '#222222' },
    },
  });
  const canonical = styleOptionsDigest({
    overrides: {
      body: { color: '#222222', lineHeight: 1.6 },
      headings: { fontFamily: 'Times New Roman', color: '#111111' },
    },
    preset: 'default',
  });

  assert.equal(left, right);
  assert.equal(reordered, canonical);
});

test('summarize fixture provenance exposes tree-state summary alongside SHA summary', () => {
  const fixtures = [
    { sourceSha: 'abc', sourceTreeState: 'dirty' },
    { sourceSha: 'abc', sourceTreeState: 'dirty' },
  ];

  assert.equal(summarizeFixtureSourceSha(fixtures), 'abc');
  assert.equal(summarizeFixtureSourceTreeState(fixtures), 'dirty');
  assert.deepEqual(summarizeFixtureProvenance(fixtures), {
    sourceSha: 'abc',
    sourceTreeState: 'dirty',
  });
});

test('summarize fixture provenance reports mixed values explicitly', () => {
  const fixtures = [
    { sourceSha: 'abc', sourceTreeState: 'clean' },
    { sourceSha: 'def', sourceTreeState: 'dirty' },
  ];

  assert.deepEqual(summarizeFixtureProvenance(fixtures), {
    sourceSha: 'mixed',
    sourceTreeState: 'mixed',
  });
});

test('verifyPinnedMermaidVersion confirms root and extension package pins match', async () => {
  const versions = await verifyPinnedMermaidVersion();

  assert.equal(versions.repoVersion, versions.extensionVersion);
  assert.equal(typeof versions.repoVersion, 'string');
});

test('verifySharedDependencyVersions confirms shared package pins do not drift across manifests', async () => {
  const versions = await verifySharedDependencyVersions();

  assert.equal(versions['html-to-docx'].root, versions['html-to-docx'].core);
  assert.equal(versions['markdown-it'].root, versions['markdown-it'].core);
  assert.equal(versions.mermaid.root, versions.mermaid.extension);
});