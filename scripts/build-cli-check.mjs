import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'markdocx-cli-build-'));
  const markdownPath = path.join(tempDir, 'sample.md');
  const outputPath = path.join(tempDir, 'sample.docx');

  try {
    await fs.writeFile(markdownPath, '# CLI Build Smoke\n\nPlain paragraph.\n', 'utf8');
    await execFile(process.execPath, [
      path.resolve(process.cwd(), 'md-to-docx.mjs'),
      markdownPath,
      outputPath,
      '--style-preset',
      'minimal',
    ]);

    const stat = await fs.stat(outputPath);
    assert.equal(stat.size > 0, true);
    console.log('CLI build smoke passed');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});