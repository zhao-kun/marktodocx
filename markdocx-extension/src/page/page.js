import { IMAGE_EXTENSIONS } from '../lib/constants.js';
import {
  assertValidStyleOptions,
  BODY_FONT_FAMILY_OPTIONS,
  CODE_FONT_FAMILY_OPTIONS,
  DEFAULT_STYLE_OPTIONS,
  DOCUMENT_STYLE_PRESET_ORDER,
  STYLE_PRESET_LABELS,
  STYLE_SYNTAX_THEME_OPTIONS,
  normalizeStyleOptions,
  resolveDocumentStyle,
} from '../lib/document-style.js';
import {
  DOCUMENT_MARGIN_PRESET_LABELS,
  DOCUMENT_MARGIN_PRESET_ORDER,
  resolveDocumentLayout,
} from '../lib/document-layout.js';
import { createMarkdownRenderer, extractMermaidBlocks } from '../lib/md-renderer.js';
import { renderMermaidArtifacts } from '../lib/mermaid-renderer.js';

const pickerArea = document.getElementById('picker-area');
const pickerIcon = document.getElementById('picker-icon');
const pickerLabel = document.getElementById('picker-label');
const changeFolder = document.getElementById('change-folder');
const folderInput = document.getElementById('folder-input');
const mdSelectorDiv = document.getElementById('md-selector');
const mdSelect = document.getElementById('md-select');
const fileInfo = document.getElementById('file-info');
const mdFileName = document.getElementById('md-file-name');
const imageCountEl = document.getElementById('image-count');
const convertBtn = document.getElementById('convert');
const status = document.getElementById('status');
const resetStyleBtn = document.getElementById('reset-style');
const stylePresetSelect = document.getElementById('style-preset');

let allFiles = [];       // All File objects from directory picker
let mdFiles = [];        // .md File objects
let imageFiles = [];     // Image File objects
let selectedMdFile = null;
let styleOptions = clone(DEFAULT_STYLE_OPTIONS);
let isRenderingStyleControls = false;

const STYLE_STORAGE_KEY = 'documentStyleOptions';
const STYLE_FIELDS = [
  { id: 'body-font-family', path: ['body', 'fontFamily'], type: 'string' },
  { id: 'body-font-size', path: ['body', 'fontSizePt'], type: 'number' },
  { id: 'body-line-height', path: ['body', 'lineHeight'], type: 'number' },
  { id: 'body-color', path: ['body', 'color'], type: 'string' },
  { id: 'headings-font-family', path: ['headings', 'fontFamily'], type: 'string' },
  { id: 'headings-color', path: ['headings', 'color'], type: 'string' },
  { id: 'tables-border-color', path: ['tables', 'borderColor'], type: 'string' },
  { id: 'tables-header-bg', path: ['tables', 'headerBackgroundColor'], type: 'string' },
  { id: 'tables-header-text', path: ['tables', 'headerTextColor'], type: 'string' },
  { id: 'code-font-family', path: ['code', 'fontFamily'], type: 'string' },
  { id: 'code-font-size', path: ['code', 'fontSizePt'], type: 'number' },
  { id: 'code-syntax-theme', path: ['code', 'syntaxTheme'], type: 'string' },
  { id: 'code-inline-bg', path: ['code', 'inlineBackgroundColor'], type: 'string' },
  { id: 'code-inline-italic', path: ['code', 'inlineItalic'], type: 'boolean' },
  { id: 'code-block-bg', path: ['code', 'blockBackgroundColor'], type: 'string' },
  { id: 'code-block-border', path: ['code', 'blockBorderColor'], type: 'string' },
  { id: 'code-language-badge-color', path: ['code', 'languageBadgeColor'], type: 'string' },
  { id: 'blockquote-bg', path: ['blockquote', 'backgroundColor'], type: 'string' },
  { id: 'blockquote-text', path: ['blockquote', 'textColor'], type: 'string' },
  { id: 'blockquote-border', path: ['blockquote', 'borderColor'], type: 'string' },
  { id: 'blockquote-italic', path: ['blockquote', 'italic'], type: 'boolean' },
  { id: 'page-margin-preset', path: ['page', 'marginPreset'], type: 'string' },
].map((field) => ({ ...field, element: document.getElementById(field.id) }));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getCanonicalStyleOptions(value) {
  try {
    return normalizeStyleOptions(value);
  } catch {
    return clone(DEFAULT_STYLE_OPTIONS);
  }
}

