# marktodocx

<!-- markdownlint-disable-next-line MD033 -->
<div align="center">
<img src="assets/icon.svg" alt="marktodocx icon" width="220" />
</div>

<!-- markdownlint-disable MD033 -->
<div align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0f172a" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/parity-fixture--gated-2563eb" alt="Fixture-gated parity" />
  <img src="https://img.shields.io/badge/hosts-CLI%20%7C%20Chrome%20%7C%20VS%20Code%20%7C%20Skill-111827" alt="Supported hosts" />
  <a href="https://marketplace.visualstudio.com/items?itemName=zhao-kun.marktodocx-vscode-extension"><img src="https://img.shields.io/visual-studio-marketplace/v/zhao-kun.marktodocx-vscode-extension?label=VS%20Code%20Marketplace&logo=visualstudiocode&logoColor=white&color=0078d4" alt="VS Code Marketplace" /></a>
  <a href="https://clawhub.ai/zhao-kun/marktodocx-skill"><img src="https://img.shields.io/badge/ClawHub-live-14b8a6" alt="ClawHub skill" /></a>
</div>
<!-- markdownlint-enable MD033 -->

English | [简体中文](README.zh-CN.md)

marktodocx converts Markdown to Word (`.docx`) while preserving headings, paragraphs, lists, tables, code blocks, blockquotes, local images, and Mermaid diagrams. The same conversion rules are shared across every supported host so that one fix lands everywhere instead of being copied between tools.

marktodocx **targets** three public registries — the VS Code Marketplace, the Chrome Web Store, and ClawHub (the OpenClaw skill registry) — plus GitHub Releases for skill zip mirrors. The VS Code extension and agent skill are already live on their public registries, while the Chrome extension is still pending Chrome Web Store publication. The full publish path is wired up in [`docs/publishing.md`](docs/publishing.md). The CLI is intentionally source-only and stays that way.

Mermaid support differs by host:

- Chrome extension and VSCode extension include Mermaid through the browser runtime after you build the host.
- CLI and agent skill run on the Node runtime by default, so Mermaid requires Node-side Chromium support through `@marktodocx/runtime-node-mermaid` or a Mermaid-enabled agent-skill export.

## Contents

