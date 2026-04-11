import mermaid from 'mermaid';
import {
  FLOWCHART_WRAPPING_WIDTH,
  FLOWCHART_NODE_SPACING,
  FLOWCHART_RANK_SPACING,
  MERMAID_RENDER_SCALE,
} from './constants.js';
import { resolveDocumentLayout } from './document-layout.js';

let initialized = false;

/**
 * Initialize mermaid with config matching the CLI's settings
 * (md-to-docx.mjs lines 134-148).
 */
function ensureInitialized() {
  if (initialized) return;

  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    markdownAutoWrap: true,
    fontFamily:
      'Noto Sans CJK SC, Microsoft YaHei, PingFang SC, Helvetica, Arial, sans-serif',
    flowchart: {
      htmlLabels: true,
      curve: 'linear',
      wrappingWidth: FLOWCHART_WRAPPING_WIDTH,
      nodeSpacing: FLOWCHART_NODE_SPACING,
      rankSpacing: FLOWCHART_RANK_SPACING,
      padding: 10,
    },
  });

  initialized = true;
}

/**
 * Find the tight bounding box of non-transparent pixels in image data.
 * Replaces sharp.trim() from the CLI.
 */
function findTrimBounds(imageData) {
  const { width, height, data } = imageData;
  let top = height;
  let bottom = 0;
  let left = width;
  let right = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  if (top > bottom || left > right) {
    // Fully transparent — return original dimensions
    return { top: 0, left: 0, width, height };
  }

  return {
    top,
    left,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

/**
 * Load an SVG string into an Image element via data URI.
 *
 * Using a data URI instead of a blob URL avoids canvas tainting.
 * Mermaid flowcharts with htmlLabels emit <foreignObject> containing
 * HTML, which causes the browser to treat a blob-URL-loaded SVG as
 * cross-origin, tainting the canvas and blocking getImageData().
 * A data URI with the SVG inlined does not trigger this restriction.
 */
function loadSvgAsImage(svgString) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(svgString);
    const dataUri = `data:image/svg+xml;charset=utf-8,${encoded}`;
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      reject(new Error(`Failed to load SVG as image: ${err}`));
    };
    img.src = dataUri;
  });
}

/**
 * Render a single Mermaid block to an HTML img tag with PNG data URI.
 *
 * Pipeline (from design doc §4.3):
 *   mermaid.render(id, code) → SVG string
 *     → Image from SVG blob URL
 *     → draw onto Canvas (2x scale, matching CLI's --scale 2)
 *     → scan pixels to find bounding box (replaces sharp.trim())
 *     → crop to bounding box
 *     → canvas.toDataURL('image/png')
 *     → HTML img tag
 */
export async function renderMermaidToImageTag(code, index, layoutMetrics = resolveDocumentLayout()) {
  ensureInitialized();

  const id = `mermaid-diagram-${index}`;

  // 1. Render to SVG via mermaid
  const { svg } = await mermaid.render(id, code);

  // 2. Extract SVG dimensions from the rendered output
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
  const svgEl = svgDoc.documentElement;

  // Extract intrinsic size. Prefer viewBox because Mermaid often emits
  // percentage-based width/height (e.g. "100%") on the outer <svg>, and
  // parseFloat("100%") would produce a bogus 100px. The viewBox always
  // contains the real geometry.
  let svgWidth;
  let svgHeight;

  const viewBox = svgEl.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/);
    svgWidth = parseFloat(parts[2]);
    svgHeight = parseFloat(parts[3]);
  }

  if (!svgWidth || !svgHeight) {
    const rawW = svgEl.getAttribute('width');
    const rawH = svgEl.getAttribute('height');
    // Only trust absolute values — skip percentages or other relative units
    if (rawW && /^[\d.]+$/.test(rawW)) svgWidth = parseFloat(rawW);
    if (rawH && /^[\d.]+$/.test(rawH)) svgHeight = parseFloat(rawH);
  }

  svgWidth = svgWidth || 800;
  svgHeight = svgHeight || 600;

  // 3. Draw SVG onto canvas at 2x scale (matching CLI's --scale 2)
  const scale = MERMAID_RENDER_SCALE;
  const canvasWidth = Math.ceil(svgWidth * scale);
  const canvasHeight = Math.ceil(svgHeight * scale);

  const img = await loadSvgAsImage(svg);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Transparent background (matching CLI's -b transparent)
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

  // 4. Pixel-based trim (replaces sharp.trim())
  const fullImageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const bounds = findTrimBounds(fullImageData);

  // 5. Crop to bounding box
  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = bounds.width;
  trimmedCanvas.height = bounds.height;
  const trimmedCtx = trimmedCanvas.getContext('2d');
  const croppedData = ctx.getImageData(bounds.left, bounds.top, bounds.width, bounds.height);
  trimmedCtx.putImageData(croppedData, 0, 0);

  // bounds.width/height are at 2x scale — convert to 1x for display dimensions
  const naturalWidth = Math.round(bounds.width / scale);
  const naturalHeight = Math.round(bounds.height / scale);

  let displayWidth = Math.min(naturalWidth, layoutMetrics.contentWidthPx);
  let displayHeight = Math.round(naturalHeight * (displayWidth / naturalWidth));

  // Cap display height to page content area so the diagram fits on one page
  if (displayHeight > layoutMetrics.contentHeightPx) {
    displayHeight = layoutMetrics.contentHeightPx;
    displayWidth = Math.round(naturalWidth * (displayHeight / naturalHeight));
  }

  // 6. Convert to PNG data URI
  const dataUri = trimmedCanvas.toDataURL('image/png');

  return [
    '<div class="mermaid-diagram">',
    `  <img src="${dataUri}" alt="Mermaid diagram ${index + 1}" width="${displayWidth}" height="${displayHeight}" style="width: ${displayWidth}px; height: ${displayHeight}px;" />`,
    '</div>',
  ].join('\n');
}
