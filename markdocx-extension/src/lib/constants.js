export const HIDDEN_CODE_BLOCK_LANGUAGES = new Set(['text']);

export const FLOWCHART_WRAPPING_WIDTH = 560;
export const FLOWCHART_NODE_SPACING = 60;
export const FLOWCHART_RANK_SPACING = 45;

export const DOCX_PAGE_SIZE = {
  width: 11906,
  height: 16838,
};

export const DOCX_PAGE_MARGINS = {
  top: 1080,
  right: 900,
  bottom: 1080,
  left: 900,
};

export const TWIPS_PER_PIXEL = 15;
export const DOCX_CONTENT_WIDTH_PX = Math.floor(
  (DOCX_PAGE_SIZE.width - DOCX_PAGE_MARGINS.left - DOCX_PAGE_MARGINS.right) / TWIPS_PER_PIXEL
);

export const IMAGE_EXTENSIONS = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);
