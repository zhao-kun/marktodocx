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

function resolveColor(classValue, palette) {
  if (palette[classValue]) return palette[classValue];
  const primary = classValue.split(' ')[0];
  if (palette[primary]) return palette[primary];
  return null;
}

function classesToInlineStyles(html, palette) {
  return html.replace(/<span class="([^"]*)">/g, (match, classValue) => {
    const color = resolveColor(classValue, palette);
    if (color) return `<span style="color: ${color};">`;
    return '<span>';
  });
}

function splitLinesBalanced(html) {
  const lines = [];
  let current = '';
  const spanStack = [];
  let index = 0;

  while (index < html.length) {
    if (html[index] === '\n') {
      for (let stackIndex = spanStack.length - 1; stackIndex >= 0; stackIndex -= 1) {
        current += '</span>';
      }
      lines.push(current);
      current = '';
      for (const tag of spanStack) {
        current += tag;
      }
      index += 1;
    } else if (html[index] === '<') {
      if (html.startsWith('</span>', index)) {
        current += '</span>';
        spanStack.pop();
        index += 7;
      } else {
        const end = html.indexOf('>', index);
        if (end === -1) {
          current += html[index];
          index += 1;
          continue;
        }
        const tag = html.slice(index, end + 1);
        current += tag;
        if ((tag === '<span>' || tag.startsWith('<span ')) && !tag.endsWith('/>')) {
          spanStack.push(tag);
        }
        index = end + 1;
      }
    } else {
      current += html[index];
      index += 1;
    }
  }

  lines.push(current);
  return lines;
}

function preserveWhitespaceTagAware(html) {
  return html.replace(/(<[^>]*>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag;
    return text
      .replaceAll('\t', '&nbsp;&nbsp;&nbsp;&nbsp;')
      .replaceAll(' ', '&nbsp;');
  });
}

export function highlightCode(code, language, syntaxTheme = 'light') {
  if (!language) return null;
  const lang = language.toLowerCase();
  if (!hljs.getLanguage(lang)) return null;
  const palette = COLOR_PALETTES[syntaxTheme] || COLOR_PALETTES.light;

  const trimmed = code.endsWith('\n') ? code.slice(0, -1) : code;

  let highlighted;
  try {
    highlighted = hljs.highlight(trimmed, { language: lang, ignoreIllegals: true });
  } catch {
    return null;
  }

  const html = classesToInlineStyles(highlighted.value, palette);
  const lines = splitLinesBalanced(html);

  return lines.map((line) => {
    if (line === '') return '&nbsp;';
    return preserveWhitespaceTagAware(line);
  });
}