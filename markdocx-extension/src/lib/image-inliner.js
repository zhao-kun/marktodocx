/**
 * Resolve a relative path against a base directory, normalizing "." and "..".
 * Equivalent to Node's path.resolve(baseDir, relativePath) but for virtual
 * paths within the selected directory tree.
 *
 * Example: resolvePath("docs/guides", "../images/foo.png") → "docs/images/foo.png"
 */
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

/**
 * Inline local images in rendered HTML using a pre-resolved imageMap.
 *
 * This runs in the offscreen document AFTER markdown-it rendering, so it
 * walks all <img> elements in the rendered HTML — matching the CLI's approach
 * in md-to-docx.mjs:256-280 which also resolves after rendering. This
 * naturally covers all image forms (inline, reference-style, raw HTML, etc.)
 * without regex scanning of raw markdown.
 *
 * @param {string} html - Rendered HTML body from markdown-it
 * @param {Object} imageMap - { relativePath: dataUri } keyed by path relative to root folder
 * @param {string} mdRelativeDir - The .md file's directory relative to root folder (e.g. "docs/guides" or "")
 */
export function inlineLocalImages(html, imageMap, mdRelativeDir) {
  if (!imageMap || Object.keys(imageMap).length === 0) {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
  const images = [...doc.querySelectorAll('img')];

  for (const image of images) {
    const src = image.getAttribute('src');
    if (!src || src.startsWith('data:') || /^[a-z]+:/i.test(src)) {
      continue;
    }

    const decodedSrc = decodeURIComponent(src);

    // Resolve the image path relative to the .md file's directory,
    // normalizing ".." and "." segments — equivalent to the CLI's
    // path.resolve(baseDir, decodedSrc).
    const resolved = resolvePath(mdRelativeDir, decodedSrc);

    const dataUri = imageMap[resolved];
    if (dataUri) {
      image.setAttribute('src', dataUri);
    }
  }

  return doc.body.innerHTML;
}
