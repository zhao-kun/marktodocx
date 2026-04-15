# Publishing Guide

This document is the maintainer-facing release guide for markdocx. It covers the three hosts that ship to public registries (VS Code Marketplace, Chrome Web Store, ClawHub) and explicitly states the CLI release policy.

User-facing listing copy lives next to each host:

- `apps/vscode-extension/README.md` — VS Code Marketplace listing
- `apps/chrome-extension/README.md` — Chrome Web Store listing
- `apps/agent-skill/INTRO.md` — ClawHub listing
- `apps/agent-skill/README.md` — manual / developer deployment recipes

This file owns the release **process**, not the listing copy.

## Contents

- [Versioning Policy](#versioning-policy)
- [Pre-Release Checklist (All Hosts)](#pre-release-checklist-all-hosts)
- [VS Code Marketplace (vscode-extension)](#vs-code-marketplace-vscode-extension)
- [Chrome Web Store (chrome-extension)](#chrome-web-store-chrome-extension)
- [Agent Skill (ClawHub)](#agent-skill-clawhub)
- [CLI Release Policy (Source-Only)](#cli-release-policy-source-only)
- [Coordination Across Hosts](#coordination-across-hosts)

## Versioning Policy

- All hosts follow semver.
- Each host owns its own version in its own `package.json`. Versions are independent — bumping the VS Code extension does not require bumping the Chrome extension.
- The Chrome extension's `manifest.json` `version` field is **always** synced from `apps/chrome-extension/package.json` at build time by the `markdocx-sync-manifest-version` Vite plugin. Do not edit `public/manifest.json` `version` by hand — it is treated as a placeholder (`0.0.0`) and overwritten in `dist/manifest.json` during `npm run build:chrome-extension`.
- Tag releases on `main` as `<host>-v<version>` (for example `vscode-extension-v0.1.0`, `chrome-extension-v0.1.0`, `agent-skill-v0.1.0`). Tags drive GitHub Release artifact names.

## Pre-Release Checklist (All Hosts)

Before publishing any host:

1. The working tree is clean and pulled to latest `main`.
2. `npm install` has been run from the repo root.
3. `npm run test:parity:all` is green. This runs the extension, CLI, VS Code, and agent-skill parity gates and is the canonical pre-ship gate.
4. The host's `package.json` `version` has been bumped.
5. The CHANGELOG (or commit body) mentions what changed for this host.

If any of these fail, do not publish.

## VS Code Marketplace (vscode-extension)

### Prerequisites (one-time)

1. Register a Marketplace publisher at https://marketplace.visualstudio.com/manage. The current `apps/vscode-extension/package.json` declares `"publisher": "zhao-kun"`, so register the publisher ID `zhao-kun`. If you choose a different publisher ID, change `publisher` in `apps/vscode-extension/package.json` to match before publishing.
2. Generate an Azure DevOps Personal Access Token with the **Marketplace → Manage** scope. The PAT is what `vsce login` consumes. Treat it like a password.
3. Install the publisher CLI globally (or use `npx`):
   ```bash
   npm install -g @vscode/vsce
   ```
4. Log in once on this machine:
   ```bash
   vsce login zhao-kun
   ```
   `vsce` will prompt for the PAT.

### Per-release flow

1. Bump `apps/vscode-extension/package.json` `version`.
2. From the repo root, build and package the VSIX:
   ```bash
   npm install
   npm run package:vscode-extension
   ```
   Output: `apps/vscode-extension/dist/markdocx-vscode-extension.vsix`.
3. Smoke-install the VSIX locally to confirm it loads in a clean window:
   ```bash
   code --install-extension apps/vscode-extension/dist/markdocx-vscode-extension.vsix --force
   ```
   Reload, run **markdocx: Convert Markdown to DOCX** on a sample file, and confirm a `.docx` is produced.
4. Publish to the Marketplace:
   ```bash
   cd apps/vscode-extension
   npx @vscode/vsce publish
   ```
   `vsce publish` reads the version from `package.json`. To bump and publish in one step you can also use `vsce publish patch` / `minor` / `major`.
5. Confirm the listing went live at:
   ```
   https://marketplace.visualstudio.com/items?itemName=zhao-kun.markdocx-vscode-extension
   ```
   This URL will return HTTP 404 until the first successful `vsce publish`. After that, every subsequent publish updates the same listing.
6. Tag and push:
   ```bash
   git tag vscode-extension-v<version>
   git push origin vscode-extension-v<version>
   ```
7. Attach the same `.vsix` to a GitHub Release for the tag, in case users want a manual install.

### What the package contains

`vsce` packages everything in `apps/vscode-extension/` except what `.vscodeignore` excludes. The current `.vscodeignore` ships `dist/`, `media/`, `LICENSE`, `README.md`, and `package.json`, and excludes `src/`, `webview/`, `scripts/`, `node_modules/`, vite configs, and source maps. The Marketplace listing is rendered from `README.md`.

### Listing assets

- Icon: `apps/vscode-extension/media/icon.png` (128×128, referenced by `package.json` `icon` field).
- Description: `package.json` `displayName` and `description`.
- Long description: `apps/vscode-extension/README.md`.
- Categories: `Formatters`, `Other`.
- Keywords: see `package.json` `keywords` — these drive Marketplace search.

If you change any of these, run `npm run package:vscode-extension` again so the next VSIX picks them up.

## Chrome Web Store (chrome-extension)

### Prerequisites (one-time)

1. Register at https://chrome.google.com/webstore/devconsole/ and pay the one-time $5 developer fee.
2. Verify your developer email.
3. Prepare and store the listing assets in a stable place (do not commit large promo images to the repo unless you want them under version control):
   - **Store icon**: 128×128 PNG (the existing `apps/chrome-extension/public/icons/icon-128.png` works as the source).
   - **Screenshots**: at least one 1280×800 or 640×400 PNG showing the popup with a folder selected and the convert button.
   - **Small promo tile**: 440×280 PNG.
   - **Privacy policy URL**: a public URL describing what the extension does and does not collect. The Privacy section in `apps/chrome-extension/README.md` is suitable; host it via the GitHub Pages of this repo or link to the README anchor on github.com.

### Per-release flow

1. Bump `apps/chrome-extension/package.json` `version`. Do **not** edit `public/manifest.json` `version` — it is overwritten at build time.
2. From the repo root, build the extension:
   ```bash
   npm install
   npm run build:chrome-extension
   ```
   Verify `apps/chrome-extension/dist/manifest.json` `version` matches `package.json` after the build.
3. Smoke-load `apps/chrome-extension/dist/` as an unpacked extension in `chrome://extensions/` (Developer mode), select the test folder, and confirm a `.docx` is produced.
4. Zip the unpacked build:
   ```bash
   cd apps/chrome-extension/dist
   zip -r ../markdocx-chrome-extension.zip .
   ```
5. Upload the zip to the Web Store Developer Dashboard. The dashboard path differs for the first release vs. subsequent releases:
   - **First release**: open https://chrome.google.com/webstore/devconsole/, click **Add new item**, accept the developer agreement if prompted, then upload `apps/chrome-extension/markdocx-chrome-extension.zip` on the resulting screen.
   - **Subsequent releases**: open https://chrome.google.com/webstore/devconsole/, click the existing **markdocx** item in the items table, then click **Package → Upload new package** and upload the same zip.
6. Fill in the listing fields. **All listed fields are required for the first release**; for subsequent releases, only update the ones that changed:
   - **Title**: `markdocx`
   - **Summary**: one-line description (matches `apps/chrome-extension/public/manifest.json` `description`)
   - **Description**: paste the body of `apps/chrome-extension/README.md`
   - **Category**: `Productivity`
   - **Language**: English
   - **Store icon**: `apps/chrome-extension/public/icons/icon-128.png`
   - **Screenshots**: at least one 1280×800 or 640×400 PNG
   - **Small promo tile**: 440×280 PNG (optional but recommended)
   - **Privacy policy URL**: required because the extension declares a permission
   - **Permission justification**: explain `offscreen` is used only for in-extension Mermaid rendering and there is no network access
   - **Single-purpose description**: "Convert local Markdown files to Word .docx documents"
   - **Distribution**: Public (or Unlisted if you want to share by direct URL only during early testing)
7. Submit for review. First-time listings typically take a few business days; updates are usually faster.
8. Tag and push:
   ```bash
   git tag chrome-extension-v<version>
   git push origin chrome-extension-v<version>
   ```
9. Attach the same `markdocx-chrome-extension.zip` to a GitHub Release for the tag, in case users want a manual unpacked install.

### Common rejection causes to avoid

- Reusing the same `manifest.json` `version` as a previous upload — the dashboard rejects identical versions. Always bump.
- Permission requests not explained in the justification field.
- A privacy policy URL that is unreachable or that contradicts the listing.

## Agent Skill (ClawHub)

The agent skill is published to ClawHub, the OpenClaw skill registry, and mirrored as a GitHub Release for users who do not use ClawHub.

### Prerequisites (one-time)

1. A GitHub account at least one week old (ClawHub's minimum age requirement).
2. Install the ClawHub CLI globally:
   ```bash
   npm install -g clawhub
   ```
3. Log in once on this machine:
   ```bash
   clawhub login
   ```
   This opens a browser flow. For headless machines use `clawhub login --token <token> --no-browser`.

### Per-release flow

1. Bump `apps/agent-skill/package.json` `version` and update `SKILL.md` if any user-facing parameters changed.
2. From the repo root, build the standalone export:
   ```bash
   npm install
   npm run export:agent-skill
   ```
   Output:
   - `apps/agent-skill/dist/markdocx-skill/` — the self-contained skill folder
   - `apps/agent-skill/dist/markdocx-skill.zip` — the distributable archive
3. Run the export verification:
   ```bash
   npm run test:export:agent-skill
   ```
   This rebuilds the export and verifies the artifact layout in a CI-safe way.
4. Publish to ClawHub:
   ```bash
   clawhub skill publish apps/agent-skill/dist/markdocx-skill \
     --slug markdocx-skill \
     --name "markdocx-skill" \
     --version <version> \
     --changelog "<short release notes>" \
     --tags markdown,docx,word,mermaid,export
   ```
   The path argument points at the **exported** folder, not the source `apps/agent-skill/` directory. ClawHub expects a `SKILL.md` at the root of that folder, which the export already includes.
5. Confirm the new version is browseable on ClawHub.
6. Tag and push:
   ```bash
   git tag agent-skill-v<version>
   git push origin agent-skill-v<version>
   ```
7. Cut a GitHub Release for the tag and attach `apps/agent-skill/dist/markdocx-skill.zip`. Use the body of `apps/agent-skill/INTRO.md` as the release description.

### Mermaid-enabled releases

Mermaid-enabled exports are platform-specific because they vendor a Chromium binary built for the export host. If you want to publish a Mermaid-enabled variant:

1. Run the Mermaid export profile on the target deployment platform:
   ```bash
   npm run export:agent-skill:mermaid
   ```
2. Verify the export with the Mermaid layout check:
   ```bash
   npm run test:export:agent-skill:mermaid
   ```
3. Publish to ClawHub as a separate slug or version tag (e.g. add a `with-mermaid-linux-x64` tag), so users on other platforms do not accidentally install a binary that does not run.
4. Attach the Mermaid-enabled zip to a separate GitHub Release asset clearly labelled with the host OS and architecture.

The standard export keeps Mermaid disabled and fails clearly if the deployed skill encounters a Mermaid block. That behavior is intentional — see `apps/agent-skill/README.md` for the full Mermaid story.

### `disable-model-invocation` note

The `SKILL.md` frontmatter sets `disable-model-invocation: true`. This is intentional: the skill writes files and should be invoked explicitly, not opportunistically picked up by a model in the background. Document this clearly in any ClawHub release notes so users know they must invoke `markdocx-skill` by name.

## CLI Release Policy (Source-Only)

The CLI is intentionally **source-only**. There is no npm release for it.

- Entry point: `md-to-docx.mjs` at the repo root.
- Install: clone the repository and run `npm install`.
- Use: `node md-to-docx.mjs <input.md>`.
- Mermaid: install the optional `@markdocx/runtime-node-mermaid` package or run `npx puppeteer browsers install chrome` per the root README.

The root `package.json` is and should remain `private: true`. Do not add a `bin` entry, do not publish the root workspace to npm, and do not set up a GitHub Release artifact for the CLI on its own — its release surface is the repository itself. Major CLI behavior changes are surfaced through commit history and the root `README.md` CLI section.

If we ever decide to ship a real npm CLI, it will live under `packages/cli/` as its own publishable workspace, with its own `package.json`, `bin`, `files`, and `prepublishOnly` build. That is intentionally out of scope today.

## Coordination Across Hosts

- Output parity is the hard ship-gate. Run `npm run test:parity:all` before any publish, regardless of which host is going out.
- Host versions are independent, but if a fix lands in `@markdocx/core` or one of the runtime packages and changes user-visible output, plan to release **all** affected hosts in the same window so users do not get split behavior across tools.
- Release order recommendation when shipping a coordinated change:
  1. Tag the merge commit on `main`.
  2. Publish the agent skill to ClawHub (slowest registry to refresh, fastest to verify with a one-line install).
  3. Publish the Chrome extension (slowest to verify because of Web Store review).
  4. Publish the VS Code extension last (fastest review, easiest to roll forward).
- Update root `README.md` if a host's listing URL changes or a registry status changes (for example, the first time a host is actually live on its registry).