function isParityMode() {
  return new URLSearchParams(window.location.search).get('markdocx-parity') === '1';
}

function getNestedValue(object, path) {
  return path.reduce((current, key) => current?.[key], object);
}

function setNestedValue(object, path, value) {
  let current = object;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!isPlainObject(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
  current[path.at(-1)] = value;
}

function removeNestedValue(object, path) {
  const parents = [];
  let current = object;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!isPlainObject(current[key])) {
      return;
    }
    parents.push([current, key]);
    current = current[key];
  }

  delete current[path.at(-1)];

  for (let i = parents.length - 1; i >= 0; i--) {
    const [parent, key] = parents[i];
    if (isPlainObject(parent[key]) && Object.keys(parent[key]).length === 0) {
      delete parent[key];
    }
  }
}

function hasOverrides(overrides) {
  if (!isPlainObject(overrides)) {
    return false;
  }
  return Object.values(overrides).some((value) => {
    if (isPlainObject(value)) {
      return hasOverrides(value);
    }
    return true;
  });
}

function populateSelect(selectEl, values, labels = {}) {
  selectEl.innerHTML = '';
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labels[value] || value;
    selectEl.appendChild(option);
  }
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setupStyleControls() {
  populateSelect(stylePresetSelect, DOCUMENT_STYLE_PRESET_ORDER, STYLE_PRESET_LABELS);
  populateSelect(document.getElementById('body-font-family'), BODY_FONT_FAMILY_OPTIONS);
  populateSelect(document.getElementById('headings-font-family'), BODY_FONT_FAMILY_OPTIONS);
  populateSelect(document.getElementById('code-font-family'), CODE_FONT_FAMILY_OPTIONS);
  populateSelect(
    document.getElementById('code-syntax-theme'),
    STYLE_SYNTAX_THEME_OPTIONS,
    Object.fromEntries(STYLE_SYNTAX_THEME_OPTIONS.map((value) => [value, capitalize(value)]))
  );
  populateSelect(document.getElementById('page-margin-preset'), DOCUMENT_MARGIN_PRESET_ORDER, DOCUMENT_MARGIN_PRESET_LABELS);

  stylePresetSelect.addEventListener('change', handlePresetChange);
  resetStyleBtn.addEventListener('click', handleStyleReset);

  for (const field of STYLE_FIELDS) {
    field.element.addEventListener('change', () => {
      void handleStyleFieldChange(field);
    });
  }
}

function getFieldValue(field) {
  if (field.type === 'boolean') {
    return field.element.checked;
  }
  if (field.type === 'number') {
    return Number.parseFloat(field.element.value);
  }
  return field.element.value;
}

function setFieldValue(field, value) {
  if (field.type === 'boolean') {
    field.element.checked = Boolean(value);
    return;
  }
  field.element.value = String(value);
}

function renderStyleControls() {
  const resolvedStyle = resolveDocumentStyle(styleOptions);
  isRenderingStyleControls = true;
  stylePresetSelect.value = styleOptions.preset;
  for (const field of STYLE_FIELDS) {
    setFieldValue(field, getNestedValue(resolvedStyle, field.path));
  }
  isRenderingStyleControls = false;
}

async function persistStyleOptions() {
  try {
    await chrome.storage.local.set({ [STYLE_STORAGE_KEY]: normalizeStyleOptions(styleOptions) });
  } catch {
    // Storage failure should not block conversion.
  }
}

async function loadStyleOptions() {
  try {
    const stored = await chrome.storage.local.get(STYLE_STORAGE_KEY);
    styleOptions = getCanonicalStyleOptions(stored[STYLE_STORAGE_KEY]);
  } catch {
    styleOptions = clone(DEFAULT_STYLE_OPTIONS);
  }
  renderStyleControls();
}

