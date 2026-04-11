const BODY_FONT_OPTIONS = [
  'Calibri',
  'Arial',
  'Cambria',
  'Georgia',
  'Times New Roman',
];

const CODE_FONT_OPTIONS = [
  'Cascadia Code',
  'Consolas',
  'Courier New',
  'Monaco',
];

const ALL_FONT_OPTIONS = [...new Set([...BODY_FONT_OPTIONS, ...CODE_FONT_OPTIONS])];
const SYNTAX_THEME_OPTIONS = ['light', 'dark'];
const STYLE_PRESET_ORDER = ['default', 'minimal', 'report'];

const SYNTAX_THEME_TEXT_COLORS = {
  light: '#24292f',
  dark: '#c9d1d9',
};

const STYLE_PRESETS = {
  default: {
    body: {
      fontFamily: 'Calibri',
      fontSizePt: 11,
      lineHeight: 1.5,
      color: '#111827',
    },
    headings: {
      fontFamily: 'Calibri',
      color: '#0f172a',
    },
    tables: {
      borderColor: '#4b5563',
      headerBackgroundColor: '#595959',
      headerTextColor: '#ffffff',
    },
    code: {
      fontFamily: 'Cascadia Code',
      fontSizePt: 10,
      syntaxTheme: 'light',
      inlineBackgroundColor: '#efefef',
      inlineItalic: true,
      blockBackgroundColor: '#f0f0f0',
      blockBorderColor: '#d1d5db',
      languageBadgeColor: '#475569',
    },
    blockquote: {
      backgroundColor: '#efefef',
      textColor: '#334155',
      borderColor: '#cbd5e1',
      italic: true,
    },
    page: {
      marginPreset: 'default',
    },
  },
  minimal: {
    body: {
      fontFamily: 'Calibri',
      fontSizePt: 11,
      lineHeight: 1.5,
      color: '#111827',
    },
    headings: {
      fontFamily: 'Calibri',
      color: '#0f172a',
    },
    tables: {
      borderColor: '#94a3b8',
      headerBackgroundColor: '#e2e8f0',
      headerTextColor: '#1e293b',
    },
    code: {
      fontFamily: 'Cascadia Code',
      fontSizePt: 10,
      syntaxTheme: 'light',
      inlineBackgroundColor: '#f8fafc',
      inlineItalic: false,
      blockBackgroundColor: '#f8fafc',
      blockBorderColor: '#cbd5e1',
      languageBadgeColor: '#475569',
    },
    blockquote: {
      backgroundColor: '#f8fafc',
      textColor: '#475569',
      borderColor: '#cbd5e1',
      italic: false,
    },
    page: {
      marginPreset: 'compact',
    },
  },
  report: {
    body: {
      fontFamily: 'Calibri',
      fontSizePt: 11,
      lineHeight: 1.5,
      color: '#111827',
    },
    headings: {
      fontFamily: 'Cambria',
      color: '#1f2937',
    },
    tables: {
      borderColor: '#5b728a',
      headerBackgroundColor: '#1f4e79',
      headerTextColor: '#ffffff',
    },
    code: {
      fontFamily: 'Cascadia Code',
      fontSizePt: 10,
      syntaxTheme: 'light',
      inlineBackgroundColor: '#f7f7f7',
      inlineItalic: false,
      blockBackgroundColor: '#f7f7f7',
      blockBorderColor: '#c7cdd4',
      languageBadgeColor: '#425466',
    },
    blockquote: {
      backgroundColor: '#f3f6fa',
      textColor: '#334155',
      borderColor: '#9db2c8',
      italic: false,
    },
    page: {
      marginPreset: 'wide',
    },
  },
};

export const STYLE_PRESET_LABELS = {
  default: 'Default',
  minimal: 'Minimal',
  report: 'Report',
};

