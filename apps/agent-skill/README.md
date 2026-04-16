# marktodocx Agent Skill

This app is the thin agent-skill host for marktodocx. It reuses the shared Node runtime family in `@marktodocx/runtime-node` and only owns skill-facing parameter parsing, input resolution, and optional output writing.

## Naming

- Source app directory: `apps/agent-skill/`
- Workspace package name: `marktodocx-agent-skill`
- Public Claude skill name: `marktodocx-skill`

These names intentionally serve different purposes. The source app directory and workspace package are internal implementation details; the deployed Claude skill identity is controlled by the `name` field in `SKILL.md`.

## Entry Point

- `skill.mjs` exports `convertWithAgentSkill()` for programmatic skill execution.

## Quickstart

### Claude Code

Build the standalone export first:

```bash
npm install
npm run export:agent-skill
```

Then copy it into the default Claude Code skills root:

```bash
mkdir -p ~/.claude/skills
cp -R apps/agent-skill/dist/marktodocx-skill ~/.claude/skills/marktodocx-skill
```

If you prefer zip-based deployment:

```bash
mkdir -p ~/.claude/skills
unzip -oq apps/agent-skill/dist/marktodocx-skill.zip -d ~/.claude/skills
```

Start a new Claude Code session after deploying or updating the skill.

`SKILL.md` sets `disable-model-invocation: true`, so during normal Claude Code use:

- make sure the skill is available through your configured skills directory or allowlist
- do not expect Claude to opportunistically auto-pick it in the background
- invoke it explicitly with a conversion request when you want Markdown turned into DOCX

Example prompts:

- `Convert docs/report.md to DOCX with stylePreset=minimal.`
- `Convert docs/report.md to dist/report.docx with marginPreset=wide.`
- `Convert this Markdown to /tmp/notes.docx using styleSet=body.fontSizePt=12:` followed by inline Markdown content.

### OpenClaw

Build the same standalone export, then copy or unzip it into your OpenClaw skills directory:

```bash
mkdir -p ~/.openclaw/workspace/skills
cp -R apps/agent-skill/dist/marktodocx-skill ~/.openclaw/workspace/skills/marktodocx-skill
```

or:

```bash
mkdir -p ~/.openclaw/workspace/skills
unzip -oq apps/agent-skill/dist/marktodocx-skill.zip -d ~/.openclaw/workspace/skills
```

## Invocation Behavior

`SKILL.md` sets `disable-model-invocation: true`.

In practice that means:

- the skill should be made available through your host's skill loading or allowlist configuration
- the model should not opportunistically auto-pick it in the background
- users should invoke it explicitly with a conversion request when they want Markdown turned into DOCX

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
- writes a distributable zip archive at `apps/agent-skill/dist/marktodocx-skill.zip`
- smoke-tests that exported folder from an isolated temporary directory
- verifies the exported layout in a CI-safe follow-up check when using `npm run test:export:agent-skill`

Profile behavior:

- `npm run export:agent-skill` keeps Mermaid optional. The export includes the optional Mermaid tarball in `vendor/`, but does not install `@marktodocx/runtime-node-mermaid` into `node_modules/` and does not bundle Chromium.
- `npm run export:agent-skill:mermaid` installs `@marktodocx/runtime-node-mermaid`, vendors a pinned Chromium browser into the export, probes the working Chromium launch args on the export host, writes them into the runtime manifest, and runs a real Mermaid render smoke test before the export succeeds.
- Mermaid-enabled exports are platform-specific because the vendored browser is built for the host platform that ran the export.
- Mermaid-enabled exports still require the host OS to provide Chromium's Linux shared libraries. Minimal VPS images often miss packages such as `libatk1.0-0`.
- A malformed `marktodocx-export-manifest.json` is treated as a hard deployment error. The skill fails loudly instead of guessing around a corrupt Mermaid export.

The exported artifact lives at:

```text
apps/agent-skill/dist/marktodocx-skill/
```

And the archive artifact lives at:

```text
apps/agent-skill/dist/marktodocx-skill.zip
```

