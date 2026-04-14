#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const steps = [
  {
    id: 'workspace-package-builds',
    label: 'Shared package builds',
    command: npmExecutable,
    args: ['run', 'build:packages'],
  },
  {
    id: 'chrome-extension-build',
    label: 'Chrome extension build',
    command: npmExecutable,
    args: ['run', 'build:chrome-extension'],
  },
  {
    id: 'cli-build-smoke',
    label: 'CLI build smoke',
    command: npmExecutable,
    args: ['run', 'build:cli'],
  },
  {
    id: 'vscode-extension-build',
    label: 'VSCode extension build',
    command: npmExecutable,
    args: ['run', 'build:vscode-extension'],
  },
  {
    id: 'vscode-extension-smoke',
    label: 'VSCode extension smoke test',
    command: process.execPath,
    args: ['--test', 'tests/vscode-extension.test.mjs'],
  },
  {
    id: 'agent-skill-build-smoke',
    label: 'Agent skill build smoke',
    command: npmExecutable,
    args: ['run', 'build:agent-skill'],
  },
  {
    id: 'agent-skill-export-verify',
    label: 'Agent skill export verification',
    command: npmExecutable,
    args: ['run', 'test:export:agent-skill'],
  },
];

function formatDuration(startTime) {
  const elapsedMs = Date.now() - startTime;
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

function runStep(step) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log(`\n==> ${step.label}`);
    console.log(`$ ${step.command} ${step.args.join(' ')}`);

    const child = spawn(step.command, step.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve({
          id: step.id,
          label: step.label,
          duration: formatDuration(startedAt),
        });
        return;
      }

      const detail = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${step.label} failed with ${detail}.`));
    });
  });
}

async function main() {
  const results = [];

  for (const step of steps) {
    results.push(await runStep(step));
  }

  console.log('\nAll host smoke checks passed.');
  for (const result of results) {
    console.log(`- ${result.label}: ${result.duration}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});