#!/usr/bin/env node

/**
 * Generate extension icons at 16, 32, 48, 128 px.
 * Uses sharp (already a root project dependency).
 *
 * Icon design: blue rounded rectangle with white "M" letter,
 * representing Markdown-to-DOCX conversion.
 */

import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../markdocx-extension/public/icons');

const sizes = [16, 32, 48, 128];

function createSvg(size) {
  // Scale all proportions to the target size
  const rx = Math.round(size * 0.15); // corner radius
  const fontSize = Math.round(size * 0.6);
  const strokeWidth = Math.max(1, Math.round(size * 0.02));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${size - strokeWidth}" height="${size - strokeWidth}" rx="${rx}" ry="${rx}" fill="#4285f4" stroke="#3367d6" stroke-width="${strokeWidth}"/>
  <text x="${size / 2}" y="${size / 2}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="white" text-anchor="middle" dominant-baseline="central">M</text>
</svg>`;
}

for (const size of sizes) {
  const svg = createSvg(size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`Generated ${outPath} (${size}x${size})`);
}
