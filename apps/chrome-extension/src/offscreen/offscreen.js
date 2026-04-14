import { convertMarkdownInBrowser } from '@markdocx/runtime-browser';

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_CONVERT' && message.target === 'offscreen') {
    convertMarkdown(
      message.conversionId,
      message.markdown,
      message.imageMap,
      message.mdRelativeDir,
      message.styleOptions
    ).then(sendResponse);
    return true;
  }
});

async function convertMarkdown(conversionId, markdown, imageMap, mdRelativeDir, styleOptions) {
  function sendProgress(text) {
    chrome.runtime.sendMessage({ type: 'CONVERSION_PROGRESS', conversionId, text });
  }

  try {
    const bytes = await convertMarkdownInBrowser({
      markdown,
      imageMap,
      mdRelativeDir,
      styleOptions,
      onProgress: sendProgress,
    });

    return { success: true, data: bytesToBase64(bytes) };
  } catch (error) {
    console.error('Conversion failed:', error);
    return { success: false, error: error.message };
  }
}
