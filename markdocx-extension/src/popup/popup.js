import { IMAGE_EXTENSIONS } from '../lib/constants.js';

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

let allFiles = [];       // All File objects from directory picker
let mdFiles = [];        // .md File objects
let imageFiles = [];     // Image File objects
let selectedMdFile = null;

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

// --- Conversion ---

convertBtn.addEventListener('click', async () => {
  if (!selectedMdFile) return;

  convertBtn.disabled = true;
  status.textContent = 'Reading files...';
  status.className = '';

  try {
    // 1. Read the markdown file
    const markdown = await selectedMdFile.text();

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
      markdown,
      imageMap,
      mdRelativeDir,
    });

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
