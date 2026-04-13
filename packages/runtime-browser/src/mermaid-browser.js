import mermaid from 'mermaid';
import {
  FLOWCHART_NODE_SPACING,
  FLOWCHART_RANK_SPACING,
  FLOWCHART_WRAPPING_WIDTH,
  MERMAID_RENDER_SCALE,
  resolveDocumentLayout,
} from '@markdocx/core';

let initialized = false;

export function getMermaidConfig() {
  return {
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
  };
}

function ensureInitialized() {
  if (initialized) {
    return;
  }

  mermaid.initialize(getMermaidConfig());
  initialized = true;
}

function findTrimBounds(imageData) {
  const { width, height, data } = imageData;
  let top = height;
  let bottom = 0;
  let left = width;
  let right = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
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
    return { top: 0, left: 0, width, height };
  }

  return {
    top,
    left,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function loadSvgAsImage(svgString) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(svgString);
    const dataUri = `data:image/svg+xml;charset=utf-8,${encoded}`;
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(new Error(`Failed to load SVG as image: ${error}`));
    img.src = dataUri;
  });
}

function extractSvgDimensions(svg) {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
  const svgEl = svgDoc.documentElement;

  let svgWidth;
  let svgHeight;

  const viewBox = svgEl.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/);
    svgWidth = parseFloat(parts[2]);
    svgHeight = parseFloat(parts[3]);
  }

  if (!svgWidth || !svgHeight) {
    const rawWidth = svgEl.getAttribute('width');
    const rawHeight = svgEl.getAttribute('height');
    if (rawWidth && /^[\d.]+$/.test(rawWidth)) svgWidth = parseFloat(rawWidth);
    if (rawHeight && /^[\d.]+$/.test(rawHeight)) svgHeight = parseFloat(rawHeight);
  }

  return {
    svgWidth: svgWidth || 800,
    svgHeight: svgHeight || 600,
  };
}

export async function renderMermaidArtifacts(code, index, layoutMetrics = resolveDocumentLayout()) {
  ensureInitialized();

  const id = `mermaid-diagram-${index}`;
  const { svg } = await mermaid.render(id, code);
  const { svgWidth, svgHeight } = extractSvgDimensions(svg);

  const scale = MERMAID_RENDER_SCALE;
  const canvasWidth = Math.ceil(svgWidth * scale);
  const canvasHeight = Math.ceil(svgHeight * scale);

  const img = await loadSvgAsImage(svg);
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

  const fullImageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  const bounds = findTrimBounds(fullImageData);

  const trimmedCanvas = document.createElement('canvas');
  trimmedCanvas.width = bounds.width;
  trimmedCanvas.height = bounds.height;
  const trimmedCtx = trimmedCanvas.getContext('2d');
  const croppedData = ctx.getImageData(bounds.left, bounds.top, bounds.width, bounds.height);
  trimmedCtx.putImageData(croppedData, 0, 0);

  const naturalWidth = Math.round(bounds.width / scale);
  const naturalHeight = Math.round(bounds.height / scale);

  let displayWidth = Math.min(naturalWidth, layoutMetrics.contentWidthPx);
  let displayHeight = Math.round(naturalHeight * (displayWidth / naturalWidth));

  if (displayHeight > layoutMetrics.contentHeightPx) {
    displayHeight = layoutMetrics.contentHeightPx;
    displayWidth = Math.round(naturalWidth * (displayHeight / naturalHeight));
  }

  return {
    svg,
    pngDataUri: trimmedCanvas.toDataURL('image/png'),
    naturalWidth,
    naturalHeight,
    displayWidth,
    displayHeight,
  };
}

export async function renderMermaidToImageTag(code, index, layoutMetrics = resolveDocumentLayout()) {
  const artifact = await renderMermaidArtifacts(code, index, layoutMetrics);

  return [
    '<div class="mermaid-diagram">',
    `  <img src="${artifact.pngDataUri}" alt="Mermaid diagram ${index + 1}" width="${artifact.displayWidth}" height="${artifact.displayHeight}" style="width: ${artifact.displayWidth}px; height: ${artifact.displayHeight}px;" />`,
    '</div>',
  ].join('\n');
}
