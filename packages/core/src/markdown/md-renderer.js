import MarkdownIt from 'markdown-it';

import { HIDDEN_CODE_BLOCK_LANGUAGES } from '../constants.js';
import { resolveDocumentStyle } from '../style/document-style.js';
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

function renderInlineCodeHtml(content, resolvedStyle) {
  const inlineCodeHtml = `<span class="inline-code" style="background-color: ${resolvedStyle.code.inlineBackgroundColor}; color: ${resolvedStyle.code.textColor};">${preserveInlineCodeWhitespace(content)}</span>`;
  return resolvedStyle.code.inlineItalic ? `<i>${inlineCodeHtml}</i>` : inlineCodeHtml;
}

function renderCodeBlockHtml(content, resolvedStyle, language = '') {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const showLanguageBadge = language && !HIDDEN_CODE_BLOCK_LANGUAGES.has(language.toLowerCase());
  const languageBadge = showLanguageBadge
    ? `<div class="code-block-language" style="color: ${resolvedStyle.code.languageBadgeColor};">${escapeHtml(language)}</div>`
    : '';

  const highlightedLines = highlightCode(normalized, language, resolvedStyle.code.syntaxTheme);

  let lineHtmls;
  if (highlightedLines) {
    lineHtmls = highlightedLines;
  } else {
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
    `    <td class="code-block-cell" style="border: 1px solid ${resolvedStyle.code.blockBorderColor}; background-color: ${resolvedStyle.code.blockBackgroundColor}; color: ${resolvedStyle.code.textColor}; padding: 8pt 10pt;">`,
    languageBadge,
    renderedLines,
    '    </td>',
    '  </tr>',
    '</table>',
  ].join('\n');
}

export function assertCanonicalRenderedMermaidFragment(fragment, index = null) {
  if (typeof fragment !== 'string' || fragment.trim() === '') {
    throw new TypeError('Rendered Mermaid output must be a non-empty HTML fragment string');
  }

  const trimmed = fragment.trim();
  const wrapperMatch = trimmed.match(/^<div class="mermaid-diagram">\s*([\s\S]*?)\s*<\/div>$/);
  if (!wrapperMatch) {
    throw new TypeError('Rendered Mermaid output must use the canonical <div class="mermaid-diagram"> wrapper');
  }

  const imgTags = [...wrapperMatch[1].matchAll(/<img\b[^>]*>/g)].map((match) => match[0]);
  if (imgTags.length !== 1) {
    throw new TypeError('Rendered Mermaid output must contain exactly one <img> element');
  }

  const imgTag = imgTags[0];
  if (!/src="data:image\/png;base64,[^"]+"/.test(imgTag)) {
    throw new TypeError('Rendered Mermaid output must embed a PNG data URI');
  }

  const expectedAlt = index === null ? null : `Mermaid diagram ${index + 1}`;
  if (expectedAlt) {
    if (!imgTag.includes(`alt="${expectedAlt}"`)) {
      throw new TypeError(`Rendered Mermaid output must include alt="${expectedAlt}"`);
    }
  } else if (!/alt="Mermaid diagram \d+"/.test(imgTag)) {
    throw new TypeError('Rendered Mermaid output must include a canonical Mermaid diagram alt label');
  }

  return trimmed;
}

export function createMarkdownRenderer(styleInput = resolveDocumentStyle()) {
  const resolvedStyle = styleInput?.body ? styleInput : resolveDocumentStyle(styleInput);
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
  });

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const language = token.info.trim().split(/\s+/)[0];

    if (language === 'mermaid') {
      const mermaidIndex = Number.isInteger(env.mermaidRenderIndex) ? env.mermaidRenderIndex : 0;
      env.mermaidRenderIndex = mermaidIndex + 1;

      if (env.renderedMermaid && env.renderedMermaid.length > 0) {
        const fragment = assertCanonicalRenderedMermaidFragment(env.renderedMermaid.shift(), mermaidIndex);
        return `${fragment}\n`;
      }
      return `${renderCodeBlockHtml(token.content, resolvedStyle, 'mermaid')}\n`;
    }

    return `${renderCodeBlockHtml(token.content, resolvedStyle, language)}\n`;
  };

  md.renderer.rules.code_block = (tokens, idx) => {
    const token = tokens[idx];
    return `${renderCodeBlockHtml(token.content, resolvedStyle)}\n`;
  };

  md.renderer.rules.code_inline = (tokens, idx) => {
    const token = tokens[idx];
    return renderInlineCodeHtml(token.content, resolvedStyle);
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