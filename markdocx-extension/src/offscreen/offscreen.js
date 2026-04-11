import { createMarkdownRenderer, extractMermaidBlocks } from '../lib/md-renderer.js';
import { renderMermaidToImageTag } from '../lib/mermaid-renderer.js';
import { inlineLocalImages } from '../lib/image-inliner.js';
import { normalizeTables } from '../lib/table-normalizer.js';
import { buildHtmlDocument, generateDocx } from '../lib/docx-generator.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_CONVERT' && message.target === 'offscreen') {
    convertMarkdown(message.conversionId, message.markdown, message.imageMap, message.mdRelativeDir).then(sendResponse);
    return true;
  }
});

async function convertMarkdown(conversionId, markdown, imageMap, mdRelativeDir) {
  function sendProgress(text) {
    chrome.runtime.sendMessage({ type: 'CONVERSION_PROGRESS', conversionId, text });
  }

  try {
    sendProgress('Parsing Markdown...');
    const md = createMarkdownRenderer();

    // 1. Extract and render Mermaid blocks to PNG data URIs
    const mermaidCodes = extractMermaidBlocks(markdown, md);
    const renderedMermaid = [];
    for (let i = 0; i < mermaidCodes.length; i++) {
      sendProgress(`Rendering diagram ${i + 1} of ${mermaidCodes.length}...`);
      try {
        renderedMermaid.push(await renderMermaidToImageTag(mermaidCodes[i], i));
      } catch (err) {
        throw new Error(`Mermaid diagram ${i + 1} failed: ${err.message}. Check the diagram syntax.`);
      }
    }

    // 2. Render Markdown to HTML, injecting pre-rendered Mermaid images via queue
    sendProgress('Rendering HTML...');
    const htmlBody = md.render(markdown, { renderedMermaid: [...renderedMermaid] });

    // 3. Inline local images from the pre-resolved imageMap.
    //    Runs after rendering so all image forms (reference-style, HTML, etc.)
    //    are resolved by walking <img> elements, matching CLI behavior.
    const inlinedHtml = inlineLocalImages(htmlBody, imageMap, mdRelativeDir);

    // 4. Normalize tables and blockquote styles
    const normalizedHtml = normalizeTables(inlinedHtml);

    // 5. Wrap in full HTML document with CSS
    const htmlDocument = buildHtmlDocument(normalizedHtml);

    // 6. Convert to DOCX (returns base64 string)
    sendProgress('Generating DOCX...');
    const base64 = await generateDocx(htmlDocument);

    return { success: true, data: base64 };
  } catch (error) {
    console.error('Conversion failed:', error);
    return { success: false, error: error.message };
  }
}
