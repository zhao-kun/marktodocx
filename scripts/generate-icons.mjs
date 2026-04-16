#!/usr/bin/env node

/**
 * Generate Chrome and VS Code icons from the canonical SVG source.
 * Uses sharp (already a root project dependency).
 */

import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, '../assets/icon.svg');
const chromeOutDir = path.resolve(__dirname, '../apps/chrome-extension/public/icons');
const vscodeOutPath = path.resolve(__dirname, '../apps/vscode-extension/media/icon.png');

const chromeSizes = [16, 32, 48, 128];
const sourceSvg = await fs.readFile(sourcePath);

for (const size of chromeSizes) {
  const outPath = path.join(chromeOutDir, `icon-${size}.png`);
  await sharp(sourceSvg)
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`Generated ${outPath} (${size}x${size})`);
}

await sharp(sourceSvg)
  .resize(128, 128)
  .png()
  .toFile(vscodeOutPath);

console.log(`Generated ${vscodeOutPath} (128x128)`);
