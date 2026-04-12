export const RUNTIME_CONTRACT_VERSION = '1.0.0';

/**
 * @typedef {object} MarkdocxDomAdapter
 * @property {(html: string) => Document} parseHtml Parse an HTML string into a DOM document.
 */

/**
 * @typedef {object} MarkdocxImageResolver
 * @property {(html: string, context: { imageMap?: Record<string, string>, mdRelativeDir?: string }) => string | Promise<string>} inlineImages
 * Inline host-resolved local images into rendered HTML.
 */

/**
 * @typedef {object} MarkdocxMermaidRenderer
 * @property {(code: string, index: number, layoutMetrics: object) => Promise<{ svg?: string, pngDataUri: string, displayWidth: number, displayHeight: number }> } render
 * Render Mermaid source into a rasterized artifact suitable for DOCX embedding.
 */

/**
 * @typedef {object} MarkdocxRuntimeContracts
 * @property {MarkdocxDomAdapter} [dom]
 * @property {MarkdocxImageResolver} [images]
 * @property {MarkdocxMermaidRenderer} [mermaid]
 */

export function assertRuntimeContracts(runtime = {}) {
  if (runtime.dom && typeof runtime.dom.parseHtml !== 'function') {
    throw new TypeError('runtime.dom.parseHtml must be a function');
  }

  if (runtime.images && typeof runtime.images.inlineImages !== 'function') {
    throw new TypeError('runtime.images.inlineImages must be a function');
  }

  if (runtime.mermaid && typeof runtime.mermaid.render !== 'function') {
    throw new TypeError('runtime.mermaid.render must be a function');
  }

  return runtime;
}