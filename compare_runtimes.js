import fs from 'fs';
import { createMarkdownRenderer } from './packages/core/src/markdown/md-renderer.js';
import { normalizeTables } from './packages/core/src/html/table-normalizer.js';
import { resolveDocumentStyle } from './packages/core/src/style/document-style.js';
import { createJsdomDomAdapter } from './packages/runtime-node/src/dom-jsdom.js';
import { JSDOM } from 'jsdom';

const markdown = fs.readFileSync('./test-markdown/blockquote-regression.md', 'utf-8');
const renderer = createMarkdownRenderer();
const html = renderer.render(markdown);
const style = resolveDocumentStyle();

// 1. Runtime-node jsdom adapter
const nodeAdapter = createJsdomDomAdapter();
const nodeRuntime = { dom: nodeAdapter };
const nodeDoc = nodeAdapter.parseHtml(html);
normalizeTables(nodeDoc, nodeRuntime, style);
const nodeHtml = nodeDoc.body.innerHTML;

// 2. Browser-like adapter (JSDOM DOMParser based)
const jsdom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
const browserAdapter = {
  parseHtml(html) {
    const parser = new jsdom.window.DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return doc;
  },
  Node: jsdom.window.Node,
  NodeFilter: jsdom.window.NodeFilter,
};
const browserRuntime = { dom: browserAdapter };
const browserDoc = browserAdapter.parseHtml(html);
normalizeTables(browserDoc, browserRuntime, style);
const browserHtml = browserDoc.body.innerHTML;

if (nodeHtml === browserHtml) {
  console.log('HTML output is identical.');
} else {
  console.log('HTML output differs!');
  
  const findDiff = (s1, s2) => {
    let i = 0;
    while (i < s1.length && i < s2.length && s1[i] === s2[i]) i++;
    return i;
  };

  const diffIndex = findDiff(nodeHtml, browserHtml);
  console.log('Difference at index:', diffIndex);
  console.log('Node context:', nodeHtml.substring(Math.max(0, diffIndex - 50), diffIndex + 100));
  console.log('Browser context:', browserHtml.substring(Math.max(0, diffIndex - 50), diffIndex + 100));
}
