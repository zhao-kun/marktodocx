import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { resolveNodeStyleOptions } from '@marktodocx/runtime-node';

const execFile = promisify(execFileCallback);

test('resolveNodeStyleOptions honors env defaults and CLI precedence by option kind', async () => {
  const styleOptions = await resolveNodeStyleOptions({
    cwd: process.cwd(),
    env: {
      MARKTODOCX_STYLE_PRESET: 'minimal',
      MARKTODOCX_MARGIN_PRESET: 'wide',
      MARKTODOCX_STYLE_JSON: JSON.stringify({
        overrides: {
          blockquote: {
            italic: true,
          },
        },
      }),
      MARKTODOCX_STYLE_SET: 'body.fontSizePt=12;code.fontSizePt=9',
    },
    stylePreset: 'report',
    marginPreset: 'compact',
    styleJson: JSON.stringify({
      overrides: {
        blockquote: {
          italic: false,
        },
      },
    }),
    styleSet: ['body.fontSizePt=13', 'code.fontSizePt=11'],
  });

  assert.equal(styleOptions.preset, 'report');
  assert.equal(styleOptions.overrides.page.marginPreset, 'compact');
  assert.equal(styleOptions.overrides.blockquote.italic, false);
  assert.equal(styleOptions.overrides.body.fontSizePt, 13);
  assert.equal(styleOptions.overrides.code.fontSizePt, 11);
});

test('CLI wrapper converts markdown through runtime-node with style arguments', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marktodocx-cli-test-'));
  const markdownPath = path.join(tempDir, 'sample.md');
  const styleJsonPath = path.join(tempDir, 'style.json');
  const outputPath = path.join(tempDir, 'sample.docx');

  try {
    await fs.writeFile(markdownPath, '# CLI Test\n\nPlain paragraph.\n', 'utf8');
    await fs.writeFile(styleJsonPath, JSON.stringify({
      overrides: {
        blockquote: {
          italic: false,
        },
      },
    }), 'utf8');

    const result = await execFile(process.execPath, [
      path.resolve(process.cwd(), 'md-to-docx.mjs'),
      markdownPath,
      outputPath,
      '--style-preset',
      'minimal',
      '--style-json',
      styleJsonPath,
      '--set',
      'body.fontSizePt=12',
    ]);

    const outputStat = await fs.stat(outputPath);
    assert.equal(outputStat.size > 0, true);
    assert.match(result.stdout, /Wrote /);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});