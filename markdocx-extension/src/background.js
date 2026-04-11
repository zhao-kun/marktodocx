const OFFSCREEN_URL = 'offscreen/offscreen.html';

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  if (contexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['DOM_PARSER'],
    justification: 'Convert Markdown to DOCX using markdown-it and html-to-docx',
  });
}

async function closeOffscreenDocument() {
  try {
    await chrome.offscreen.closeDocument();
  } catch {
    // Already closed or never opened — ignore
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CONVERT_MD_TO_DOCX') {
    handleConvertMdToDocx(message).then(sendResponse);
    return true; // Keep the message channel open for async response
  }
});

async function handleConvertMdToDocx(message) {
  try {
    await ensureOffscreenDocument();

    const result = await chrome.runtime.sendMessage({
      type: 'OFFSCREEN_CONVERT',
      target: 'offscreen',
      markdown: message.markdown,
      imageMap: message.imageMap,
      mdRelativeDir: message.mdRelativeDir,
    });

    await closeOffscreenDocument();

    if (!result || !result.success) {
      return { success: false, error: result?.error || 'No response from offscreen' };
    }

    return { success: true, data: result.data };
  } catch (error) {
    await closeOffscreenDocument();
    return { success: false, error: error.message };
  }
}
