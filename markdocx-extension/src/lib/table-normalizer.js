import { DOCX_CONTENT_WIDTH_PX } from './constants.js';

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

/**
 * Normalize tables and blockquote styles for DOCX output.
 * Uses native DOMParser (available in offscreen document) instead of JSDOM.
 */
export function normalizeTables(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');

  const tables = [...doc.querySelectorAll('table')]
    .filter((table) => !table.classList.contains('code-block-table'));

  for (const table of tables) {
    const columnCount = getTableColumnCount(table);
    table.setAttribute('width', String(DOCX_CONTENT_WIDTH_PX));
    table.style.width = `${DOCX_CONTENT_WIDTH_PX}px`;
    table.style.maxWidth = `${DOCX_CONTENT_WIDTH_PX}px`;
    table.style.tableLayout = 'fixed';
    table.style.borderCollapse = 'collapse';

    const cells = [...table.querySelectorAll('th, td')];
    for (const cell of cells) {
      const span = getTableCellSpan(cell);
      const cellWidthPx = Math.max(
        48,
        Math.floor((DOCX_CONTENT_WIDTH_PX * span) / columnCount)
      );

      cell.setAttribute('width', String(cellWidthPx));
      cell.style.width = `${cellWidthPx}px`;
      cell.style.maxWidth = `${cellWidthPx}px`;
      cell.style.overflowWrap = 'anywhere';
      cell.style.wordBreak = 'break-word';
      cell.style.whiteSpace = 'normal';

      if (cell.tagName === 'TH') {
        cell.style.backgroundColor = '#595959';
        cell.style.color = '#FFFFFF';
        cell.style.fontWeight = '700';
      }
    }
  }

  const blockquotes = [...doc.querySelectorAll('blockquote')];
  for (const blockquote of blockquotes) {
    blockquote.style.display = 'block';
    blockquote.style.backgroundColor = '#EFEFEF';
    blockquote.style.color = '#334155';
    blockquote.style.fontStyle = 'italic';
    blockquote.style.borderLeft = '4px solid #cbd5e1';
    blockquote.style.marginLeft = '0';
    blockquote.style.padding = '6pt 0 6pt 12pt';
  }

  return doc.body.innerHTML;
}
