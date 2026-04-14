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

This skill is currently source-distributed. There is no separate compiled runtime bundle yet. The current build step validates the skill frontmatter and runs a conversion smoke test.

From the repository root:

```bash
npm install
npm run build:agent-skill
```

What this does:

- installs the workspace dependencies required by `skill.mjs`
- validates `SKILL.md`
- runs a sample Markdown-to-DOCX conversion through `convertWithAgentSkill()`

What this does not do:

- it does not produce a standalone deployable binary
- it does not bundle `@markdocx/runtime-node` into a self-contained artifact

Because of that, the supported manual deployment model today is to deploy from a repository checkout that has already run `npm install`.

## Manual Deployment

To deploy this skill manually to another agent runtime, keep these files together in a working repository checkout:

- `apps/agent-skill/SKILL.md`
- `apps/agent-skill/skill.mjs`
- the repository root `node_modules/` created by `npm install`
- the local workspace packages under `packages/`

Copying only `SKILL.md` is not enough, because `skill.mjs` imports the shared runtime from the repository workspace.

If the target agent runtime supports loading skills from an external directory, the simplest approach is to point it at this repository checkout rather than trying to repack the skill by hand.

## OpenClaw Example

OpenClaw supports workspace skills in `<workspace>/skills`, shared skills in `~/.openclaw/skills`, and additional skill roots via `skills.load.extraDirs`.

The most reliable manual deployment path today is:

1. Clone this repository onto the same machine that runs OpenClaw.
2. Run `npm install` and `npm run build:agent-skill` in the repository root.
3. Expose the skill to OpenClaw by symlinking the source skill directory into the OpenClaw skills folder.

Example:

```bash
git clone <this-repo-url> ~/src/markdocx
cd ~/src/markdocx
npm install
npm run build:agent-skill

mkdir -p ~/.openclaw/workspace/skills
ln -sfn ~/src/markdocx/apps/agent-skill ~/.openclaw/workspace/skills/markdocx-skill
```

Why the symlink approach is recommended:

- OpenClaw sees the deployed skill at the meaningful public name `markdocx-skill`
- Node module resolution still works against the original repository checkout
- updating the repository source updates the deployed skill without a second copy

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

In that model, OpenClaw scans the extra directory for skill folders and loads this skill from the repository checkout directly.

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

Mermaid conversion stays optional on the Node host path. If the Markdown contains Mermaid blocks, install `@markdocx/runtime-node-mermaid`; otherwise the skill fails fast with the same message as the CLI path.