import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';

hljs.registerLanguage('python', python);
hljs.registerLanguage('go', go);
hljs.registerLanguage('java', java);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('py', python);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);

const COLOR_PALETTES = {
  light: {
    'hljs-title function_': '#8250df',
    'hljs-title class_': '#8250df',
    'hljs-variable language_': '#cf222e',
    'hljs-variable constant_': '#0550ae',
    'hljs-meta keyword_': '#cf222e',
    'hljs-meta string_': '#0a3069',
    'hljs-keyword': '#cf222e',
    'hljs-built_in': '#8250df',
    'hljs-type': '#8250df',
    'hljs-string': '#0a3069',
    'hljs-number': '#0550ae',
    'hljs-literal': '#0550ae',
    'hljs-comment': '#6e7781',
    'hljs-title': '#8250df',
    'hljs-variable': '#953800',
    'hljs-attr': '#0550ae',
    'hljs-operator': '#cf222e',
    'hljs-property': '#0550ae',
    'hljs-meta': '#6e7781',
    'hljs-section': '#0550ae',
    'hljs-regexp': '#0a3069',
    'hljs-symbol': '#0550ae',
    'hljs-doctag': '#cf222e',
  },
  dark: {
    'hljs-title function_': '#d2a8ff',
    'hljs-title class_': '#d2a8ff',
    'hljs-variable language_': '#ff7b72',
    'hljs-variable constant_': '#79c0ff',
    'hljs-meta keyword_': '#ff7b72',
    'hljs-meta string_': '#a5d6ff',
    'hljs-keyword': '#ff7b72',
    'hljs-built_in': '#d2a8ff',
    'hljs-type': '#d2a8ff',
    'hljs-string': '#a5d6ff',
    'hljs-number': '#79c0ff',
    'hljs-literal': '#79c0ff',
    'hljs-comment': '#8b949e',
    'hljs-title': '#d2a8ff',
    'hljs-variable': '#ffa657',
    'hljs-attr': '#79c0ff',
    'hljs-operator': '#ff7b72',
    'hljs-property': '#79c0ff',
    'hljs-meta': '#8b949e',
    'hljs-section': '#79c0ff',
    'hljs-regexp': '#a5d6ff',
    'hljs-symbol': '#79c0ff',
    'hljs-doctag': '#ff7b72',
  },
};

/**
 * Resolve a class attribute value to an inline color.
 * Tries full value first (compound match), then first class only (primary match).
 * Returns null if no match — caller should unwrap the span.
 */
function resolveColor(classValue, palette) {
  // Compound match: e.g. "hljs-title function_"
  if (palette[classValue]) return palette[classValue];
  // Primary match: first class only, e.g. "hljs-title" from "hljs-title function_"
  const primary = classValue.split(' ')[0];
  if (palette[primary]) return palette[primary];
  return null;
}

/**
 * Replace class="..." attributes with style="color: ..." on span elements.
 * Spans with no matching color become bare <span> tags (no attributes),
 * preserving DOM balance. The text inside inherits the default code block color.
 */
function classesToInlineStyles(html, palette) {
  return html.replace(/<span class="([^"]*)">/g, (match, classValue) => {
    const color = resolveColor(classValue, palette);
    if (color) return `<span style="color: ${color};">`;
    return '<span>';
  });
}

/**
 * Split highlighted HTML into lines, keeping spans balanced across line breaks.
 *
 * highlight.js tokens can span multiple lines (e.g. block comments, multi-line strings).
 * A single <span> may contain \n characters. Naively splitting on \n would produce
 * unbalanced markup. This function tracks open spans and re-opens them on each new line.
 */
function splitLinesBalanced(html) {
  const lines = [];
  let current = '';
  const spanStack = []; // stack of opening span tags (e.g. '<span style="color: #6e7781;">')
  let i = 0;

  while (i < html.length) {
    if (html[i] === '\n') {
      // Close all open spans for this line
      for (let s = spanStack.length - 1; s >= 0; s--) {
        current += '</span>';
      }
      lines.push(current);
      // Start new line, re-open all spans from stack
      current = '';
      for (const tag of spanStack) {
        current += tag;
      }
      i++;
    } else if (html[i] === '<') {
      // Check for closing </span>
      if (html.startsWith('</span>', i)) {
        current += '</span>';
        spanStack.pop();
        i += 7;
      } else {
        // Opening tag — extract until >
        const end = html.indexOf('>', i);
        if (end === -1) {
          current += html[i];
          i++;
          continue;
        }
        const tag = html.slice(i, end + 1);
        current += tag;
        // Track <span> and <span ...> tags (not self-closing)
        if ((tag === '<span>' || tag.startsWith('<span ')) && !tag.endsWith('/>')) {
          spanStack.push(tag);
        }
        i = end + 1;
      }
    } else {
      current += html[i];
      i++;
    }
  }

  // Push the last line
  lines.push(current);
  return lines;
}

/**
 * Tag-aware whitespace preservation.
 * Replaces spaces → &nbsp; and tabs → &nbsp;&nbsp;&nbsp;&nbsp; in text content only,
 * leaving HTML tags untouched. This prevents escaping <span> tags that carry
 * syntax highlighting styles.
 */
function preserveWhitespaceTagAware(html) {
  // Match either HTML tags or inter-tag text segments
  return html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag; // Leave tags untouched
    return text
      .replaceAll('\t', '&nbsp;&nbsp;&nbsp;&nbsp;')
      .replaceAll(' ', '&nbsp;');
  });
}

/**
 * Highlight a code block with syntax coloring.
 *
 * @param {string} code - Raw code string
 * @param {string} language - Language identifier from fence info
 * @returns {string[] | null} Array of per-line HTML strings with balanced tags,
 *   inline styles, and preserved whitespace. Returns null if the language is
 *   not supported (caller should use the monochrome fallback path).
 */
export function highlightCode(code, language, syntaxTheme = 'light') {
  if (!language) return null;
  const lang = language.toLowerCase();
  if (!hljs.getLanguage(lang)) return null;
  const palette = COLOR_PALETTES[syntaxTheme] || COLOR_PALETTES.light;

  // Strip trailing newline — markdown-it fence content always ends with \n,
  // which would produce a spurious empty line after splitting
  const trimmed = code.endsWith('\n') ? code.slice(0, -1) : code;

  let highlighted;
  try {
    highlighted = hljs.highlight(trimmed, { language: lang, ignoreIllegals: true });
  } catch {
    return null;
  }

  // Convert class attributes to inline styles
  const html = classesToInlineStyles(highlighted.value, palette);

  // Split into lines with balanced spans
  const lines = splitLinesBalanced(html);

  // Apply tag-aware whitespace preservation and handle empty lines
  return lines.map((line) => {
    if (line === '') return '&nbsp;';
    return preserveWhitespaceTagAware(line);
  });
}
