import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  convertWithAgentSkill,
  normalizeSkillStyleSet,
  resolveAgentSkillStyleOptions,
} from '../apps/agent-skill/skill.mjs';

test('resolveAgentSkillStyleOptions honors env defaults and explicit skill parameter precedence by option kind', async () => {
  const styleOptions = await resolveAgentSkillStyleOptions({
    cwd: process.cwd(),
    env: {
      MARKDOCX_STYLE_PRESET: 'minimal',
      MARKDOCX_MARGIN_PRESET: 'wide',
      MARKDOCX_STYLE_JSON: JSON.stringify({
        overrides: {
          blockquote: {
            italic: true,
          },
        },
      }),
      MARKDOCX_STYLE_SET: 'body.fontSizePt=12;code.fontSizePt=9',
    },
    stylePreset: 'report',
    marginPreset: 'compact',
    styleJson: {
      overrides: {
        blockquote: {
          italic: false,
        },
      },
    },
    styleSet: 'body.fontSizePt=13;code.fontSizePt=11',
  });

  assert.equal(styleOptions.preset, 'report');
  assert.equal(styleOptions.overrides.page.marginPreset, 'compact');
  assert.equal(styleOptions.overrides.blockquote.italic, false);
  assert.equal(styleOptions.overrides.body.fontSizePt, 13);
  assert.equal(styleOptions.overrides.code.fontSizePt, 11);
});

test('normalizeSkillStyleSet accepts string and array inputs', () => {
  assert.deepEqual(normalizeSkillStyleSet('body.fontSizePt=12'), ['body.fontSizePt=12']);
  assert.deepEqual(normalizeSkillStyleSet(['body.fontSizePt=12', '', 'code.fontSizePt=10']), ['body.fontSizePt=12', 'code.fontSizePt=10']);
});

test('agent skill wrapper converts markdown and writes the default output beside the source file', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdocx-agent-skill-test-'));
  const markdownPath = path.join(tempDir, 'sample.md');
  const expectedOutputPath = path.join(tempDir, 'sample.docx');

  try {
    await fs.writeFile(markdownPath, '# Agent Skill Test\n\nPlain paragraph.\n', 'utf8');

    const result = await convertWithAgentSkill({
      inputPath: markdownPath,
      stylePreset: 'minimal',
      styleSet: 'body.fontSizePt=12',
    });

    const outputStat = await fs.stat(expectedOutputPath);
    assert.equal(result.outputPath, expectedOutputPath);
    assert.equal(outputStat.size > 0, true);
    assert.equal(result.bytes.byteLength > 0, true);
    assert.equal(result.styleOptions.overrides.body.fontSizePt, 12);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});