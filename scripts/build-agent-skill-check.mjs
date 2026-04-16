import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { convertWithAgentSkill } from '../apps/agent-skill/skill.mjs';

function assertValidSkillFrontmatter(source) {
  const frontmatterMatch = source.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(frontmatterMatch, 'SKILL.md must start with YAML frontmatter delimited by --- markers.');

  const frontmatter = frontmatterMatch[1];
  const nameMatch = frontmatter.match(/^name:\s*([a-z0-9-]+)\s*$/m);
  const descriptionMatch = frontmatter.match(/^description:\s*.+$/m);
  const argumentHintMatch = frontmatter.match(/^argument-hint:\s*".*"\s*$/m);

  assert.ok(nameMatch, 'SKILL.md frontmatter must include a valid lowercase hyphenated name field.');
  assert.ok(descriptionMatch, 'SKILL.md frontmatter must include a description field.');
  assert.equal(nameMatch[1], 'marktodocx-skill', 'SKILL.md must use the canonical public Claude skill name marktodocx-skill.');
  assert.ok(argumentHintMatch, 'SKILL.md argument-hint must be a quoted string when present.');
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, '..', 'apps', 'agent-skill');
  const skillEntryPath = path.join(rootDir, 'skill.mjs');
  const skillDocPath = path.join(rootDir, 'SKILL.md');

  await fs.access(skillEntryPath);
  await fs.access(skillDocPath);
  assertValidSkillFrontmatter(await fs.readFile(skillDocPath, 'utf8'));

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'marktodocx-agent-skill-build-'));
  const markdownPath = path.join(tempDir, 'sample.md');
  const outputPath = path.join(tempDir, 'sample.docx');

  try {
    await fs.writeFile(markdownPath, '# Agent Skill Build Smoke\n\nPlain paragraph.\n', 'utf8');

    const result = await convertWithAgentSkill({
      inputPath: markdownPath,
      outputPath,
      stylePreset: 'minimal',
    });

    const stat = await fs.stat(outputPath);
    assert.equal(stat.size > 0, true);
    assert.equal(result.bytes.byteLength > 0, true);
    console.log('Agent skill build smoke passed');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});