# marktodocx-skill

A Claude Agent Skill that converts Markdown into Word (`.docx`) files using the shared marktodocx Node runtime. Same conversion rules as the marktodocx CLI, Chrome extension, and VS Code extension, so one Markdown file produces the same DOCX everywhere.

## What It Does

Give the agent a Markdown file path or inline Markdown content and it writes a `.docx` file that preserves headings, lists, tables, code blocks with syntax highlighting, blockquotes, local images, and (optionally) Mermaid diagrams rendered as static images.

## When to Invoke

`SKILL.md` sets `disable-model-invocation: true`, so the agent will not auto-pick this skill in the background. Invoke it explicitly when you want Markdown turned into DOCX, for example:

- `Convert docs/report.md to DOCX.`
- `Convert docs/report.md to dist/report.docx with stylePreset=minimal and marginPreset=wide.`
- `Convert this Markdown to /tmp/notes.docx using styleSet=body.fontSizePt=12:` followed by inline Markdown content.

## Parameters

| Parameter | Description |
| --- | --- |
| `inputPath` | Local Markdown file path (required unless `markdown` is provided) |
| `markdown` | Inline Markdown content (required unless `inputPath` is provided) |
| `baseDir` | Base directory for resolving local images when using inline Markdown |
| `outputPath` | Optional `.docx` output path (defaults next to the input) |
| `stylePreset` | `default`, `minimal`, or `report` |
| `marginPreset` | `default`, `compact`, or `wide` |
| `styleJson` | Inline style JSON string, a JSON file path, or a plain object |
| `styleSet` | Dotted-path overrides such as `body.fontSizePt=12;blockquote.italic=false` |

The skill also honors `MARKTODOCX_STYLE_PRESET`, `MARKTODOCX_MARGIN_PRESET`, `MARKTODOCX_STYLE_JSON`, and `MARKTODOCX_STYLE_SET` as environment defaults. Explicit parameters override them by option kind.

## Install

The commands below work after the first ClawHub publish goes live. Until then, use **From source** at the bottom of this section.

### From ClawHub (recommended, after first publish)

```bash
clawhub install marktodocx-skill
```

To pin a specific version:

```bash
clawhub install marktodocx-skill --version <version>
```

The OpenClaw CLI also works:

```bash
openclaw skills install marktodocx-skill
```

Either command installs the skill into the workspace's `skills/` directory. Start a new agent session afterwards.

### From a GitHub Release

Each ClawHub publish is also attached to a GitHub Release. Grab the latest `marktodocx-skill.zip` from https://github.com/zhao-kun/marktodocx/releases and extract it into your skill host:

```bash
# Claude Code
mkdir -p ~/.claude/skills
unzip -oq marktodocx-skill.zip -d ~/.claude/skills

# OpenClaw
mkdir -p ~/.openclaw/workspace/skills
unzip -oq marktodocx-skill.zip -d ~/.openclaw/workspace/skills
```

Start a new agent session after deploying.

### From source

To build the export yourself from the marktodocx repository:

```bash
npm install
npm run export:agent-skill           # standard export
npm run export:agent-skill:mermaid   # optional: Mermaid-enabled, platform-specific
```

The exported skill lives at `apps/agent-skill/dist/marktodocx-skill/` and the zip at `apps/agent-skill/dist/marktodocx-skill.zip`. See [`apps/agent-skill/README.md`](README.md) for full source-build and deployment recipes.

## Mermaid Support

Mermaid is optional on the Node host path:

- The standard export keeps Mermaid disabled. If the deployed skill sees a Mermaid block, it fails clearly and asks you to re-export with Mermaid enabled.
- Run `npm run export:agent-skill:mermaid` to produce a Mermaid-enabled export. That profile installs `@marktodocx/runtime-node-mermaid`, vendors a pinned Chromium, probes working launch args, and verifies a real Mermaid render before the export succeeds.
- Mermaid-enabled exports are platform-specific — export on the same OS and architecture you will deploy to.

## Requirements

- Node.js 22 or later on the skill host (matches the marktodocx repo baseline)
- A skill host that loads Claude Agent Skills from a folder (Claude Code, OpenClaw, or compatible)
- For Mermaid-enabled exports: Chromium's Linux shared libraries on the deployment host

## Limitations

- Remote images are not downloaded — use local paths
- Supported image formats: `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`
- Mermaid diagrams become static images in the DOCX
- The skill writes files, so prefer explicit invocation over automatic background use

## License

[MIT](https://github.com/zhao-kun/marktodocx/blob/main/LICENSE) © Kun Zhao

## Feedback

Issues and feature requests: https://github.com/zhao-kun/marktodocx/issues

## Maintainers

The ClawHub publish process and GitHub Release process for this skill are documented in [`docs/publishing.md`](https://github.com/zhao-kun/marktodocx/blob/main/docs/publishing.md#agent-skill-clawhub) at the project root.