export const BODY_FONT_FAMILY_OPTIONS = [...BODY_FONT_OPTIONS];
export const CODE_FONT_FAMILY_OPTIONS = [...CODE_FONT_OPTIONS];
export const FONT_FAMILY_OPTIONS = [...ALL_FONT_OPTIONS];
export const STYLE_SYNTAX_THEME_OPTIONS = [...SYNTAX_THEME_OPTIONS];
export const DOCUMENT_STYLE_PRESET_ORDER = [...STYLE_PRESET_ORDER];
export const DEFAULT_STYLE_OPTIONS = Object.freeze({
  preset: 'default',
  overrides: {},
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, override) {
  const result = clone(base);
  if (!isPlainObject(override)) {
    return result;
  }

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeDeep(result[key], value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function normalizeFontFamily(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function normalizeNumber(value, fallback, min, max, fractionDigits = null) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const clamped = Math.min(max, Math.max(min, parsed));
  return fractionDigits === null ? Math.round(clamped) : Number(clamped.toFixed(fractionDigits));
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeChoice(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function normalizeResolvedStyle(style, preset) {
  const resolved = clone(style);

  resolved.body.fontFamily = normalizeFontFamily(resolved.body.fontFamily, ALL_FONT_OPTIONS, STYLE_PRESETS[preset].body.fontFamily);
  resolved.body.fontSizePt = normalizeNumber(resolved.body.fontSizePt, STYLE_PRESETS[preset].body.fontSizePt, 9, 14);
  resolved.body.lineHeight = normalizeNumber(resolved.body.lineHeight, STYLE_PRESETS[preset].body.lineHeight, 1.2, 1.8, 2);
  resolved.body.color = normalizeHexColor(resolved.body.color, STYLE_PRESETS[preset].body.color);

  resolved.headings.fontFamily = normalizeFontFamily(resolved.headings.fontFamily, ALL_FONT_OPTIONS, STYLE_PRESETS[preset].headings.fontFamily);
  resolved.headings.color = normalizeHexColor(resolved.headings.color, STYLE_PRESETS[preset].headings.color);

  resolved.tables.borderColor = normalizeHexColor(resolved.tables.borderColor, STYLE_PRESETS[preset].tables.borderColor);
  resolved.tables.headerBackgroundColor = normalizeHexColor(
    resolved.tables.headerBackgroundColor,
    STYLE_PRESETS[preset].tables.headerBackgroundColor
  );
  resolved.tables.headerTextColor = normalizeHexColor(resolved.tables.headerTextColor, STYLE_PRESETS[preset].tables.headerTextColor);

  resolved.code.fontFamily = normalizeFontFamily(resolved.code.fontFamily, CODE_FONT_OPTIONS, STYLE_PRESETS[preset].code.fontFamily);
  resolved.code.fontSizePt = normalizeNumber(resolved.code.fontSizePt, STYLE_PRESETS[preset].code.fontSizePt, 8, 13);
  resolved.code.syntaxTheme = normalizeChoice(resolved.code.syntaxTheme, SYNTAX_THEME_OPTIONS, STYLE_PRESETS[preset].code.syntaxTheme);
  resolved.code.inlineBackgroundColor = normalizeHexColor(
    resolved.code.inlineBackgroundColor,
    STYLE_PRESETS[preset].code.inlineBackgroundColor
  );
  resolved.code.inlineItalic = normalizeBoolean(resolved.code.inlineItalic, STYLE_PRESETS[preset].code.inlineItalic);
  resolved.code.blockBackgroundColor = normalizeHexColor(
    resolved.code.blockBackgroundColor,
    STYLE_PRESETS[preset].code.blockBackgroundColor
  );
  resolved.code.blockBorderColor = normalizeHexColor(
    resolved.code.blockBorderColor,
    STYLE_PRESETS[preset].code.blockBorderColor
  );
  resolved.code.languageBadgeColor = normalizeHexColor(
    resolved.code.languageBadgeColor,
    STYLE_PRESETS[preset].code.languageBadgeColor
  );
  resolved.code.textColor = SYNTAX_THEME_TEXT_COLORS[resolved.code.syntaxTheme];

  resolved.blockquote.backgroundColor = normalizeHexColor(
    resolved.blockquote.backgroundColor,
    STYLE_PRESETS[preset].blockquote.backgroundColor
  );
  resolved.blockquote.textColor = normalizeHexColor(resolved.blockquote.textColor, STYLE_PRESETS[preset].blockquote.textColor);
  resolved.blockquote.borderColor = normalizeHexColor(
    resolved.blockquote.borderColor,
    STYLE_PRESETS[preset].blockquote.borderColor
  );
  resolved.blockquote.italic = normalizeBoolean(resolved.blockquote.italic, STYLE_PRESETS[preset].blockquote.italic);

  resolved.page.marginPreset = normalizeChoice(resolved.page.marginPreset, ['default', 'compact', 'wide'], STYLE_PRESETS[preset].page.marginPreset);
  resolved.preset = preset;

  return resolved;
}

export function getPresetStyleOptions(preset = 'default') {
  const normalizedPreset = STYLE_PRESET_ORDER.includes(preset) ? preset : 'default';
  return { preset: normalizedPreset, overrides: {} };
}

export function getPresetResolvedStyle(preset = 'default') {
  return resolveDocumentStyle(getPresetStyleOptions(preset));
}

export function resolveDocumentStyle(styleOptions = DEFAULT_STYLE_OPTIONS) {
  const preset = normalizeChoice(styleOptions?.preset, STYLE_PRESET_ORDER, 'default');
  const overrides = isPlainObject(styleOptions?.overrides) ? styleOptions.overrides : {};
  const merged = mergeDeep(STYLE_PRESETS[preset], overrides);
  return normalizeResolvedStyle(merged, preset);
}