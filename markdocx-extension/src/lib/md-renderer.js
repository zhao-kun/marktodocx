import MarkdownIt from 'markdown-it';
import { HIDDEN_CODE_BLOCK_LANGUAGES } from './constants.js';
import { highlightCode } from './syntax-highlighter.js';

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function preserveCodeWhitespace(line) {
  return escapeHtml(line)
    .replaceAll('\t', '&nbsp;&nbsp;&nbsp;&nbsp;')
    .replaceAll(' ', '&nbsp;');
}

function preserveInlineCodeWhitespace(text) {
  return escapeHtml(text)
    .replaceAll('\t', '&nbsp;&nbsp;&nbsp;&nbsp;')
    .replaceAll(' ', '&nbsp;');
}

function renderInlineCodeHtml(content) {
  return `<i><span class="inline-code" style="background-color: #EFEFEF;">${preserveInlineCodeWhitespace(content)}</span></i>`;
}

function renderCodeBlockHtml(content, language = '') {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const showLanguageBadge = language && !HIDDEN_CODE_BLOCK_LANGUAGES.has(language.toLowerCase());
  const languageBadge = showLanguageBadge
    ? `<div class="code-block-language">${escapeHtml(language)}</div>`
    : '';

  // Try syntax highlighting for supported languages
  const highlightedLines = highlightCode(normalized, language);

  let lineHtmls;
  if (highlightedLines) {
    // Highlighted path — lines already have inline styles and preserved whitespace
    lineHtmls = highlightedLines;
  } else {
    // Monochrome fallback — original path for unsupported languages
    const lines = normalized.split('\n');
    const trailingEmptyLine = lines.length > 1 && lines.at(-1) === '';
    const visibleLines = trailingEmptyLine ? lines.slice(0, -1) : lines;
    lineHtmls = (visibleLines.length === 0 ? [''] : visibleLines)
      .map((line) => line === '' ? '&nbsp;' : preserveCodeWhitespace(line));
  }
  const renderedLines = lineHtmls
    .map((lineHtml) => `<div class="code-block-line">${lineHtml}</div>`)
    .join('');

  return [
    '<table class="code-block-table" role="presentation" width="100%" style="width: 100%; border-collapse: collapse; table-layout: fixed;">',
    '  <tr>',
    '    <td class="code-block-cell" style="border: 1px solid #d1d5db; background-color: #F0F0F0; padding: 8pt 10pt;">',
    languageBadge,
    renderedLines,
    '    </td>',
    '  </tr>',
    '</table>',
  ].join('\n');
}

export function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
  });

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/)[0];

    if (language === 'mermaid') {
      if (env.renderedMermaid && env.renderedMermaid.length > 0) {
        return `${env.renderedMermaid.shift()}\n`;
      }
      // Fallback: if mermaid rendering was skipped or failed, show source
      return `${renderCodeBlockHtml(token.content, 'mermaid')}\n`;
    }

    return `${renderCodeBlockHtml(token.content, language)}\n`;
  };

  md.renderer.rules.code_block = (tokens, idx) => {
    const token = tokens[idx];
    return `${renderCodeBlockHtml(token.content)}\n`;
  };

  md.renderer.rules.code_inline = (tokens, idx) => {
    const token = tokens[idx];
    return renderInlineCodeHtml(token.content);
  };

  return md;
}

export function extractMermaidBlocks(markdown, md) {
  const tokens = md.parse(markdown, {});
  return tokens
    .filter((token) => token.type === 'fence')
    .filter((token) => token.info.trim().split(/\s+/)[0] === 'mermaid')
    .map((token) => token.content);
}
