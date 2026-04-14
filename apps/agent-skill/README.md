# markdocx Agent Skill

This app is the thin agent-skill host for markdocx. It reuses the shared Node runtime family in `@markdocx/runtime-node` and only owns skill-facing parameter parsing, input resolution, and optional output writing.

## Naming

- Source app directory: `apps/agent-skill/`
- Workspace package name: `markdocx-agent-skill`
- Public Claude skill name: `markdocx-skill`

These names intentionally serve different purposes. The source app directory and workspace package are internal implementation details; the deployed Claude skill identity is controlled by the `name` field in `SKILL.md`.

## Entry Point

- `skill.mjs` exports `convertWithAgentSkill()` for programmatic skill execution.

## Manual Build

This skill now has one source validation path and two standalone export profiles:

- `npm run build:agent-skill`: validate the source skill and run the source-tree smoke test
- `npm run export:agent-skill`: create the standard standalone export without Mermaid runtime installation
- `npm run export:agent-skill:mermaid`: create a Mermaid-enabled standalone export with a vendored Chromium browser
- `npm run test:export:agent-skill`: rebuild the standard export and verify the final artifact layout for CI
- `npm run test:export:agent-skill:mermaid`: rebuild the Mermaid-enabled export, vendor Chromium, and verify the final artifact layout for CI

From the repository root:

```bash
npm install
npm run build:agent-skill
```

Choose one export profile:

```bash
npm run export:agent-skill
```

or:

```bash
npm run export:agent-skill:mermaid
```

What this does:

- installs the workspace dependencies required by `skill.mjs`
- validates `SKILL.md`
- runs a sample Markdown-to-DOCX conversion through `convertWithAgentSkill()`
- builds a standalone exported skill folder with its own `node_modules/`
- writes a distributable zip archive at `apps/agent-skill/dist/markdocx-skill.zip`
- smoke-tests that exported folder from an isolated temporary directory
- verifies the exported layout in a CI-safe follow-up check when using `npm run test:export:agent-skill`

Profile behavior:

- `npm run export:agent-skill` keeps Mermaid optional. The export includes the optional Mermaid tarball in `vendor/`, but does not install `@markdocx/runtime-node-mermaid` into `node_modules/` and does not bundle Chromium.
- `npm run export:agent-skill:mermaid` installs `@markdocx/runtime-node-mermaid`, vendors a pinned Chromium browser into the export, probes the working Chromium launch args on the export host, writes them into the runtime manifest, and runs a real Mermaid render smoke test before the export succeeds.
- Mermaid-enabled exports are platform-specific because the vendored browser is built for the host platform that ran the export.
- Mermaid-enabled exports still require the host OS to provide Chromium's Linux shared libraries. Minimal VPS images often miss packages such as `libatk1.0-0`.
- A malformed `markdocx-export-manifest.json` is treated as a hard deployment error. The skill fails loudly instead of guessing around a corrupt Mermaid export.

The exported artifact lives at:

```text
apps/agent-skill/dist/markdocx-skill/
```

And the archive artifact lives at:

```text
apps/agent-skill/dist/markdocx-skill.zip
```

That directory is self-contained for deployment: it includes `SKILL.md`, `skill.mjs`, a generated `package.json`, vendored workspace tarballs, and installed runtime dependencies under `node_modules/`.

It also includes `markdocx-export-manifest.json`, which records whether the export is `standard` or `with-mermaid`. Mermaid-enabled exports also record the vendored browser path and any required launch arguments there, so deployments on the same host usually do not need manual sandbox flags.

## Manual Deployment

For deployment, use the exported folder instead of the live repository source tree.

Build it first:

```bash
npm install
npm run export:agent-skill
```

Then deploy this directory:

```text
apps/agent-skill/dist/markdocx-skill/
```

Copying only `SKILL.md` is still not enough. Deploy the whole exported folder.

This exported folder no longer depends on a live markdocx repository checkout.

If your target runtime prefers a single-file handoff, deploy the zip archive and extract it into the target skills directory.

Primary deployment recipes:

```bash
mkdir -p ~/.openclaw/workspace/skills
cp -R apps/agent-skill/dist/markdocx-skill ~/.openclaw/workspace/skills/markdocx-skill
```

or:

```bash
mkdir -p ~/.openclaw/workspace/skills
unzip -oq apps/agent-skill/dist/markdocx-skill.zip -d ~/.openclaw/workspace/skills
```

Use a symlink only when you deliberately want a development-time deployment that continues to point at the local export directory.

## OpenClaw Example

OpenClaw supports workspace skills in `<workspace>/skills`, shared skills in `~/.openclaw/skills`, and additional skill roots via `skills.load.extraDirs`.

The most reliable manual deployment path today is:

1. Build the standalone export from this repository.
2. Copy or unzip the exported `markdocx-skill` artifact into the OpenClaw skills folder.

