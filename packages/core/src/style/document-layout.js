import { DOCX_PAGE_SIZE, TWIPS_PER_PIXEL } from '../constants.js';

const MARGIN_PRESETS = {
  default: { top: 1080, right: 900, bottom: 1080, left: 900 },
  compact: { top: 720, right: 720, bottom: 720, left: 720 },
  wide: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
};

export const DOCUMENT_MARGIN_PRESET_ORDER = ['default', 'compact', 'wide'];
export const DOCUMENT_MARGIN_PRESET_LABELS = {
  default: 'Default',
  compact: 'Compact',
  wide: 'Wide',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function resolveDocumentLayout(marginPreset = 'default') {
  const preset = DOCUMENT_MARGIN_PRESET_ORDER.includes(marginPreset) ? marginPreset : 'default';
  const pageMargins = clone(MARGIN_PRESETS[preset]);
  const contentWidthPx = Math.floor(
    (DOCX_PAGE_SIZE.width - pageMargins.left - pageMargins.right) / TWIPS_PER_PIXEL
  );
  const contentHeightPx = Math.floor(
    (DOCX_PAGE_SIZE.height - pageMargins.top - pageMargins.bottom) / TWIPS_PER_PIXEL
  );

  return {
    marginPreset: preset,
    pageSize: clone(DOCX_PAGE_SIZE),
    pageMargins,
    contentWidthPx,
    contentHeightPx,
  };
}