That directory is self-contained for deployment: it includes `SKILL.md`, `skill.mjs`, a generated `package.json`, vendored workspace tarballs, and installed runtime dependencies under `node_modules/`.

It also includes `marktodocx-export-manifest.json`, which records whether the export is `standard` or `with-mermaid`. Mermaid-enabled exports also record the vendored browser path and any required launch arguments there, so deployments on the same host usually do not need manual sandbox flags.

## Manual Deployment

For deployment, use the exported folder instead of the live repository source tree.

Build it first:

```bash
npm install
npm run export:agent-skill
```

Then deploy this directory:

```text
apps/agent-skill/dist/marktodocx-skill/
```

Copying only `SKILL.md` is still not enough. Deploy the whole exported folder.

This exported folder no longer depends on a live marktodocx repository checkout.

If your target runtime prefers a single-file handoff, deploy the zip archive and extract it into the target skills directory.

Common deployment roots:

- Claude Code default skills root: `~/.claude/skills/`
- OpenClaw workspace skills root: `~/.openclaw/workspace/skills/`

Use a symlink only when you deliberately want a development-time deployment that continues to point at the local export directory.

## OpenClaw Example

OpenClaw supports workspace skills in `<workspace>/skills`, shared skills in `~/.openclaw/skills`, and additional skill roots via `skills.load.extraDirs`.

The most reliable manual deployment path today is:

1. Build the standalone export from this repository.
2. Copy or unzip the exported `marktodocx-skill` artifact into the OpenClaw skills folder.

Example:

```bash
git clone <this-repo-url> ~/src/marktodocx
cd ~/src/marktodocx
npm install
npm run export:agent-skill

mkdir -p ~/.openclaw/workspace/skills
cp -R ~/src/marktodocx/apps/agent-skill/dist/marktodocx-skill ~/.openclaw/workspace/skills/marktodocx-skill
```

Zip-based deployment works too:

```bash
mkdir -p ~/.openclaw/workspace/skills
unzip -oq ~/src/marktodocx/apps/agent-skill/dist/marktodocx-skill.zip -d ~/.openclaw/workspace/skills
```

Why copy or unzip is recommended:

- OpenClaw sees the deployed skill at the meaningful public name `marktodocx-skill`
- the deployed skill carries its own runtime dependencies
- deployment no longer depends on the source checkout being present at runtime

If you prefer a symlink for a local development loop:

```bash
ln -sfn ~/src/marktodocx/apps/agent-skill/dist/marktodocx-skill ~/.openclaw/workspace/skills/marktodocx-skill
```

Optional OpenClaw allowlist configuration:

```json
{
  "agents": {
    "defaults": {
      "skills": ["marktodocx-skill"]
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
        "~/src/marktodocx/apps"
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

- `MARKTODOCX_STYLE_PRESET`
- `MARKTODOCX_MARGIN_PRESET`
- `MARKTODOCX_STYLE_JSON`
- `MARKTODOCX_STYLE_SET`

Explicit skill parameters override environment values by option kind through `resolveNodeStyleOptions()`.

## Mermaid

Mermaid conversion stays optional on the Node host path.

- Source-tree usage: install `@marktodocx/runtime-node-mermaid` if the Markdown contains Mermaid blocks.
- Standard export: Mermaid stays disabled by default. If the deployed skill sees Mermaid, it fails clearly and tells the operator to re-export with `--with-mermaid` or provision Mermaid support separately.
- Mermaid-enabled export: use `npm run export:agent-skill:mermaid`. That profile installs `@marktodocx/runtime-node-mermaid`, vendors a Chromium browser into the export, probes the working launch args, writes both into `marktodocx-export-manifest.json`, and verifies a real Mermaid render during export.

If you want to override the bundled browser on the target host, set `PUPPETEER_EXECUTABLE_PATH` to a compatible Chromium or Chrome binary.

For Linux shared libraries, sandbox restrictions, and the full `MARKTODOCX_PUPPETEER_*` troubleshooting matrix, see the root README section [Linux shared libraries missing for Chromium](../../README.md#linux-shared-libraries-missing-for-chromium).
