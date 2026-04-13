export const RUNTIME_CONTRACT_VERSION = '1.0.0';

/**
 * @typedef {object} MarkdocxDomAdapter
 * @property {(html: string) => Document} parseHtml Parse an HTML string into a DOM document.
 * @property {typeof Node} [Node] DOM Node constructor for non-browser runtimes.
 * @property {typeof NodeFilter} [NodeFilter] DOM NodeFilter constructor for non-browser runtimes.
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

function createBrowserDomAdapter() {
  if (typeof DOMParser !== 'function') {
    return null;
  }

  return {
    parseHtml(html) {
      const parser = new DOMParser();
      return parser.parseFromString(html, 'text/html');
    },
    Node: typeof Node === 'function' ? Node : undefined,
    NodeFilter: typeof NodeFilter !== 'undefined' ? NodeFilter : undefined,
  };
}

export function getDomAdapter(runtime = {}) {
  const validated = assertRuntimeContracts(runtime);
  const adapter = validated.dom || createBrowserDomAdapter();
  if (!adapter?.parseHtml) {
    throw new Error('A DOM runtime adapter is required. Provide runtime.dom.parseHtml in non-browser hosts.');
  }
  return adapter;
}

export function getDomNodeTypes(runtime = {}, doc = null) {
  const adapter = runtime.dom || {};
  const defaultView = doc?.defaultView;
  const nodeCtor = adapter.Node || defaultView?.Node || globalThis.Node;
  const nodeFilterCtor = adapter.NodeFilter || defaultView?.NodeFilter || globalThis.NodeFilter;

  if (!nodeCtor || !nodeFilterCtor) {
    throw new Error('DOM Node and NodeFilter constructors are unavailable. Provide them via runtime.dom for non-browser hosts.');
  }

  return {
    Node: nodeCtor,
    NodeFilter: nodeFilterCtor,
  };
}