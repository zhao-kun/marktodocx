#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';

import { compareDocxFiles, formatDifferences } from './lib/docx-parity.mjs';

function printUsage() {
  console.log([
    'Usage:',
    '  node scripts/compare-docx.mjs <left.docx> <right.docx>',
    '',
    'Compares normalized DOCX contents and exits non-zero on mismatch.',
  ].join('\n'));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length !== 2) {
    printUsage();
    process.exit(args.length === 2 ? 0 : 1);
  }

  const [leftArg, rightArg] = args;
  const leftPath = path.resolve(process.cwd(), leftArg);
  const rightPath = path.resolve(process.cwd(), rightArg);
  const differences = await compareDocxFiles(leftPath, rightPath);
  const output = formatDifferences(differences, leftPath, rightPath);

  console.log(output);
  process.exit(differences.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});