async function handlePresetChange() {
  if (isRenderingStyleControls) return;

  const nextPreset = stylePresetSelect.value;
  if (nextPreset === styleOptions.preset) {
    return;
  }

  if (hasOverrides(styleOptions.overrides)) {
    const confirmed = window.confirm('Switching presets will replace your current custom style changes. Continue?');
    if (!confirmed) {
      renderStyleControls();
      return;
    }
  }

  styleOptions = {
    preset: nextPreset,
    overrides: {},
  };
  styleOptions = normalizeStyleOptions(styleOptions);
  await persistStyleOptions();
  renderStyleControls();
}

async function handleStyleReset() {
  styleOptions = {
    preset: styleOptions.preset,
    overrides: {},
  };
  styleOptions = normalizeStyleOptions(styleOptions);
  await persistStyleOptions();
  renderStyleControls();
}

async function handleStyleFieldChange(field) {
  if (isRenderingStyleControls) return;

  const nextOverrides = clone(styleOptions.overrides);
  setNestedValue(nextOverrides, field.path, getFieldValue(field));

  const candidateStyle = resolveDocumentStyle({
    preset: styleOptions.preset,
    overrides: nextOverrides,
  });
  const presetStyle = resolveDocumentStyle({ preset: styleOptions.preset, overrides: {} });
  const nextValue = getNestedValue(candidateStyle, field.path);
  const presetValue = getNestedValue(presetStyle, field.path);

  if (nextValue === presetValue) {
    removeNestedValue(nextOverrides, field.path);
  } else {
    setNestedValue(nextOverrides, field.path, nextValue);
  }

  styleOptions = {
    preset: styleOptions.preset,
    overrides: nextOverrides,
  };
  styleOptions = normalizeStyleOptions(styleOptions);

  await persistStyleOptions();
  renderStyleControls();
}

// --- Directory picker ---

pickerArea.addEventListener('click', () => {
  if (!pickerArea.classList.contains('has-folder')) {
    folderInput.click();
  }
});

changeFolder.addEventListener('click', (e) => {
  e.stopPropagation();
  resetFolder();
  folderInput.click();
});

function resetFolder() {
  allFiles = [];
  mdFiles = [];
  imageFiles = [];
  selectedMdFile = null;
  folderInput.value = '';
  pickerArea.classList.remove('has-folder');
  pickerIcon.textContent = '\uD83D\uDCC1';
  pickerLabel.textContent = 'Select folder containing .md file';
  changeFolder.style.display = 'none';
  mdSelectorDiv.classList.remove('visible');
  fileInfo.classList.remove('visible');
  convertBtn.disabled = true;
  status.textContent = '';
  status.className = '';
}

folderInput.addEventListener('change', () => {
  const files = [...folderInput.files];
  if (files.length === 0) return;

  allFiles = files;
  mdFiles = files.filter((f) => f.name.endsWith('.md'));
  imageFiles = files.filter((f) => {
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
  });

  if (mdFiles.length === 0) {
    status.textContent = 'No .md files found in this folder.';
    status.className = 'error';
    return;
  }

  // Update picker UI
  pickerArea.classList.add('has-folder');
  pickerIcon.textContent = '\u2705';
  const folderName = files[0].webkitRelativePath.split('/')[0];
  pickerLabel.textContent = folderName;
  changeFolder.style.display = 'inline-block';
  status.textContent = '';
  status.className = '';

  if (mdFiles.length === 1) {
    // Single .md file — select it directly
    mdSelectorDiv.classList.remove('visible');
    selectMdFile(mdFiles[0]);
  } else {
    // Multiple .md files — show selector
    mdSelect.innerHTML = '';
    for (const f of mdFiles) {
      const opt = document.createElement('option');
      opt.value = f.webkitRelativePath;
      opt.textContent = f.webkitRelativePath.split('/').slice(1).join('/');
      mdSelect.appendChild(opt);
    }
    mdSelectorDiv.classList.add('visible');
    selectMdFile(mdFiles[0]);
  }
});

mdSelect.addEventListener('change', () => {
  const file = mdFiles.find((f) => f.webkitRelativePath === mdSelect.value);
  if (file) selectMdFile(file);
});

function selectMdFile(file) {
  selectedMdFile = file;
  const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
  mdFileName.textContent = relativePath;
  imageCountEl.textContent = `${imageFiles.length} image${imageFiles.length !== 1 ? 's' : ''} found in folder`;
  fileInfo.classList.add('visible');
  convertBtn.disabled = false;
}

