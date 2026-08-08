import { convertMarkdownInBrowser } from '@marktodocx/runtime-browser';

const vscode = acquireVsCodeApi();

function bytesToBase64(bytes) {
  const uint8 = new Uint8Array(bytes);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
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