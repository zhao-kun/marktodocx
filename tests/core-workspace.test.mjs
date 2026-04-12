import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  DEFAULT_STYLE_OPTIONS,
  DOCUMENT_MARGIN_PRESET_ORDER,
  DOCUMENT_STYLE_PRESET_ORDER,
  assertRuntimeContracts,
  resolveDocumentLayout,
  resolveDocumentStyle,
} from '../packages/core/src/index.js';

test('core workspace exports resolve style and layout consistently', () => {
  const resolvedStyle = resolveDocumentStyle(DEFAULT_STYLE_OPTIONS);
  const resolvedLayout = resolveDocumentLayout(resolvedStyle.page.marginPreset);

  assert.equal(resolvedStyle.preset, 'default');
  assert.equal(DOCUMENT_STYLE_PRESET_ORDER.includes(resolvedStyle.preset), true);
  assert.equal(DOCUMENT_MARGIN_PRESET_ORDER.includes(resolvedLayout.marginPreset), true);
  assert.equal(resolvedLayout.contentWidthPx > 0, true);
  assert.equal(resolvedLayout.contentHeightPx > 0, true);
});

test('runtime contract assertions accept valid adapters and reject invalid ones', () => {
  assert.doesNotThrow(() => {
    assertRuntimeContracts({
      dom: { parseHtml: () => ({}) },
      images: { inlineImages: (html) => html },
      mermaid: { render: async () => ({ pngDataUri: 'data:image/png;base64,AA==', displayWidth: 1, displayHeight: 1 }) },
    });
  });

  assert.throws(() => {
    assertRuntimeContracts({ dom: { parseHtml: 'nope' } });
  }, /runtime\.dom\.parseHtml must be a function/);
});

test('shared styleOptions schema exists and describes the canonical root shape', async () => {
  const schemaPath = new URL('../packages/core/src/style/style-options.schema.json', import.meta.url);
  const schema = JSON.parse(await fs.readFile(schemaPath, 'utf8'));

  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required, ['preset', 'overrides']);
  assert.deepEqual(schema.properties.preset.enum, ['default', 'minimal', 'report']);
  assert.equal(schema.properties.overrides.type, 'object');
  assert.equal(schema.properties.overrides.properties.page.$ref, '#/$defs/pageStyle');
});