export const RUNTIME_CONTRACT_VERSION = '1.1.0';

/**
 * @typedef {object} MarkdocxDomAdapter
 * @property {(html: string) => Document} parseHtml Parse an HTML string into a DOM document.
 * @property {typeof Node} [Node] DOM Node constructor for non-browser runtimes.
 * @property {typeof NodeFilter} [NodeFilter] DOM NodeFilter constructor for non-browser runtimes.
 */

/**
 * @typedef {object} MarkdocxRuntimeContracts
 * Current shared-core runtime contracts are intentionally narrow.
 * The extracted core consumes a DOM adapter directly for HTML normalization.
 * Image inlining and Mermaid rendering are currently host-orchestration inputs,
 * not runtime hooks consumed through this contract surface yet.
 * @property {MarkdocxDomAdapter} [dom]
 */

export function assertRuntimeContracts(runtime = {}) {
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
    throw new TypeError('runtime must be an object');
  }

  if (runtime.dom !== undefined && (!runtime.dom || typeof runtime.dom !== 'object')) {
    throw new TypeError('runtime.dom must be an object');
  }

  if (runtime.dom && typeof runtime.dom.parseHtml !== 'function') {
    throw new TypeError('runtime.dom.parseHtml must be a function');
  }

  if (runtime.dom?.Node !== undefined && typeof runtime.dom.Node !== 'function') {
    throw new TypeError('runtime.dom.Node must be a constructor when provided');
  }

  if (
    runtime.dom?.NodeFilter !== undefined
    && typeof runtime.dom.NodeFilter !== 'function'
    && typeof runtime.dom.NodeFilter !== 'object'
  ) {
    throw new TypeError('runtime.dom.NodeFilter must be a constructor or NodeFilter-like object when provided');
  }

  return runtime;
}

export function getDomAdapter(runtime = {}) {
  const validated = assertRuntimeContracts(runtime);
  const adapter = validated.dom;
  if (!adapter?.parseHtml) {
    throw new Error('A DOM runtime adapter is required. Provide runtime.dom.parseHtml explicitly via a host runtime package.');
  }
  return adapter;
}

export function getDomNodeTypes(runtime = {}, doc = null) {
  const validated = assertRuntimeContracts(runtime);
  const adapter = validated.dom;
  if (!adapter) {
    throw new Error('A DOM runtime adapter is required. Provide runtime.dom when calling DOM normalization helpers.');
  }

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