Example:

```bash
git clone <this-repo-url> ~/src/markdocx
cd ~/src/markdocx
npm install
npm run export:agent-skill

mkdir -p ~/.openclaw/workspace/skills
cp -R ~/src/markdocx/apps/agent-skill/dist/markdocx-skill ~/.openclaw/workspace/skills/markdocx-skill
```

Zip-based deployment works too:

```bash
mkdir -p ~/.openclaw/workspace/skills
unzip -oq ~/src/markdocx/apps/agent-skill/dist/markdocx-skill.zip -d ~/.openclaw/workspace/skills
```

Why copy or unzip is recommended:

- OpenClaw sees the deployed skill at the meaningful public name `markdocx-skill`
- the deployed skill carries its own runtime dependencies
- deployment no longer depends on the source checkout being present at runtime

If you prefer a symlink for a local development loop:

```bash
ln -sfn ~/src/markdocx/apps/agent-skill/dist/markdocx-skill ~/.openclaw/workspace/skills/markdocx-skill
```

Optional OpenClaw allowlist configuration:

```json
{
  "agents": {
    "defaults": {
      "skills": ["markdocx-skill"]
    }
  }
}
```

OpenClaw notes:

- OpenClaw loads skills from `<workspace>/skills` with highest precedence.
- If OpenClaw skill watching is enabled, changes are picked up on the next agent turn.
- If a session already snapshotted its skills, starting a new session is the safest way to verify a fresh install.

## Alternative OpenClaw Deployment

If you do not want to place the skill under the workspace skills folder, you can also keep a dedicated skills root and add it to `skills.load.extraDirs` in `~/.openclaw/openclaw.json`.

Example:

```json
{
  "skills": {
    "load": {
      "extraDirs": [
        "~/src/markdocx/apps"
      ]
    }
  }
}
```

In that model, OpenClaw scans the extra directory for skill folders. Prefer pointing it at a deploy-only export tree rather than the live repository checkout.

With the standalone export flow, you can also point `skills.load.extraDirs` at the exported parent directory if you want a deploy-only skills tree separate from the source checkout.

## Supported Parameters

- `inputPath`: local Markdown file path. Required unless `markdown` is provided.
- `markdown`: inline Markdown content. Required unless `inputPath` is provided.
- `baseDir`: base directory for resolving relative images when `markdown` is provided. Defaults to the current working directory.
- `outputPath`: optional `.docx` output path. If omitted for `inputPath`, the skill writes next to the Markdown file.
- `stylePreset`: shared style preset name.
- `marginPreset`: shared margin preset override.
- `styleJson`: shared style JSON as a string, plain object, or JSON file path.
- `styleSet`: shared dotted-path overrides as a semicolon-separated string or array of strings.

## Environment Defaults

The skill honors the same environment defaults as the CLI:

- `MARKDOCX_STYLE_PRESET`
- `MARKDOCX_MARGIN_PRESET`
- `MARKDOCX_STYLE_JSON`
- `MARKDOCX_STYLE_SET`

Explicit skill parameters override environment values by option kind through `resolveNodeStyleOptions()`.

## Mermaid

Mermaid conversion stays optional on the Node host path.

- Source-tree usage: install `@markdocx/runtime-node-mermaid` if the Markdown contains Mermaid blocks.
- Standard export: Mermaid stays disabled by default. If the deployed skill sees Mermaid, it fails clearly and tells the operator to re-export with `--with-mermaid` or provision Mermaid support separately.
- Mermaid-enabled export: use `npm run export:agent-skill:mermaid`. That profile installs `@markdocx/runtime-node-mermaid`, vendors a Chromium browser into the export, probes the working launch args, writes both into `markdocx-export-manifest.json`, and verifies a real Mermaid render during export.

If you want to override the bundled browser on the target host, set `PUPPETEER_EXECUTABLE_PATH` to a compatible Chromium or Chrome binary.

On minimal Debian or Ubuntu hosts, Mermaid-enabled exports may still fail if Chromium shared libraries are missing. If you have root access, let Puppeteer try to install them while exporting:

```bash
sudo MARKDOCX_PUPPETEER_INSTALL_DEPS=1 npm run test:export:agent-skill:mermaid
```

If you prefer to install the Linux dependencies manually on Debian or Ubuntu, start with:

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

If the host is a container or restricted environment, you may also need:

```bash
MARKDOCX_PUPPETEER_NO_SANDBOX=1
```

If Chromium fails with `No usable sandbox!`, rerun the Mermaid export gate as:

```bash
MARKDOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```

On minimal Ubuntu VPS hosts, you may need both environment variables together:

```bash
sudo MARKDOCX_PUPPETEER_INSTALL_DEPS=1 MARKDOCX_PUPPETEER_NO_SANDBOX=1 npm run test:export:agent-skill:mermaid
```
