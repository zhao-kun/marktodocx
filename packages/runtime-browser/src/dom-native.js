export function createNativeDomAdapter() {
  if (typeof DOMParser !== 'function') {
    throw new Error('Native DOMParser is unavailable. @marktodocx/runtime-browser requires a browser-like DOM environment.');
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

export function createBrowserRuntime() {
  return {
    dom: createNativeDomAdapter(),
  };
}