// --- Progress updates from offscreen via service worker ---

let activeConversionId = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONVERSION_PROGRESS'
      && activeConversionId
      && message.conversionId === activeConversionId) {
    status.textContent = message.text;
  }
});

// --- Conversion ---

let conversionCounter = 0;

convertBtn.addEventListener('click', async () => {
  if (!selectedMdFile) return;

  const conversionId = `conv-${++conversionCounter}-${Date.now()}`;
  activeConversionId = conversionId;

  convertBtn.disabled = true;
  status.textContent = 'Reading files...';
  status.className = '';

  try {
    // 1. Read the markdown file
    const markdown = await selectedMdFile.text();

    if (!markdown.trim()) {
      status.textContent = 'The selected Markdown file is empty.';
      status.className = 'error';
      activeConversionId = null;
      return;
    }

    // 2. Read ALL image files into a map keyed by path relative to root folder.
    //    The offscreen document resolves image references after markdown rendering
    //    (walking rendered <img> elements, not scanning raw markdown), matching
    //    the CLI's behavior in md-to-docx.mjs:256-280.
    status.textContent = 'Reading images...';
    const imageMap = await readAllImages();

    // 3. Compute the .md file's directory relative to the root folder.
    //    The offscreen uses this to resolve relative image paths (including ../).
    const mdRelativeDir = selectedMdFile.webkitRelativePath.split('/').slice(1, -1).join('/');

    // 4. Send to service worker for conversion
    status.textContent = 'Converting to DOCX...';
    const response = await chrome.runtime.sendMessage({
      type: 'CONVERT_MD_TO_DOCX',
      conversionId,
      markdown,
      imageMap,
      mdRelativeDir,
      styleOptions,
    });

    // Clear active ID before setting terminal state so late progress is dropped
    activeConversionId = null;

    if (response.success) {
      // Decode base64 and trigger download
      const byteString = atob(response.data);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = selectedMdFile.name.replace(/\.md$/i, '');
      a.download = `${baseName}.docx`;
      a.click();
      // Defer revocation so the browser has time to start the download
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      status.textContent = 'DOCX downloaded!';
      status.className = 'success';
    } else {
      status.textContent = `Error: ${response.error}`;
      status.className = 'error';
    }
  } catch (error) {
    activeConversionId = null;
    status.textContent = `Error: ${error.message}`;
    status.className = 'error';
  } finally {
    convertBtn.disabled = false;
  }
});

// --- Image loading ---

/**
 * Read ALL image files from the selected directory into a map.
 * Keys are paths relative to the root folder (e.g. "images/foo.png",
 * "subdir/photo.jpg"). The offscreen document uses these keys with
 * path normalization to resolve image references after rendering.
 */
async function readAllImages() {
  const imageMap = {};

  for (const file of imageFiles) {
    // webkitRelativePath is "rootFolder/sub/file.png" — strip root segment
    const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const mimeType = IMAGE_EXTENSIONS.get(ext);
    if (!mimeType) continue;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    imageMap[relativePath] = `data:${mimeType};base64,${btoa(binary)}`;
  }

  return imageMap;
}

async function renderMermaidArtifactsForParity(markdown, runtimeStyleOptions) {
  const canonicalStyleOptions = getCanonicalStyleOptions(runtimeStyleOptions);
  assertValidStyleOptions(canonicalStyleOptions);
  const resolvedStyle = resolveDocumentStyle(canonicalStyleOptions);
  const layoutMetrics = resolveDocumentLayout(resolvedStyle.page.marginPreset);
  const md = createMarkdownRenderer(resolvedStyle);
  const mermaidCodes = extractMermaidBlocks(markdown, md);
  const results = [];

  for (let index = 0; index < mermaidCodes.length; index += 1) {
    const artifact = await renderMermaidArtifacts(mermaidCodes[index], index, layoutMetrics);
    results.push({
      index,
      svg: artifact.svg,
      pngDataUri: artifact.pngDataUri,
      displayWidth: artifact.displayWidth,
      displayHeight: artifact.displayHeight,
    });
  }

  return results;
}

if (isParityMode()) {
  window.__MARKDOCX_PARITY__ = {
    renderMermaidArtifactsForParity,
  };
}

setupStyleControls();
void loadStyleOptions();
