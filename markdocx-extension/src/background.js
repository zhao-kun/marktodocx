const OFFSCREEN_URL = 'offscreen/offscreen.html';
const PAGE_URL = 'page/index.html';
const CONVERSION_TIMEOUT_MS = 120000; // 2 minutes

// Open converter page in a tab when the extension icon is clicked
chrome.action.onClicked.addListener(async () => {
  // Use getContexts to find existing page tab — no tabs permission needed
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['TAB'],
    documentUrls: [chrome.runtime.getURL(PAGE_URL)],
  });
  if (contexts.length > 0) {
    await chrome.tabs.update(contexts[0].tabId, { active: true });
    await chrome.windows.update(contexts[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: PAGE_URL });
  }
});

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

  // Forward progress messages from offscreen to the page tab, preserving conversionId
  if (message.type === 'CONVERSION_PROGRESS') {
    forwardProgressToPage(message);
    return false;
  }
});

async function forwardProgressToPage(message) {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['TAB'],
      documentUrls: [chrome.runtime.getURL(PAGE_URL)],
    });
    if (contexts.length > 0) {
      await chrome.runtime.sendMessage({
        type: 'CONVERSION_PROGRESS',
        conversionId: message.conversionId,
        text: message.text,
      });
    }
  } catch {
    // Tab may have closed — ignore
  }
}

async function handleConvertMdToDocx(message) {
  try {
    await ensureOffscreenDocument();

    const result = await Promise.race([
      chrome.runtime.sendMessage({
        type: 'OFFSCREEN_CONVERT',
        target: 'offscreen',
        conversionId: message.conversionId,
        markdown: message.markdown,
        imageMap: message.imageMap,
        mdRelativeDir: message.mdRelativeDir,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Conversion timed out. The document may be too complex.')), CONVERSION_TIMEOUT_MS)
      ),
    ]);

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
