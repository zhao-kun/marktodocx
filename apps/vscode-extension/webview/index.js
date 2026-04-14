import { convertMarkdownInBrowser } from '@markdocx/runtime-browser';

const vscode = acquireVsCodeApi();

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function handleConversion(message) {
  const { conversionId, markdown, imageMap, mdRelativeDir, styleOptions } = message;

  function sendProgress(text) {
    vscode.postMessage({
      type: 'PROGRESS',
      conversionId,
      text,
    });
  }

  try {
    const bytes = await convertMarkdownInBrowser({
      markdown,
      imageMap,
      mdRelativeDir,
      styleOptions,
      onProgress: sendProgress,
    });

    vscode.postMessage({
      type: 'CONVERT_RESULT',
      conversionId,
      success: true,
      data: bytesToBase64(bytes),
    });
  } catch (error) {
    vscode.postMessage({
      type: 'CONVERT_RESULT',
      conversionId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

window.addEventListener('message', (event) => {
  const message = event.data;
  if (message?.type === 'CONVERT') {
    void handleConversion(message);
  }
});

vscode.postMessage({ type: 'READY' });