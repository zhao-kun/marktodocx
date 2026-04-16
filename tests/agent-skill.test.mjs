import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  convertWithAgentSkill,
  normalizeSkillStyleSet,
  readAgentSkillExportManifest,
  resolveBundledMermaidLaunchOptions,
  resolveAgentSkillStyleOptions,
} from '../apps/agent-skill/skill.mjs';

test('resolveAgentSkillStyleOptions honors env defaults and explicit skill parameter precedence by option kind', async () => {
  const styleOptions = await resolveAgentSkillStyleOptions({
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
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marktodocx-agent-skill-test-'));
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

test('readAgentSkillExportManifest returns null when no export manifest is present', async () => {
  const manifest = await readAgentSkillExportManifest();
  assert.equal(manifest, null);
});

test('resolveBundledMermaidLaunchOptions defers to explicit PUPPETEER_EXECUTABLE_PATH overrides', async () => {
  const launchOptions = await resolveBundledMermaidLaunchOptions({
    env: {
      ...process.env,
      PUPPETEER_EXECUTABLE_PATH: '/tmp/custom-chromium',
    },
  });

  assert.equal(launchOptions, undefined);
});

test('resolveBundledMermaidLaunchOptions rejects platform mismatch from export manifest', async () => {
  await assert.rejects(
    () => resolveBundledMermaidLaunchOptions({
      manifest: {
        profile: 'with-mermaid',
        platform: process.platform === 'linux' ? 'darwin' : 'linux',
        arch: process.arch,
        mermaid: {
          bundledBrowser: {
            executablePath: 'browser/chrome',
          },
        },
      },
    }),
    /targets .* but the current host is.*PUPPETEER_EXECUTABLE_PATH/
  );
});

test('resolveBundledMermaidLaunchOptions rejects export manifest without target platform metadata', async () => {
  await assert.rejects(
    () => resolveBundledMermaidLaunchOptions({
      manifest: {
        profile: 'with-mermaid',
        mermaid: {
          bundledBrowser: {
            executablePath: 'browser/chrome',
          },
        },
      },
    }),
    /missing target platform metadata/
  );
});

test('resolveBundledMermaidLaunchOptions rejects missing bundled browser executable', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marktodocx-agent-skill-manifest-'));

  try {
    await assert.rejects(
      () => resolveBundledMermaidLaunchOptions({
        manifest: {
          profile: 'with-mermaid',
          platform: process.platform,
          arch: process.arch,
          mermaid: {
            bundledBrowser: {
              executablePath: 'browser/missing-chrome',
            },
          },
        },
        skillRootDir: tempDir,
      }),
      /PUPPETEER_EXECUTABLE_PATH/
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});


test('resolveBundledMermaidLaunchOptions resolves bundled browser executable from manifest', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marktodocx-agent-skill-manifest-'));
  const browserDir = path.join(tempDir, 'browser');
  const executablePath = path.join(browserDir, 'chrome');

  try {
    await fs.mkdir(browserDir, { recursive: true });
    await fs.writeFile(executablePath, '', 'utf8');

    const launchOptions = await resolveBundledMermaidLaunchOptions({
      manifest: {
        profile: 'with-mermaid',
        platform: process.platform,
        arch: process.arch,
        mermaid: {
          bundledBrowser: {
            executablePath: 'browser/chrome',
            launchArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
          },
        },
      },
      skillRootDir: tempDir,
    });

    assert.deepEqual(launchOptions, {
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('resolveBundledMermaidLaunchOptions defaults missing launchArgs to an empty array', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marktodocx-agent-skill-manifest-'));
  const browserDir = path.join(tempDir, 'browser');
  const executablePath = path.join(browserDir, 'chrome');

  try {
    await fs.mkdir(browserDir, { recursive: true });
    await fs.writeFile(executablePath, '', 'utf8');

    const launchOptions = await resolveBundledMermaidLaunchOptions({
      manifest: {
        profile: 'with-mermaid',
        platform: process.platform,
        arch: process.arch,
        mermaid: {
          bundledBrowser: {
            executablePath: 'browser/chrome',
          },
        },
      },
      skillRootDir: tempDir,
    });

    assert.deepEqual(launchOptions, {
      executablePath,
      args: [],
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

