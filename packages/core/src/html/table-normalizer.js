import { getDomAdapter, getDomNodeTypes } from '../contracts/runtime.js';
import { resolveDocumentLayout } from '../style/document-layout.js';
import { resolveDocumentStyle } from '../style/document-style.js';

function getTableCellSpan(cell) {
  const colspan = Number.parseInt(cell.getAttribute('colspan') || '1', 10);
  return Number.isFinite(colspan) && colspan > 0 ? colspan : 1;
}

function getTableColumnCount(table) {
  const rows = [...table.querySelectorAll('tr')];
  return Math.max(
    1,
    ...rows.map((row) => [...row.children].reduce((sum, cell) => sum + getTableCellSpan(cell), 0))
  );
}

function preserveBlockquoteLineBreaks(blockquote, doc, nodeFilterCtor) {
  const paragraphs = [...blockquote.querySelectorAll('p')];

  for (const paragraph of paragraphs) {
    const textNodes = [];
    const walker = doc.createTreeWalker(paragraph, nodeFilterCtor.SHOW_TEXT);
    let currentNode = walker.nextNode();

    while (currentNode) {
      textNodes.push(currentNode);
      currentNode = walker.nextNode();
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue;
      if (!text || !text.includes('\n')) {
        continue;
      }

      const fragment = doc.createDocumentFragment();
      const parts = text.split('\n');
      for (let index = 0; index < parts.length; index += 1) {
        if (parts[index] !== '') {
          fragment.appendChild(doc.createTextNode(parts[index]));
        }
        if (index < parts.length - 1) {
          fragment.appendChild(doc.createElement('br'));
        }
      }

      textNode.replaceWith(fragment);
    }
  }
}

function splitBlockquoteParagraphsOnBreaks(blockquote, doc) {
  const paragraphs = [...blockquote.querySelectorAll('p')];

  for (const paragraph of paragraphs) {
    const childNodes = [...paragraph.childNodes];
    if (!childNodes.some((node) => node.nodeName === 'BR')) {
      paragraph.style.margin = '0';
      continue;
    }

    const replacement = doc.createDocumentFragment();
    let nextParagraph = doc.createElement('p');
    nextParagraph.style.margin = '0';

    for (const childNode of childNodes) {
      if (childNode.nodeName === 'BR') {
        if (!nextParagraph.hasChildNodes()) {
          nextParagraph.appendChild(doc.createTextNode(' '));
        }
        replacement.appendChild(nextParagraph);
        nextParagraph = doc.createElement('p');
        nextParagraph.style.margin = '0';
        continue;
      }

      nextParagraph.appendChild(childNode.cloneNode(true));
    }

    if (!nextParagraph.hasChildNodes()) {
      nextParagraph.appendChild(doc.createTextNode(' '));
    }
    replacement.appendChild(nextParagraph);
    paragraph.replaceWith(replacement);
  }
}

function transformBlockquoteToTable(blockquote, doc, resolvedStyle, nodeCtor) {
  const table = doc.createElement('table');
  table.className = 'blockquote-table';
  table.setAttribute('role', 'presentation');
  table.setAttribute('width', '100%');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.tableLayout = 'fixed';
  table.style.margin = '0 0 10pt';

  const row = doc.createElement('tr');
  const cell = doc.createElement('td');
  cell.setAttribute(
    'style',
    [
      'border-top: none',
      'border-right: none',
      'border-bottom: none',
      `border-left: 4px solid ${resolvedStyle.blockquote.borderColor}`,
      `background-color: ${resolvedStyle.blockquote.backgroundColor}`,
      `color: ${resolvedStyle.blockquote.textColor}`,
      `font-style: ${resolvedStyle.blockquote.italic ? 'italic' : 'normal'}`,
      'padding: 6pt 0 6pt 12pt',
      'vertical-align: top',
    ].join('; ')
  );

  const childNodes = [...blockquote.childNodes].filter((node) => {
    return !(node.nodeType === nodeCtor.TEXT_NODE && !node.nodeValue.trim());
  });

  if (childNodes.length === 0) {
    const paragraph = doc.createElement('p');
    paragraph.style.margin = '0';
    paragraph.appendChild(doc.createTextNode(' '));
    cell.appendChild(paragraph);
  } else {
    for (const childNode of childNodes) {
      if (childNode.nodeType === nodeCtor.ELEMENT_NODE && childNode.tagName === 'P') {
        const paragraph = doc.createElement('p');
        paragraph.style.margin = '0';
        const paragraphChildren = [...childNode.childNodes];
        if (paragraphChildren.length === 0) {
          paragraph.appendChild(doc.createTextNode(' '));
        } else {
          for (const paragraphChild of paragraphChildren) {
            paragraph.appendChild(paragraphChild.cloneNode(true));
          }
        }
        cell.appendChild(paragraph);
        continue;
      }

      const paragraph = doc.createElement('p');
      paragraph.style.margin = '0';
      paragraph.appendChild(childNode.cloneNode(true));
      cell.appendChild(paragraph);
    }
  }

  row.appendChild(cell);
  table.appendChild(row);
  blockquote.replaceWith(table);
}

export function normalizeTables(
  html,
  resolvedStyle = resolveDocumentStyle(),
  layoutMetrics = resolveDocumentLayout(resolvedStyle.page.marginPreset),
  runtime = {}
) {
  const dom = getDomAdapter(runtime);
  const doc = dom.parseHtml(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const { Node, NodeFilter } = getDomNodeTypes(runtime, doc);

  const tables = [...doc.querySelectorAll('table')]
    .filter((table) => !table.classList.contains('code-block-table'));

  for (const table of tables) {
    const columnCount = getTableColumnCount(table);
    table.setAttribute('width', String(layoutMetrics.contentWidthPx));
    table.style.width = `${layoutMetrics.contentWidthPx}px`;
    table.style.maxWidth = `${layoutMetrics.contentWidthPx}px`;
    table.style.tableLayout = 'fixed';
    table.style.borderCollapse = 'collapse';

    const cells = [...table.querySelectorAll('th, td')];
    for (const cell of cells) {
      const span = getTableCellSpan(cell);
      const cellWidthPx = Math.max(
        48,
        Math.floor((layoutMetrics.contentWidthPx * span) / columnCount)
      );

      cell.setAttribute('width', String(cellWidthPx));
      cell.style.width = `${cellWidthPx}px`;
      cell.style.maxWidth = `${cellWidthPx}px`;
      cell.style.overflowWrap = 'anywhere';
      cell.style.wordBreak = 'break-word';
      cell.style.whiteSpace = 'normal';

      if (cell.tagName === 'TH') {
        cell.style.backgroundColor = resolvedStyle.tables.headerBackgroundColor;
        cell.style.color = resolvedStyle.tables.headerTextColor;
        cell.style.fontWeight = '700';
      }
    }
  }

  const blockquotes = [...doc.querySelectorAll('blockquote')];
  for (const blockquote of blockquotes) {
    preserveBlockquoteLineBreaks(blockquote, doc, NodeFilter);
    splitBlockquoteParagraphsOnBreaks(blockquote, doc);
    transformBlockquoteToTable(blockquote, doc, resolvedStyle, Node);
  }

  return doc.body.innerHTML;
}