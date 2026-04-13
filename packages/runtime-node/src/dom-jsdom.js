import { JSDOM } from 'jsdom';

export function createJsdomDomAdapter() {
  const baseDom = new JSDOM('<!DOCTYPE html><html><body></body></html>');

  return {
    parseHtml(html) {
      return new JSDOM(html).window.document;
    },
    Node: baseDom.window.Node,
    NodeFilter: baseDom.window.NodeFilter,
  };
}

export function createNodeRuntime({ dom = createJsdomDomAdapter() } = {}) {
  return {
    dom,
  };
}