- [Quickstart](#quickstart)
- [Host Status](#host-status)
- [Architecture](#architecture)
- [Package Layout](#package-layout)
- [Supported Features](#supported-features)
- [Requirements](#requirements)
- [Installation](#installation)
- [CLI Usage](#cli-usage)
- [CLI Style Options](#cli-style-options)
- [Chrome Extension](#chrome-extension)
- [VSCode Extension](#vscode-extension)
- [Agent Skill](#agent-skill)
- [Development](#development)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)
- [Help](#help)

## Quickstart

### CLI Quickstart

1. `npm install`
2. If your Markdown contains Mermaid, run `npx puppeteer browsers install chrome`
3. Convert a file with `node md-to-docx.mjs report.md`
4. The output lands next to `report.md` unless you pass an explicit output path

### Chrome Extension Quickstart

1. `npm install && npm run build:chrome-extension`
2. Open `chrome://extensions/`, enable **Developer mode**, and click **Load unpacked**
3. Select `apps/chrome-extension/dist/`
4. Pin the marktodocx icon, open it, select the folder containing your Markdown file and local images, choose the `.md` file, then click **Convert**
5. The generated `.docx` downloads through Chrome's normal download flow: if **Ask where to save each file** is enabled, Chrome opens a save dialog; otherwise it uses the default download directory

### VSCode Extension Quickstart

1. `npm install && npm run package:vscode-extension`
2. Install `apps/vscode-extension/dist/marktodocx-vscode-extension.vsix` (for example: `code --install-extension apps/vscode-extension/dist/marktodocx-vscode-extension.vsix --force`)
3. Open the workspace containing your Markdown file and local images
4. Right-click a `.md` file in the Explorer and choose **marktodocx: Convert to DOCX**, or run `marktodocx.convertToDocx` from the Command Palette
5. Choose the output path in the save dialog

### Agent Skill Quickstart

1. `npm install && npm run export:agent-skill`
2. Copy `apps/agent-skill/dist/marktodocx-skill/` into your skill host, for example `~/.claude/skills/marktodocx-skill` for Claude Code or your OpenClaw skills directory
3. Start a new agent session and invoke the skill explicitly, for example: `Convert docs/report.md to DOCX with stylePreset=minimal.`
4. If your Markdown contains Mermaid, use `npm run export:agent-skill:mermaid` instead (platform-specific; export on the same OS and architecture you will deploy to)

## Host Status

| Host                | Status        | Entry Point                  | Release Target                      |
| ------------------- | ------------- | ---------------------------- | ----------------------------------- |
| Chrome extension    | Implemented   | `apps/chrome-extension/`     | Chrome Web Store                    |
| VSCode extension    | Implemented   | `apps/vscode-extension/`     | VS Code Marketplace                 |
| Agent skill         | Implemented   | `apps/agent-skill/`          | ClawHub + GitHub Releases           |
| CLI                 | Implemented   | `md-to-docx.mjs`             | Source-only (no registry)           |

Release process for every host above is documented in [`docs/publishing.md`](docs/publishing.md).

## Architecture

The repository follows a **Shared Core + Two Runtime Families** layout:

- A shared conversion core owns the canonical Markdown → HTML → DOCX rules, the style and layout schemas, DOCX normalization, and the parity fixtures.
- A **browser runtime family** (`@marktodocx/runtime-browser`) hosts the Chrome extension and VSCode extension on top of native `DOMParser` and in-page Mermaid rendering.
- A **Node runtime family** (`@marktodocx/runtime-node`, plus the optional `@marktodocx/runtime-node-mermaid`) hosts the CLI and agent skill on top of a jsdom DOM adapter and an optional Puppeteer-based Mermaid renderer.

Output parity across hosts is enforced by fixture-driven gates in `scripts/run-fixture-parity.mjs`, `scripts/run-cli-parity.mjs`, `scripts/run-vscode-parity.mjs`, and `scripts/run-agent-skill-parity.mjs`. See `docs/design-core-refactor.md` for the full design, contracts, and rationale.

Repository cleanup is still intentionally incremental in one place only: `md-to-docx.mjs` remains the public CLI entry point until the final dead-code removal step is backed by stable parity history.

## Package Layout

```
marktodocx/
├── md-to-docx.mjs                  # Thin CLI wrapper (argument parsing + style resolution)
├── packages/
│   ├── core/                       # @marktodocx/core — canonical rules, schemas, fixtures
│   ├── runtime-browser/            # @marktodocx/runtime-browser — native DOMParser + in-page Mermaid
│   ├── runtime-node/               # @marktodocx/runtime-node — jsdom adapter + filesystem image map
│   └── runtime-node-mermaid/       # @marktodocx/runtime-node-mermaid — optional Puppeteer Mermaid renderer
├── apps/
│   ├── agent-skill/                # Agent skill host (Node runtime family)
│   ├── chrome-extension/           # Chrome extension host
│   └── vscode-extension/           # VSCode extension host (hidden webview + browser runtime)
├── test-markdown/__golden__/       # Parity fixtures and golden DOCX artifacts
└── docs/design-core-refactor.md    # Authoritative design document
```

## Supported Features

- Headings, paragraphs, bold, italic, blockquotes
- Ordered and unordered lists
- Code blocks (with syntax highlighting) and inline code
- Markdown tables
- Local images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`)
- Mermaid diagrams (rendered to PNG and embedded in the DOCX)

## Requirements

### Build Requirements

- Node.js 22+
- npm (workspaces enabled)

### Runtime Requirements

- Chrome extension: Chrome or Chromium 116+ with support for loading unpacked MV3 extensions
- VSCode extension: VS Code 1.97+
- CLI: Node.js 22+
- Agent skill: Node.js 22+ plus a compatible skill host such as Claude Code or OpenClaw
- Mermaid on Node hosts: a Puppeteer-managed Chrome or Chromium binary, plus host Linux shared libraries when applicable

## Installation

End users can already install the published hosts from their public registries — VS Code Marketplace for the VSCode extension and ClawHub (`clawhub install marktodocx-skill`) for the agent skill. The Chrome extension is still waiting on Chrome Web Store publication, and the CLI is intentionally source-only.

The instructions below cover the source build, which works for every host and is required for the CLI:

```bash
npm install
```

This installs all workspace packages, including `@marktodocx/core`, `@marktodocx/runtime-browser`, `@marktodocx/runtime-node`, and `@marktodocx/runtime-node-mermaid`.

If your Markdown contains Mermaid diagrams and you plan to convert it via the CLI, install a Puppeteer-managed Chrome once:

```bash
npx puppeteer browsers install chrome
```

## CLI Usage

Basic invocation:

```bash
node md-to-docx.mjs <input.md> [output.docx] [options]
```

If the output path is omitted, the CLI writes a `.docx` next to the input Markdown:

```bash
node md-to-docx.mjs report.md
# -> report.docx
```

Explicit output path:

```bash
node md-to-docx.mjs report.md dist/report.docx
```

You can also use the npm script shortcut:

```bash
npm run convert -- report.md dist/report.docx
```

## CLI Style Options

The CLI resolves shared `styleOptions` through `@marktodocx/runtime-node`. All configuration goes through the same schema used by every host, so a preset set on the CLI produces the same output as the same preset configured in the extension.

| CLI flag                    | Environment variable        | Purpose                                     |
| --------------------------- | --------------------------- | ------------------------------------------- |
| `--style-preset <name>`     | `MARKTODOCX_STYLE_PRESET`     | Base style preset (`default`, `minimal`, `report`) |
| `--margin-preset <name>`    | `MARKTODOCX_MARGIN_PRESET`    | Page margin preset (`default`, `compact`, `wide`)  |
| `--style-json <json\|path>` | `MARKTODOCX_STYLE_JSON`       | Inline JSON string or path to a JSON file    |
| `--set key=value`           | `MARKTODOCX_STYLE_SET`        | Targeted dotted-path override (repeatable)  |

Resolution precedence (later entries override earlier ones): environment preset → environment JSON → environment margin → environment assignments → CLI preset → CLI JSON → CLI margin → CLI assignments. The resolved object is then validated by core's `normalizeStyleOptions`.

`--set` and `MARKTODOCX_STYLE_SET` share the same dotted-path, semicolon-separated syntax:

```text
code.fontSizePt=11;blockquote.italic=false;page.marginPreset=wide
```

### Supported `styleSet` Paths

Every `--set` assignment writes into `overrides.<path>`. These are the supported dotted paths:

- `body.fontFamily`
- `body.fontSizePt`
- `body.lineHeight`
- `body.color`
- `headings.fontFamily`
- `headings.color`
- `tables.borderColor`
- `tables.headerBackgroundColor`
- `tables.headerTextColor`
- `code.fontFamily`
- `code.fontSizePt`
- `code.syntaxTheme`
- `code.inlineBackgroundColor`
- `code.inlineItalic`
- `code.blockBackgroundColor`
- `code.blockBorderColor`
- `code.languageBadgeColor`
- `blockquote.backgroundColor`
- `blockquote.textColor`
- `blockquote.borderColor`
- `blockquote.italic`
- `page.marginPreset`

Value parsing rules:

- `true` and `false` become booleans
- numeric values such as `11` or `1.55` become numbers
- everything else is treated as a trimmed string

Example:

```bash
node md-to-docx.mjs report.md \
  --set body.fontSizePt=12 \
  --set body.lineHeight=1.6 \
  --set code.syntaxTheme=dark \
  --set blockquote.italic=false
```

### `styleJson` Details

`--style-json` and `MARKTODOCX_STYLE_JSON` accept either:

- an inline JSON object string
- a path to a JSON file

The JSON can use either full `styleOptions` shape:

```json
{
  "preset": "minimal",
  "overrides": {
    "body": {
      "fontSizePt": 12
    }
  }
}
```

or the shorthand object form that contains only override groups:

```json
{
  "body": {
    "fontSizePt": 12
  },
  "page": {
    "marginPreset": "wide"
  }
}
```

See the full example file at `docs/style-options.example.json`.

Example combining several options:

```bash
node md-to-docx.mjs report.md dist/report.docx \
  --style-preset minimal \
  --margin-preset wide \
  --style-json ./docs/style-options.example.json \
  --set body.fontSizePt=12 \
  --set blockquote.italic=false
```

## Chrome Extension

The Chrome extension lives under `apps/chrome-extension/` and shares conversion logic with the CLI through `@marktodocx/core` + `@marktodocx/runtime-browser`.

Build it from source:

```bash
npm install
npm run build:chrome-extension
```

### Load into Chrome

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `apps/chrome-extension/dist/`.

### First Conversion Walkthrough

1. Pin the marktodocx icon if you want quick access from the toolbar.
2. Click the extension icon to open the conversion page.
3. Select the folder that contains the Markdown file and any local images it references.
4. Choose the target Markdown file from the file selector.
5. Adjust style options if needed, then click **Convert**.
6. Chrome starts a normal browser download for the generated `.docx`. If Chrome is configured to ask where to save each file, you will get a save dialog; otherwise it goes to the default download directory.

### Why Directory Selection Is Required

The extension resolves local image paths relative to the Markdown file. A single-file picker would not grant access to sibling or parent directories referenced by Markdown image links, so the extension requires the containing folder instead.

## VSCode Extension

The VSCode extension lives under `apps/vscode-extension/`. It activates the `marktodocx.convertToDocx` command from the explorer, editor, and editor-title context menus, and routes conversion through a hidden webview that bundles `@marktodocx/runtime-browser`.

Build the bundle with:

```bash
npm run build:vscode-extension
```

For an installable artifact, package it as a `.vsix`:

```bash
npm run package:vscode-extension
```

Then install `apps/vscode-extension/dist/marktodocx-vscode-extension.vsix` into VS Code. If you are developing the extension instead, point VS Code at `apps/vscode-extension/` through the Run Extension launch configuration.

### Trigger a Conversion

- Right-click a `.md` file in the Explorer and choose **marktodocx: Convert to DOCX**.
- Or open the Command Palette and run `marktodocx.convertToDocx`.
- Or use the editor context menu or editor title button when a Markdown file is open.

VS Code prompts for the output path with a save dialog. The `.docx` is written wherever you choose, and local images resolve relative to the workspace folder containing the Markdown file.

Conversion settings live under the `marktodocx` namespace and map directly onto the shared `styleOptions` schema:

| Setting                 | Purpose                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `marktodocx.stylePreset`  | Base style preset (`default`, `minimal`, `report`)                            |
| `marktodocx.marginPreset` | Optional page margin preset override (`default`, `compact`, `wide`)           |
| `marktodocx.styleJson`    | Inline style JSON string or workspace-relative path to a style JSON file      |
| `marktodocx.styleSet`     | Targeted dotted-path overrides such as `body.fontSizePt=12` (array of strings) |

Local images are resolved against the workspace folder of the converted Markdown file, mirroring the Chrome extension's directory-selection contract.

### Packaging the VSCode Extension

The extension is packaged with [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce). The `package` script builds the bundle, runs the bundle smoke check, and writes a standalone `.vsix` to `apps/vscode-extension/dist/marktodocx-vscode-extension.vsix`.

Run any of these from the repository root:

```bash
npm run package:vscode-extension
# or
npm run package -w marktodocx-vscode-extension
```

Or from the extension directory:

```bash
cd apps/vscode-extension
npm run package
```

Install the produced `.vsix` into your local VS Code:

```bash
npm run install:vsix -w marktodocx-vscode-extension
# or
code --install-extension apps/vscode-extension/dist/marktodocx-vscode-extension.vsix --force
```

The packaged `.vsix` ships the bundled `dist/extension.cjs`, the webview asset bundle, and the manifest. Workspace `@marktodocx/*` packages are inlined at build time, so the extension does not require `node_modules` at install time and `vsce package` is invoked with `--no-dependencies`.

## Agent Skill

The agent skill source lives under `apps/agent-skill/` and exports `convertWithAgentSkill()` from `apps/agent-skill/skill.mjs`. It is intentionally thin: it resolves file or inline Markdown input, maps skill parameters and environment defaults into the shared `styleOptions` schema through `@marktodocx/runtime-node`, and writes a DOCX when an output path is available.

If you want a host-specific deployment walkthrough, see `apps/agent-skill/README.md` for Claude Code and OpenClaw recipes.

Naming rule:

- Internal source app path: `apps/agent-skill/`
- Internal workspace package: `marktodocx-agent-skill`
- Public Claude skill name: `marktodocx-skill`

The source folder name does not need to match the public Claude skill name. The public skill identity is defined by the `name` field in `apps/agent-skill/SKILL.md`.

Skill parameters match the design contract:

| Parameter       | Purpose                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| `inputPath`     | Path to a local Markdown file                                           |
| `markdown`      | Inline Markdown string                                                  |
| `baseDir`       | Base directory for resolving local images with inline Markdown          |
| `outputPath`    | Optional DOCX path; defaults beside `inputPath` when file input is used |
| `stylePreset`   | Base shared style preset                                                |
| `marginPreset`  | Optional shared margin preset override                                  |
| `styleJson`     | Shared style JSON string, plain object, or JSON file path               |
| `styleSet`      | Shared dotted-path overrides such as `body.fontSizePt=12`               |

The skill honors the same environment defaults as the CLI: `MARKTODOCX_STYLE_PRESET`, `MARKTODOCX_MARGIN_PRESET`, `MARKTODOCX_STYLE_JSON`, and `MARKTODOCX_STYLE_SET`. Mermaid behavior is also the same: install `@marktodocx/runtime-node-mermaid` when the document contains Mermaid blocks.

To produce a standalone deployable skill folder that does not depend on a live repository checkout, run:

```bash
npm run export:agent-skill
```

This writes `apps/agent-skill/dist/marktodocx-skill/` plus `apps/agent-skill/dist/marktodocx-skill.zip`, which can be copied or symlinked into another agent runtime's skills directory.

To produce a Mermaid-enabled export with a vendored Chromium browser, run:

```bash
npm run export:agent-skill:mermaid
```

That profile is platform-specific and intended for deployment on the same OS and CPU family that built the export. It also persists the working Chromium launch args in the export manifest, so sandbox-restricted hosts that built the export usually do not need manual environment flags at runtime. For Mermaid diagrams with Simplified Chinese labels, the Node renderer also injects a bundled Noto Sans SC webfont into the SVG before Chromium rasterizes it, so the export does not rely on host CJK fonts.

For a CI-safe export gate, run:

```bash
npm run test:export:agent-skill
```

That command rebuilds the export and verifies the final artifact layout.

For the Mermaid-enabled export gate, run:

```bash
npm run test:export:agent-skill:mermaid
```

## Development

Per-package build scripts:

```bash
npm run build:core
npm run build:runtime-browser
npm run build:runtime-node
npm run build:runtime-node-mermaid
npm run build:packages
npm run build:agent-skill
npm run export:agent-skill
npm run export:agent-skill:mermaid
npm run test:export:agent-skill
npm run test:export:agent-skill:mermaid
npm run build:chrome-extension
npm run build:vscode-extension
npm run build:cli
npm run smoke:all
```

Unit and parity gates:

```bash
npm run test:unit           # Unit tests across packages
npm run test:parity         # Extension-path parity gate
npm run test:parity:cli     # CLI-path parity gate
npm run test:parity:skill   # Agent-skill parity gate
npm run test:parity:vscode  # VSCode-path parity gate
npm run test:parity:all     # Full pre-ship parity gate (extension + CLI + VSCode + agent skill)
```

The full parity gate is `npm run test:parity:all`. Run it before shipping any change that touches the conversion core or any runtime family.

GitHub Actions now mirrors the same local flow in `.github/workflows/ci.yml`: one job installs dependencies and runs `npm run smoke:all` (which builds the shared packages, smoke-tests every host, and verifies the standalone agent-skill export); a second job installs Puppeteer-managed Chrome and runs `npm run test:parity:all` on every pull request.

To refresh fixtures when canonical output intentionally changes:

```bash
npm run generate:goldens
```

## Limitations

- Mermaid diagrams are embedded as PNG images, not as editable Mermaid sources inside Word.
- Very large Mermaid diagrams may still be scaled by Word to fit the page width.
- Markdown → DOCX fidelity is best-effort because HTML/CSS and Word's rendering model do not match exactly.
- Remote images are not downloaded. Use local image files for reliable embedding.
- The Chrome extension needs directory selection (not a single file) so it can resolve relative image paths.

## Troubleshooting

### Chrome not found

If the CLI logs a `Could not find Chrome` error during Mermaid rendering:

```bash
npx puppeteer browsers install chrome
```

### Linux shared libraries missing for Chromium

If Mermaid rendering fails with an error like `error while loading shared libraries: libatk-1.0.so.0`, Chromium was downloaded successfully but the host OS is missing Puppeteer's Linux runtime libraries.

On Debian or Ubuntu, if you have root access, let Puppeteer attempt to install them:

```bash
sudo MARKTODOCX_PUPPETEER_INSTALL_DEPS=1 npm run test:export:agent-skill:mermaid
```

If you prefer to install packages manually on Debian or Ubuntu, start with:

```bash
sudo apt-get update
sudo apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libasound2t64 || sudo apt-get install -y libasound2

sudo apt-get install -y \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxkbcommon0 \
  libxrandr2 \
  xdg-utils
```

On some Ubuntu releases the audio package is named `libasound2t64`; on older releases it is still `libasound2`.

In containerized environments you may also need `MARKTODOCX_PUPPETEER_NO_SANDBOX=1`.

If Chromium fails with `No usable sandbox!`, rerun the Mermaid export gate as:

```bash
MARKTODOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```

On minimal Ubuntu VPS hosts, you may need both environment variables together:

```bash
sudo MARKTODOCX_PUPPETEER_INSTALL_DEPS=1 MARKTODOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```

### CLI error: install `@marktodocx/runtime-node-mermaid`

If the CLI exits with a message about installing `@marktodocx/runtime-node-mermaid`, your Markdown contains a Mermaid fence but the optional Puppeteer helper package is not installed. Install the workspace (which pulls it in) and rerun:

```bash
npm install
```

### Unsupported local image format

The shared pipeline accepts these extensions:

- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.webp`
- `.svg`

Convert any other format to one of the above before running the CLI.

### Mermaid text wraps too early

Mermaid layout parameters are now owned by the shared runtime configuration, not by the CLI wrapper. Adjust them in the shared Mermaid config rather than reintroducing CLI-local drift.

## Help

Print the CLI usage reference:

```bash
node md-to-docx.mjs --help
```
