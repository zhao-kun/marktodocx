# markdocx

markdocx converts Markdown to Word (`.docx`) while preserving headings, paragraphs, lists, tables, code blocks, blockquotes, local images, and Mermaid diagrams. The same conversion rules are shared across every supported host so that one fix lands everywhere instead of being copied between tools.

## Host Status

| Host                | Status        | Entry Point                                    |
| ------------------- | ------------- | ---------------------------------------------- |
| Chrome extension    | Implemented   | `apps/chrome-extension/`                      |
| CLI                 | Implemented   | `md-to-docx.mjs`                               |
| VSCode extension    | Implemented   | `apps/vscode-extension/`                       |
| Agent skill         | Implemented   | `apps/agent-skill/`                            |

## Architecture

The repository follows a **Shared Core + Two Runtime Families** layout:

- A shared conversion core owns the canonical Markdown → HTML → DOCX rules, the style and layout schemas, DOCX normalization, and the parity fixtures.
- A **browser runtime family** (`@markdocx/runtime-browser`) hosts the Chrome extension and VSCode extension on top of native `DOMParser` and in-page Mermaid rendering.
- A **Node runtime family** (`@markdocx/runtime-node`, plus the optional `@markdocx/runtime-node-mermaid`) hosts the CLI and agent skill on top of a jsdom DOM adapter and an optional Puppeteer-based Mermaid renderer.

Output parity across hosts is enforced by fixture-driven gates in `scripts/run-fixture-parity.mjs`, `scripts/run-cli-parity.mjs`, `scripts/run-vscode-parity.mjs`, and `scripts/run-agent-skill-parity.mjs`. See `docs/design-core-refactor.md` for the full design, contracts, and rationale.

Repository cleanup is still intentionally incremental in one place only: `md-to-docx.mjs` remains the public CLI entry point until the final dead-code removal step is backed by stable parity history.

## Package Layout

```
markdocx/
├── md-to-docx.mjs                  # Thin CLI wrapper (argument parsing + style resolution)
├── packages/
│   ├── core/                       # @markdocx/core — canonical rules, schemas, fixtures
│   ├── runtime-browser/            # @markdocx/runtime-browser — native DOMParser + in-page Mermaid
│   ├── runtime-node/               # @markdocx/runtime-node — jsdom adapter + filesystem image map
│   └── runtime-node-mermaid/       # @markdocx/runtime-node-mermaid — optional Puppeteer Mermaid renderer
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

- Node.js 22+
- npm (workspaces enabled)
- A Chrome binary reachable by Puppeteer (only required when you need Mermaid rendering from the CLI)

## Installation

From the repository root:

```bash
npm install
```

This installs all workspace packages, including `@markdocx/core`, `@markdocx/runtime-browser`, `@markdocx/runtime-node`, and `@markdocx/runtime-node-mermaid`.

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

The CLI resolves shared `styleOptions` through `@markdocx/runtime-node`. All configuration goes through the same schema used by every host, so a preset set on the CLI produces the same output as the same preset configured in the extension.

| CLI flag                    | Environment variable        | Purpose                                     |
| --------------------------- | --------------------------- | ------------------------------------------- |
| `--style-preset <name>`     | `MARKDOCX_STYLE_PRESET`     | Base style preset (`default`, `minimal`, `report`) |
| `--margin-preset <name>`    | `MARKDOCX_MARGIN_PRESET`    | Page margin preset (`default`, `compact`, `wide`)  |
| `--style-json <json\|path>` | `MARKDOCX_STYLE_JSON`       | Inline JSON string or path to a JSON file    |
| `--set key=value`           | `MARKDOCX_STYLE_SET`        | Targeted dotted-path override (repeatable)  |

Resolution precedence (later entries override earlier ones): environment preset → environment JSON → environment margin → environment assignments → CLI preset → CLI JSON → CLI margin → CLI assignments. The resolved object is then validated by core's `normalizeStyleOptions`.

`--set` and `MARKDOCX_STYLE_SET` share the same dotted-path, semicolon-separated syntax:

```text
code.fontSizePt=11;blockquote.italic=false;page.marginPreset=wide
```

Example combining several options:

```bash
node md-to-docx.mjs report.md dist/report.docx \
  --style-preset minimal \
  --margin-preset wide \
  --style-json ./style-options.json \
  --set body.fontSizePt=12 \
  --set blockquote.italic=false
