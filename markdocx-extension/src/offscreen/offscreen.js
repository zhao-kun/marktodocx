import { createMarkdownRenderer, extractMermaidBlocks } from '../lib/md-renderer.js';
import { renderMermaidBlocks } from '../lib/mermaid-renderer.js';
import { inlineLocalImages } from '../lib/image-inliner.js';
import { normalizeTables } from '../lib/table-normalizer.js';
import { buildHtmlDocument, generateDocx } from '../lib/docx-generator.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_CONVERT' && message.target === 'offscreen') {
    convertMarkdown(message.markdown, message.imageMap, message.mdRelativeDir).then(sendResponse);
    return true;
  }
});

async function convertMarkdown(markdown, imageMap, mdRelativeDir) {
  try {
    const md = createMarkdownRenderer();

    // 1. Extract and render Mermaid blocks to PNG data URIs
    const mermaidCodes = extractMermaidBlocks(markdown, md);
    const renderedMermaid = mermaidCodes.length > 0
      ? await renderMermaidBlocks(mermaidCodes)
      : [];

    // 2. Render Markdown to HTML, injecting pre-rendered Mermaid images via queue
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
    const base64 = await generateDocx(htmlDocument);

    return { success: true, data: base64 };
  } catch (error) {
    console.error('Conversion failed:', error);
    return { success: false, error: error.message };
  }
}
