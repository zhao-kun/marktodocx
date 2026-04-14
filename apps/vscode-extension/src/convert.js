const fs = require('node:fs/promises');
const path = require('node:path');

const IMAGE_EXTENSIONS = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

function isMarkdownPath(filePath) {
  return /\.(md|markdown)$/i.test(filePath);
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function bytesToDataUri(bytes, mimeType) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
}

function normalizeStyleSet(styleSet) {
  if (Array.isArray(styleSet)) {
    return styleSet.filter((item) => typeof item === 'string' && item.trim() !== '');
  }
  if (typeof styleSet === 'string' && styleSet.trim() !== '') {
    return [styleSet];
  }
  return [];
}

async function listFilesRecursively(rootDir) {
  const results = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursively(absolutePath)));
    } else {
      results.push(absolutePath);
    }
  }

  return results;
}

function hasPotentialLocalImages(markdown) {
  return /!\[[^\]]*\]\((?!https?:|data:|#)|<img\b[^>]*\bsrc=["'](?!https?:|data:|#)/i.test(markdown);
}

async function collectWorkspaceImageMap(rootDir) {
  const files = await listFilesRecursively(rootDir);
  const imageMap = {};

  for (const absolutePath of files) {
    const extension = path.extname(absolutePath).toLowerCase();
    const mimeType = IMAGE_EXTENSIONS.get(extension);
    if (!mimeType) {
      continue;
    }

    const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
    imageMap[relativePath] = bytesToDataUri(await fs.readFile(absolutePath), mimeType);
  }

  return imageMap;
}

function getMarkdownRelativeDir(rootDir, markdownPath) {
  const relativeDir = toPosixPath(path.relative(rootDir, path.dirname(markdownPath)));
  return relativeDir === '.' ? '' : relativeDir;
}

async function resolveVsCodeStyleOptionsFromValues(values, { cwd }) {
  const { resolveNodeStyleOptions } = await import('@markdocx/runtime-node/style-options');
  return resolveNodeStyleOptions({
    cwd,
    env: {},
    stylePreset: values.stylePreset,
    marginPreset: values.marginPreset || undefined,
    styleJson: values.styleJson || undefined,
    styleSet: normalizeStyleSet(values.styleSet),
  });
}

async function resolveVsCodeStyleOptions(vscodeApi, markdownUri, workspaceRoot) {
  const config = vscodeApi.workspace.getConfiguration('markdocx', markdownUri);
  return resolveVsCodeStyleOptionsFromValues(
    {
      stylePreset: config.get('stylePreset'),
      marginPreset: config.get('marginPreset'),
      styleJson: config.get('styleJson'),
      styleSet: config.get('styleSet'),
    },
    { cwd: workspaceRoot }
  );
}

function resolveWorkspaceRoot(vscodeApi, markdownUri) {
  const workspaceFolder = vscodeApi.workspace.getWorkspaceFolder(markdownUri);
  return workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(markdownUri.fsPath);
}

function resolveDefaultOutputPath(markdownPath) {
  return path.join(
    path.dirname(markdownPath),
    `${path.basename(markdownPath, path.extname(markdownPath))}.docx`
  );
}

function resolveMarkdownUri(vscodeApi, resourceUri) {
  if (resourceUri?.scheme === 'file' && isMarkdownPath(resourceUri.fsPath)) {
    return resourceUri;
  }

  const activeUri = vscodeApi.window.activeTextEditor?.document?.uri;
  if (activeUri?.scheme === 'file' && isMarkdownPath(activeUri.fsPath)) {
    return activeUri;
  }

  return null;
}

async function convertMarkdownToDocx({ resourceUri, vscodeApi, webviewHost }) {
  const markdownUri = resolveMarkdownUri(vscodeApi, resourceUri);
  if (!markdownUri) {
    vscodeApi.window.showErrorMessage('Select a Markdown file in the explorer or open one in the active editor first.');
    return;
  }

  const markdownPath = markdownUri.fsPath;
  const workspaceRoot = resolveWorkspaceRoot(vscodeApi, markdownUri);
  const outputPath = await vscodeApi.window.showSaveDialog({
    defaultUri: vscodeApi.Uri.file(resolveDefaultOutputPath(markdownPath)),
    filters: {
      'Word Document': ['docx'],
    },
    saveLabel: 'Convert to DOCX',
  });

  if (!outputPath) {
    return;
  }

  const markdown = await fs.readFile(markdownPath, 'utf8');
  if (!markdown.trim()) {
    vscodeApi.window.showErrorMessage('The selected Markdown file is empty.');
    return;
  }

  const styleOptions = await resolveVsCodeStyleOptions(vscodeApi, markdownUri, workspaceRoot);
  const imageMap = hasPotentialLocalImages(markdown)
    ? await collectWorkspaceImageMap(workspaceRoot)
    : {};
  const mdRelativeDir = getMarkdownRelativeDir(workspaceRoot, markdownPath);

  const bytes = await vscodeApi.window.withProgress(
    {
      location: vscodeApi.ProgressLocation.Notification,
      title: `Converting ${path.basename(markdownPath)} to DOCX`,
      cancellable: false,
    },
    async (progress) => {
      return webviewHost.convert({
        markdown,
        imageMap,
        mdRelativeDir,
        styleOptions,
        onProgress(text) {
          progress.report({ message: text });
        },
      });
    }
  );

  await fs.writeFile(outputPath.fsPath, Buffer.from(bytes));
  const openChoice = await vscodeApi.window.showInformationMessage(
    `DOCX written to ${path.basename(outputPath.fsPath)}.`,
    'Open'
  );

  if (openChoice === 'Open') {
    await vscodeApi.commands.executeCommand('vscode.open', outputPath);
  }
}

module.exports = {
  collectWorkspaceImageMap,
  convertMarkdownToDocx,
  getMarkdownRelativeDir,
  resolveVsCodeStyleOptionsFromValues,
};