# marktodocx for Chrome

Convert any Markdown file on your computer into a Word (`.docx`) document — right from your browser, with no upload to any server.

marktodocx runs the entire conversion inside the extension. Your Markdown and images never leave your machine.

## Features

- One-click Markdown → DOCX conversion in the browser
- Preserves headings, paragraphs, ordered/unordered lists, tables, code blocks with syntax highlighting, blockquotes, and local images
- Renders Mermaid diagrams as static images inside the DOCX
- Produces a file that opens cleanly in Microsoft Word, LibreOffice Writer, WPS, and Google Docs
- Output downloads through Chrome's normal download flow, so you control where it lands
- 100% client-side: nothing is uploaded, no account required

## How to Use

1. Click the marktodocx icon in the Chrome toolbar to open the popup
2. Click **Select folder** and pick the folder that contains both your Markdown file and any images it references
3. Pick the `.md` file you want to convert
4. Click **Convert**
5. Chrome downloads the generated `.docx` — if you have **Ask where to save each file** enabled, you'll see a save dialog; otherwise it lands in your default download folder

> A folder (not a single file) is required so that relative image paths inside the Markdown can be resolved locally.

## Why a Folder Instead of a File

Chrome extensions cannot read arbitrary sibling files next to a single picked `.md` file. Picking a folder lets marktodocx resolve local image references (`![alt](./img/foo.png)`) without asking for any host permissions or network access.

## Permissions

The extension requests only the `offscreen` permission so it can run the Mermaid renderer in a hidden offscreen document. It does **not** request:

- Access to any website
- Network or `host_permissions`
- Reading/writing cookies, history, or tabs

## Privacy

Everything runs locally inside the extension. No telemetry, no uploads, no tracking.

## Requirements

- Chrome 116 or later (for the offscreen document API used by Mermaid)

## Supported Content

| Feature | Supported |
| --- | --- |
| Headings `h1`–`h6` | Yes |
| Paragraphs, bold, italic, strikethrough, inline code | Yes |
| Ordered and unordered lists, nested lists, task lists | Yes |
| Tables (with alignment) | Yes |
| Fenced code blocks with syntax highlighting | Yes |
| Blockquotes | Yes |
| Local images (`png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`) | Yes |
| Mermaid diagrams (rendered to static images) | Yes |
| Remote image URLs | No (use local images) |

## Limitations

- Remote images are not downloaded — reference images by local path
- Mermaid diagrams are embedded as static images, not live diagrams
- Very large Mermaid diagrams may take a few seconds to render

## Install

Once published, install from the Chrome Web Store search for **marktodocx** and click **Add to Chrome**.

To run an unpacked development build from source, follow the [Chrome Extension Quickstart](https://github.com/zhao-kun/markdocx#chrome-extension-quickstart) in the project README.

## Feedback

Bug reports, feature requests, and style-configuration ideas are welcome at https://github.com/zhao-kun/markdocx/issues.

## License

[MIT](https://github.com/zhao-kun/markdocx/blob/main/LICENSE) © Kun Zhao

## Maintainers

Release process is documented in [`docs/publishing.md`](https://github.com/zhao-kun/markdocx/blob/main/docs/publishing.md) at the project root.