```

## Chrome Extension

The Chrome extension lives under `apps/chrome-extension/` and shares conversion logic with the CLI through `@markdocx/core` + `@markdocx/runtime-browser`. To build and load it, run `npm run build:chrome-extension` and load the produced `apps/chrome-extension/dist/` directory as an unpacked extension in Chrome. The extension needs a directory selection rather than a single file so that it can resolve local image references.

## VSCode Extension

The VSCode extension lives under `apps/vscode-extension/`. It activates the `markdocx.convertToDocx` command from the explorer, editor, and editor-title context menus, and routes conversion through a hidden webview that bundles `@markdocx/runtime-browser`. Build the bundle with:

```bash
npm run build:vscode-extension
```

Then point VS Code at `apps/vscode-extension/` (for example via the Run Extension launch configuration) to load the development build. Conversion settings live under the `markdocx` namespace and map directly onto the shared `styleOptions` schema:

| Setting                 | Purpose                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `markdocx.stylePreset`  | Base style preset (`default`, `minimal`, `report`)                            |
| `markdocx.marginPreset` | Optional page margin preset override (`default`, `compact`, `wide`)           |
| `markdocx.styleJson`    | Inline style JSON string or workspace-relative path to a style JSON file      |
| `markdocx.styleSet`     | Targeted dotted-path overrides such as `body.fontSizePt=12` (array of strings) |

Local images are resolved against the workspace folder of the converted Markdown file, mirroring the Chrome extension's directory-selection contract.

### Packaging the VSCode Extension

The extension is packaged with [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce). The `package` script builds the bundle, runs the bundle smoke check, and writes a standalone `.vsix` to `apps/vscode-extension/dist/markdocx-vscode-extension.vsix`.

Run any of these from the repository root:

```bash
npm run package:vscode-extension
# or
npm run package -w markdocx-vscode-extension
```

Or from the extension directory:

```bash
cd apps/vscode-extension
npm run package
```

Install the produced `.vsix` into your local VS Code:

```bash
npm run install:vsix -w markdocx-vscode-extension
# or
code --install-extension apps/vscode-extension/dist/markdocx-vscode-extension.vsix --force
```

The packaged `.vsix` ships the bundled `dist/extension.cjs`, the webview asset bundle, and the manifest. Workspace `@markdocx/*` packages are inlined at build time, so the extension does not require `node_modules` at install time and `vsce package` is invoked with `--no-dependencies`.

## Agent Skill

The agent skill source lives under `apps/agent-skill/` and exports `convertWithAgentSkill()` from `apps/agent-skill/skill.mjs`. It is intentionally thin: it resolves file or inline Markdown input, maps skill parameters and environment defaults into the shared `styleOptions` schema through `@markdocx/runtime-node`, and writes a DOCX when an output path is available.

Naming rule:

- Internal source app path: `apps/agent-skill/`
- Internal workspace package: `markdocx-agent-skill`
- Public Claude skill name: `markdocx-skill`

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

The skill honors the same environment defaults as the CLI: `MARKDOCX_STYLE_PRESET`, `MARKDOCX_MARGIN_PRESET`, `MARKDOCX_STYLE_JSON`, and `MARKDOCX_STYLE_SET`. Mermaid behavior is also the same: install `@markdocx/runtime-node-mermaid` when the document contains Mermaid blocks.

To produce a standalone deployable skill folder that does not depend on a live repository checkout, run:

```bash
npm run export:agent-skill
```

This writes `apps/agent-skill/dist/markdocx-skill/` plus `apps/agent-skill/dist/markdocx-skill.zip`, which can be copied or symlinked into another agent runtime's skills directory.

To produce a Mermaid-enabled export with a vendored Chromium browser, run:

```bash
npm run export:agent-skill:mermaid
```

That profile is platform-specific and intended for deployment on the same OS and CPU family that built the export. It also persists the working Chromium launch args in the export manifest, so sandbox-restricted hosts that built the export usually do not need manual environment flags at runtime.

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
sudo MARKDOCX_PUPPETEER_INSTALL_DEPS=1 npm run test:export:agent-skill:mermaid
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

In containerized environments you may also need `MARKDOCX_PUPPETEER_NO_SANDBOX=1`.

If Chromium fails with `No usable sandbox!`, rerun the Mermaid export gate as:

```bash
MARKDOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```

On minimal Ubuntu VPS hosts, you may need both environment variables together:

```bash
sudo MARKDOCX_PUPPETEER_INSTALL_DEPS=1 MARKDOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```

### CLI error: install `@markdocx/runtime-node-mermaid`

If the CLI exits with a message about installing `@markdocx/runtime-node-mermaid`, your Markdown contains a Mermaid fence but the optional Puppeteer helper package is not installed. Install the workspace (which pulls it in) and rerun:

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
