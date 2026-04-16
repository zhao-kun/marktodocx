import fs from 'node:fs/promises';
import path from 'node:path';

import { IMAGE_EXTENSIONS } from '@marktodocx/core';

function normalizePathForCore(filePath) {
  return filePath.split(path.sep).join('/');
}

export async function buildImageMapFromHtml(html, baseDir, runtime) {
  if (typeof html !== 'string') {
    throw new TypeError('html must be a string');
  }
  if (typeof baseDir !== 'string' || baseDir.length === 0) {
    throw new TypeError('baseDir must be a non-empty string');
  }

  const doc = runtime.dom.parseHtml(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const images = [...doc.querySelectorAll('img')];
  const imageMap = {};

  for (const image of images) {
    const src = image.getAttribute('src');
    if (!src || src.startsWith('data:') || /^[a-z]+:/i.test(src)) {
      continue;
    }

    const decodedSrc = decodeURIComponent(src);
    const absolutePath = path.resolve(baseDir, decodedSrc);
    const extension = path.extname(absolutePath).toLowerCase();
    const mimeType = IMAGE_EXTENSIONS.get(extension);

    if (!mimeType) {
      throw new Error(`Unsupported image format: ${absolutePath}`);
    }

    const fileBuffer = await fs.readFile(absolutePath);
    imageMap[normalizePathForCore(absolutePath)] = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  }

  return imageMap;
}

export function normalizeBaseDirForCore(baseDir) {
  if (typeof baseDir !== 'string' || baseDir.length === 0) {
    throw new TypeError('baseDir must be a non-empty string');
  }

  return normalizePathForCore(path.resolve(baseDir));
}
