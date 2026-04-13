import { getDomAdapter } from '../contracts/runtime.js';

function resolvePath(baseDir, relativePath) {
  const parts = baseDir ? baseDir.split('/') : [];
  for (const segment of relativePath.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') {
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join('/');
}

export function inlineLocalImages(html, imageMap, mdRelativeDir, runtime = {}) {
  if (!imageMap || Object.keys(imageMap).length === 0) {
    return html;
  }

  const dom = getDomAdapter(runtime);
  const doc = dom.parseHtml(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const images = [...doc.querySelectorAll('img')];

  for (const image of images) {
    const src = image.getAttribute('src');
    if (!src || src.startsWith('data:') || /^[a-z]+:/i.test(src)) {
      continue;
    }

    const decodedSrc = decodeURIComponent(src);
    const resolved = resolvePath(mdRelativeDir, decodedSrc);

    const dataUri = imageMap[resolved];
    if (dataUri) {
      image.setAttribute('src', dataUri);
    }
  }

  return doc.body.innerHTML;
}