import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';
import {
  FLOWCHART_NODE_SPACING,
  FLOWCHART_RANK_SPACING,
  FLOWCHART_WRAPPING_WIDTH,
  MERMAID_RENDER_SCALE,
  resolveDocumentLayout,
} from '@marktodocx/core';

const BUNDLED_MERMAID_CJK_FONT_FAMILY = 'Marktodocx Mermaid CJK';
const BUNDLED_MERMAID_LATIN_FONT_FAMILY = 'Marktodocx Mermaid Latin';
const MERMAID_FONT_STACK = [
  `"${BUNDLED_MERMAID_LATIN_FONT_FAMILY}"`,
  `"${BUNDLED_MERMAID_CJK_FONT_FAMILY}"`,
  '"Noto Sans SC"',
  '"Noto Sans CJK SC"',
  '"Microsoft YaHei"',
  '"PingFang SC"',
  'Helvetica',
  'Arial',
  'sans-serif',
].join(', ');

let bundledMermaidFontFaceCssPromise;

function getMermaidConfig() {
  return {
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    markdownAutoWrap: true,
    fontFamily: MERMAID_FONT_STACK,
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

function diagramNeedsBundledCjkFont(code) {
  return /[\u3000-\u303F\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(code);
}

function getDefaultLaunchOptions({
  allowNoSandbox = process.env.MARKTODOCX_PUPPETEER_NO_SANDBOX === '1' || process.env.CI === 'true',
  args: extraArgs = [],
} = {}) {
  const sandboxArgs = allowNoSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
  const mergedArgs = [...new Set([
    ...sandboxArgs,
    ...(Array.isArray(extraArgs) ? extraArgs : []),
  ])];

  return {
    headless: 'new',
    args: mergedArgs,
  };
}

function getMermaidBundlePath() {
  if (typeof import.meta.resolve === 'function') {
    return fileURLToPath(import.meta.resolve('mermaid/dist/mermaid.min.js'));
  }

  return fileURLToPath(new URL('../../../node_modules/mermaid/dist/mermaid.min.js', import.meta.url));
}

function getBundledNotoSansScFontPath(fileName) {
  if (typeof import.meta.resolve === 'function') {
    return fileURLToPath(import.meta.resolve(`@fontsource/noto-sans-sc/files/${fileName}`));
  }

  return fileURLToPath(new URL(`../../../node_modules/@fontsource/noto-sans-sc/files/${fileName}`, import.meta.url));
}

async function getBundledMermaidFontFaceCss() {
  if (!bundledMermaidFontFaceCssPromise) {
    bundledMermaidFontFaceCssPromise = (async () => {
      const [latinFontBytes, cjkFontBytes] = await Promise.all([
        fs.readFile(getBundledNotoSansScFontPath('noto-sans-sc-latin-400-normal.woff2')),
        fs.readFile(getBundledNotoSansScFontPath('noto-sans-sc-chinese-simplified-400-normal.woff2')),
      ]);

      const latinFontDataUri = `data:font/woff2;base64,${latinFontBytes.toString('base64')}`;
      const cjkFontDataUri = `data:font/woff2;base64,${cjkFontBytes.toString('base64')}`;

      return [
        '@font-face {',
        `  font-family: '${BUNDLED_MERMAID_LATIN_FONT_FAMILY}';`,
        '  font-style: normal;',
        '  font-display: block;',
        '  font-weight: 400;',
        `  src: url(${JSON.stringify(latinFontDataUri)}) format('woff2');`,
        '}',
        '@font-face {',
        `  font-family: '${BUNDLED_MERMAID_CJK_FONT_FAMILY}';`,
        '  font-style: normal;',
        '  font-display: block;',
        '  font-weight: 400;',
        `  src: url(${JSON.stringify(cjkFontDataUri)}) format('woff2');`,
        '}',
        ':root {',
        `  --marktodocx-mermaid-font-family: ${MERMAID_FONT_STACK};`,
        '}',
        'svg, svg *, text, tspan, foreignObject, foreignObject *, body, div, span, p {',
        '  font-family: var(--marktodocx-mermaid-font-family) !important;',
        '}',
      ].join('\n');
    })();
  }

  return bundledMermaidFontFaceCssPromise;
}

function renderImageTag(artifact, index) {
  return [
    '<div class="mermaid-diagram">',
    `  <img src="${artifact.pngDataUri}" alt="Mermaid diagram ${index + 1}" width="${artifact.displayWidth}" height="${artifact.displayHeight}" style="width: ${artifact.displayWidth}px; height: ${artifact.displayHeight}px;" />`,
    '</div>',
  ].join('\n');
}

export async function createPuppeteerMermaidRenderer({
  launchOptions,
  viewport = { width: 1600, height: 1200, deviceScaleFactor: 1 },
} = {}) {
  const resolvedLaunchOptions = launchOptions || {};
  const defaultLaunchOptions = getDefaultLaunchOptions(resolvedLaunchOptions);
  const browser = await puppeteer.launch({
    ...defaultLaunchOptions,
    ...resolvedLaunchOptions,
    args: defaultLaunchOptions.args,
  });

  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto('about:blank');
  await page.addScriptTag({ path: getMermaidBundlePath() });

  async function renderArtifacts(code, index, layoutMetrics = resolveDocumentLayout()) {
    const bundledMermaidFontFaceCss = diagramNeedsBundledCjkFont(code)
      ? await getBundledMermaidFontFaceCss()
      : '';

    return page.evaluate(
      async ({ code, index, layoutMetrics, mermaidConfig, scale, bundledMermaidFontFaceCss }) => {
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
            img.onerror = () => reject(new Error('Failed to load SVG as image'));
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
            svgWidth = Number.parseFloat(parts[2]);
            svgHeight = Number.parseFloat(parts[3]);
          }

          if (!svgWidth || !svgHeight) {
            const rawWidth = svgEl.getAttribute('width');
            const rawHeight = svgEl.getAttribute('height');
            if (rawWidth && /^[\d.]+$/.test(rawWidth)) svgWidth = Number.parseFloat(rawWidth);
            if (rawHeight && /^[\d.]+$/.test(rawHeight)) svgHeight = Number.parseFloat(rawHeight);
          }

          return {
            svgWidth: svgWidth || 800,
            svgHeight: svgHeight || 600,
          };
        }

        function injectSvgFontFaceStyles(svg, fontFaceCss) {
          if (typeof fontFaceCss !== 'string' || fontFaceCss.trim() === '') {
            return svg;
          }

          const parser = new DOMParser();
          const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
          const svgEl = svgDoc.documentElement;
          const namespaceUri = 'http://www.w3.org/2000/svg';
          let defs = svgEl.querySelector('defs');

          if (!defs) {
            defs = svgDoc.createElementNS(namespaceUri, 'defs');
            svgEl.insertBefore(defs, svgEl.firstChild);
          }

          const styleEl = svgDoc.createElementNS(namespaceUri, 'style');
          styleEl.setAttribute('type', 'text/css');
          styleEl.textContent = fontFaceCss;
          defs.prepend(styleEl);

          return new XMLSerializer().serializeToString(svgEl);
        }

        const mermaidApi = window.mermaid;
        mermaidApi.initialize(mermaidConfig);
        const { svg } = await mermaidApi.render(`marktodocx-node-mermaid-${index}`, code);
        const resolvedSvg = injectSvgFontFaceStyles(svg, bundledMermaidFontFaceCss);
        const { svgWidth, svgHeight } = extractSvgDimensions(resolvedSvg);
        const canvasWidth = Math.ceil(svgWidth * scale);
        const canvasHeight = Math.ceil(svgHeight * scale);
        const image = await loadSvgAsImage(resolvedSvg);

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.clearRect(0, 0, canvasWidth, canvasHeight);
        context.drawImage(image, 0, 0, canvasWidth, canvasHeight);

        const bounds = findTrimBounds(context.getImageData(0, 0, canvasWidth, canvasHeight));
        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = bounds.width;
        trimmedCanvas.height = bounds.height;
        const trimmedContext = trimmedCanvas.getContext('2d');
        trimmedContext.putImageData(
          context.getImageData(bounds.left, bounds.top, bounds.width, bounds.height),
          0,
          0
        );

        const naturalWidth = Math.round(bounds.width / scale);
        const naturalHeight = Math.round(bounds.height / scale);
        let displayWidth = Math.min(naturalWidth, layoutMetrics.contentWidthPx);
        let displayHeight = Math.round(naturalHeight * (displayWidth / naturalWidth));

        if (displayHeight > layoutMetrics.contentHeightPx) {
          displayHeight = layoutMetrics.contentHeightPx;
          displayWidth = Math.round(naturalWidth * (displayHeight / naturalHeight));
        }

        return {
          svg: resolvedSvg,
          pngDataUri: trimmedCanvas.toDataURL('image/png'),
          naturalWidth,
          naturalHeight,
          displayWidth,
          displayHeight,
        };
      },
      {
        code,
        index,
        layoutMetrics,
        mermaidConfig: getMermaidConfig(),
        scale: MERMAID_RENDER_SCALE,
        bundledMermaidFontFaceCss,
      }
    );
  }

  return {
    async renderMermaidArtifacts(code, index, layoutMetrics = resolveDocumentLayout()) {
      return renderArtifacts(code, index, layoutMetrics);
    },
    async renderMermaidToImageTag(code, index, layoutMetrics = resolveDocumentLayout()) {
      const artifact = await renderArtifacts(code, index, layoutMetrics);
      return renderImageTag(artifact, index);
    },
    async close() {
      await page.close();
      await browser.close();
    },
  };
}

export async function renderMermaidArtifactsInNode(code, index, layoutMetrics = resolveDocumentLayout(), options) {
  const renderer = await createPuppeteerMermaidRenderer(options);
  try {
    return await renderer.renderMermaidArtifacts(code, index, layoutMetrics);
  } finally {
    await renderer.close();
  }
}

export async function renderMermaidToImageTagInNode(code, index, layoutMetrics = resolveDocumentLayout(), options) {
  const renderer = await createPuppeteerMermaidRenderer(options);
  try {
    return await renderer.renderMermaidToImageTag(code, index, layoutMetrics);
  } finally {
    await renderer.close();
  }
}