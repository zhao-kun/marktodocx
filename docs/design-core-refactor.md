# Design Document: Shared Core + Two Runtime Families

**Status:** Proposed
**Predecessor:** `docs/design-chrome-extension.md` (Chrome extension Phases 0-7 implemented)
**Target hosts:** Chrome extension, VSCode extension, CLI, Agent skill

---

## 1. Background

### 1.1 Current State

markdocx currently has two conversion surfaces with different implementation maturity:

1. **CLI** - `md-to-docx.mjs`, a Node.js monolith with its own Markdown-to-DOCX pipeline.
2. **Chrome extension** - `markdocx-extension/`, the newer modular implementation with shared renderer modules, style/layout support, and the latest behavior fixes.

As of Chrome extension Phase 7 completion, the Chrome extension is the most complete implementation and already supports:

- Markdown to DOCX conversion for headings, lists, tables, code blocks, local images, and Mermaid diagrams.
- Style presets and advanced style overrides.
- Layout presets and margin-aware rendering.
- The current output behavior we want to preserve and generalize.

The VSCode extension and agent skill do not exist yet.

### 1.2 Product Goal

We want one repository that supports the same Markdown-to-DOCX capability in four tools:

1. **Chrome extension** - already implemented.
2. **VSCode extension** - new.
3. **CLI** - existing, but should be refactored.
4. **Agent skill** - new.

The repository should be organized so future fixes and features are added once to shared logic rather than copied across hosts.

### 1.3 Feature Requirements

The refactor must support these product requirements:

1. All four tools must convert the same Markdown file into the same DOCX result.
2. The Chrome extension remains the implemented and validated starting point for the refactor.
3. VSCode extension support must be added without forking conversion behavior from the Chrome extension.
4. CLI and agent skill must support custom style configuration without UI.
5. CLI style configuration must be available through arguments and environment variables.
6. Agent skill style configuration must be available through skill parameters and environment variables.
7. Browser-hosted tools may provide UI for style configuration, but they must map to the same shared style schema used by CLI and skill.
8. Mermaid, code highlighting, local image handling, table normalization, blockquote handling, and style/layout rules must stay consistent across hosts.

### 1.4 Non-Functional Requirements

The refactor must also satisfy these non-functional requirements:

1. Repository structure must become cleaner and easier to understand than today.
2. Conversion logic must be shared as much as possible, but we should not force one runtime model everywhere if that creates large complexity or poor operational tradeoffs.
3. CLI and agent skill should stay as small as possible in install size, dependency surface, and startup path.
4. Output parity is a hard requirement. Smaller host packages are important, but they are a secondary optimization after parity.
5. Host-specific code should stay thin and obvious.
6. The project must have a clear parity test strategy so regressions are caught early.
7. If a host cannot satisfy parity for a feature under its default runtime, it should fail clearly rather than silently produce a different result.

### 1.5 Design Constraint

There is a real boundary between browser environments and Node environments.

The previous draft tried to unify all hosts behind one browser-centered runtime. That maximizes code reuse, but it makes the CLI and agent skill operationally heavy because they inherit a browser launcher as their primary execution model.

This design takes a different approach:

- **Share the conversion core and contracts.**
- **Allow two runtime families.**
- **Enforce identical output through parity tests, version pinning, and shared fixtures.**

This keeps the repository clean without forcing the entire project into a single runtime shape that does not fit every host equally well.

### 1.6 Non-Goals

This refactor does not aim to:

- Redesign the Chrome extension UI.
- Replace `html-to-docx` in this phase.
- Introduce new Markdown feature families unrelated to parity and host support.
- Promise byte-identical package archives; the goal is normalized DOCX output equivalence.

---

## 2. Decision Summary

We will refactor markdocx into:

1. A **shared conversion core** that owns the canonical Markdown-to-DOCX rules, style schema, layout schema, normalization behavior, and parity fixtures.
2. A **browser runtime family** used by the Chrome extension and the VSCode extension.
3. A **Node runtime family** used by the CLI and the agent skill.

This means we are **not** trying to make every host run the exact same runtime stack.

Instead, we are standardizing:

- The conversion rules.
- The option schema.
- The Mermaid configuration contract.
- The fixture corpus.
- The parity gates.

That is the correct tradeoff for this repository because:

- Chrome extension and VSCode extension naturally fit browser execution.
- CLI and agent skill naturally fit Node execution.
- Forcing CLI and skill to run the whole document pipeline in a headless browser makes the wrappers small in source lines but heavy in runtime and dependency cost.

### 2.1 Decision Comparison

We considered two architectural directions.

#### Rejected: One Runtime Everywhere

Shape:

- Chrome extension, VSCode extension, CLI, and agent skill all execute the full conversion pipeline inside the same browser-style runtime.
- CLI and skill become thin launchers around a browser bundle.

Why we are rejecting it:

1. It optimizes for implementation uniformity at the cost of operational weight.
2. It makes CLI and agent skill larger and slower than necessary.
3. It turns browser startup into a default dependency for the whole CLI and skill path.
4. It makes the repository conceptually simpler on paper, but less honest about runtime differences.

#### Accepted: Shared Core + Two Runtime Families

Shape:

- One shared core owns output rules and configuration contracts.
- Browser runtime family serves Chrome extension and VSCode extension.
- Node runtime family serves CLI and agent skill.
- A narrow browser-backed helper is allowed inside the Node family only where parity requires it, primarily for Mermaid.

Why we are accepting it:

1. It preserves the hard parity goal.
2. It keeps CLI and agent skill lighter on the common path.
3. It keeps host-specific code explicit and easier to reason about.
4. It matches the actual environment split instead of hiding it behind a forced abstraction.

---

## 3. Architectural Principles

### 3.1 Share Rules, Not Illusions

We should share the rules that define output, not pretend that browser and Node are the same environment.

### 3.2 Chrome Extension Is the Canonical Donor

The current Chrome extension is the best implementation we have. The shared core should be extracted from its modular code, not rebuilt from the old CLI monolith.

### 3.3 Two Runtime Families, One Output Contract

There may be different host adapters, but there must be one output contract. The parity suite, not architecture diagrams alone, is what guarantees this.

### 3.4 Fail Fast Over Silent Drift

If a host cannot produce the canonical result for a given feature, it should return a clear error instead of silently degrading to a different document.

### 3.5 Keep Node Hosts Lean

CLI and agent skill should remain mostly pure Node tools. Browser-backed helpers are acceptable only where they are the narrowest way to preserve parity for a specific feature, not as the default execution model for the whole conversion pipeline.

---

## 4. Target Architecture

### 4.1 Runtime Families

#### Browser Runtime Family

Used by:

- Chrome extension
- VSCode extension

Characteristics:

- Native `DOMParser`
- Native `Canvas` / `Image`
- In-page Mermaid rendering
- Browser-side Buffer polyfill for `html-to-docx`
- Style configuration through UI or settings

#### Node Runtime Family

Used by:

- CLI
- Agent skill

Characteristics:

- Node file system access
- Lightweight DOM adapter for HTML normalization
- Native Node Buffer path for `html-to-docx`
- Style configuration through args, parameters, and env vars
- Optional narrow browser-backed Mermaid helper only when strict parity requires it for Mermaid rendering

Important: the Node family does **not** run the whole document conversion inside Puppeteer. If a browser helper is needed, it is isolated to Mermaid rendering only.

### 4.2 Monorepo Layout

```text
markdocx/
├── package.json
├── scripts/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── index.js
│   │   │   ├── pipeline.js
│   │   │   ├── style/
│   │   │   ├── markdown/
│   │   │   ├── html/
│   │   │   ├── docx/
│   │   │   └── contracts/
│   │   └── package.json
│   ├── runtime-browser/
│   │   ├── src/
│   │   │   ├── index.js
│   │   │   ├── dom-native.js
│   │   │   ├── image-map.js
│   │   │   └── mermaid-browser.js
│   │   └── package.json
│   ├── runtime-node/
│   │   ├── src/
│   │   │   ├── index.js
│   │   │   ├── dom-linkedom.js
│   │   │   ├── image-fs.js
│   │   │   └── mermaid-adapter.js
│   │   └── package.json
│   └── runtime-node-mermaid/
│       ├── src/
│       │   ├── index.js
│       │   └── mermaid-puppeteer.js
│       └── package.json
├── apps/
│   ├── chrome-extension/
│   │   ├── package.json
│   │   └── src/
│   ├── vscode-extension/
│   │   ├── package.json
│   │   └── src/
│   ├── cli/
│   │   ├── package.json
│   │   └── bin/
│   └── agent-skill/
│       ├── SKILL.md
│       ├── package.json
│       └── skill.mjs
├── docs/
└── test-markdown/
```

Rationale:

- `packages/core` owns behavior.
- `packages/runtime-browser` and `packages/runtime-node` adapt the behavior to real environments.
- `packages/runtime-node-mermaid` is optional and narrow. It belongs to the Node runtime family, not a third product family.
- `apps/*` stay thin.

### 4.3 Shared Core Responsibilities

`@markdocx/core` owns the canonical conversion behavior:

- Style and layout schemas.
- Markdown parsing.
- Code block rendering and syntax highlighting.
- Mermaid block extraction and replacement contract.
- Local image resolution contract.
- Shared image inlining logic built on top of the image-resolution contract.
- Table and blockquote normalization rules.
- Full HTML document generation.
- DOCX generation and post-processing.
- Fixture-driven parity utilities.

`syntax-highlighter.js` belongs in core because it is pure JavaScript and has no DOM dependency.

`@markdocx/core` must not depend on:

- `chrome.*`
- `node:*`
- `fs`
- `puppeteer`
- VSCode APIs

`@markdocx/core` may depend on pure libraries such as:

- `markdown-it`
- `highlight.js`
- `html-to-docx`
- `jszip`

### 4.4 Shared Contracts

The core should depend on contracts, not host globals.

Minimum runtime contract:

```js
/**
 * @typedef {Object} ParsedHtml
 * @property {Document} document
 * @property {Element} body
 *
 * @typedef {Object} ResolveImageRequest
 * @property {string} src
 * @property {string} baseDir
 * @property {object=} context
 *
 * @typedef {Object} ResolveImageResult
 * @property {string} dataUri
 *
 * @typedef {Object} MermaidRenderResult
 * @property {string} htmlFragment
 *
 * @typedef {Object} LayoutMetrics
 * @property {number} contentWidthPx
 * @property {number} contentHeightPx
 *
 * @typedef {Object} MarkdocxRuntime
 * @property {(request: ResolveImageRequest) => Promise<ResolveImageResult | null>} resolveImage
 * @property {(html: string) => ParsedHtml} parseHtml
 * @property {(code: string, index: number, layoutMetrics: LayoutMetrics) => Promise<MermaidRenderResult>} renderMermaid
 */
```

`ParsedHtml` is intentionally a narrow contract. Core is allowed to rely only on this DOM subset:

Document methods:

- `createElement`
- `createTextNode`
- `createDocumentFragment`

Element methods and properties:

- `querySelector`
- `querySelectorAll`
- `getAttribute`
- `setAttribute`
- `removeAttribute`
- `innerHTML`
- `children`

Node methods and properties:

- `appendChild`
- `replaceWith`
- `cloneNode`
- `textContent`
- `childNodes`
- `parentNode`

If core needs anything beyond this subset, the design contract must be expanded explicitly and tested against both browser and Node adapters.

If core uses `innerHTML` for serialization, not just mutation, the parity fixture set must include an adapter-serialization test that diffs serialized output for identical input between native DOM and linkedom.

Core only uses `cloneNode(true)` on HTML elements. It does not use cloning on SVG trees.

The same HTML normalization fixture set must be executed against both adapters so adapter compatibility is verified by tests, not assumed.

`resolveImage` uses a request object because browser and Node hosts do not interpret path context the same way. Browser hosts can ignore `baseDir` and rely on `context.imageMap`; Node hosts can use `src` plus `baseDir` directly.

`renderMermaid` must return one canonical HTML fragment shape:

```html
<div class="mermaid-diagram"><img src="data:image/png;base64,..." alt="Mermaid diagram N"></div>
```

That fragment shape is part of the contract. Hosts must not return a bare data URI or a structurally different wrapper.

Buffer handling is intentionally outside the runtime contract. `@markdocx/core` stays import-clean; browser Buffer polyfills are the responsibility of the browser runtime/app bundling layer, and Node uses native Buffer. Consumers of `@markdocx/core` in a browser environment must have Buffer polyfilled at module-load time, not only at call time, because `html-to-docx` touches Buffer during module initialization.

The shared pipeline stays the same across hosts:

1. Resolve style options.
2. Resolve layout metrics.
3. Extract Mermaid blocks.
4. Ask the runtime to render Mermaid.
5. Render Markdown into HTML.
6. Resolve local images through the runtime and inline them through shared core logic.
7. Normalize tables and blockquotes through the runtime DOM adapter.
8. Build the full HTML document.
9. Convert HTML to DOCX.
10. Return `Uint8Array` bytes.

### 4.5 Browser Runtime Responsibilities

`@markdocx/runtime-browser` should provide:

- `parseHtml` via native `DOMParser`
- `resolveImage` via preloaded `imageMap`
- `renderMermaid` via the current browser Mermaid + Canvas implementation
- Buffer polyfill integration for browser builds

This runtime family is the natural fit for:

- Chrome extension offscreen document
- VSCode extension hidden webview

### 4.6 Node Runtime Responsibilities

`@markdocx/runtime-node` should provide:

- `resolveImage` via filesystem reads
- `parseHtml` via a lightweight DOM adapter such as `linkedom`
- native Node `html-to-docx` path
- the same shared style and layout schema used everywhere else

For Mermaid, Node runtime should use this rule:

1. **Default requirement:** preserve parity with browser-family output.
2. **Implementation preference:** keep the main document pipeline pure Node.
3. **Chosen helper mechanism:** use `@markdocx/runtime-node-mermaid`, implemented as a narrow Puppeteer-based Mermaid renderer with a Puppeteer version pinned in package management so the bundled Chromium version is pinned implicitly. The default plan is to use bundled Chromium, not an externally managed browser.
4. **Install tradeoff:** CLI and agent skill stay lean for non-Mermaid documents. Mermaid documents require the Node Mermaid helper package to be installed and available.
5. **Failure behavior:** if the document contains Mermaid and the parity-preserving Mermaid helper is unavailable, fail with a clear error rather than emit a divergent document.
6. **Execution mode:** `@markdocx/runtime-node-mermaid` runs Puppeteer in headless `new` mode. CI images must install the Puppeteer Linux dependency set required by Chromium.

This keeps the heavy browser dependency off the main CLI and skill path for non-Mermaid documents while still honoring the parity requirement when Mermaid is used.

Version pinning is mandatory for deterministic output:

- one Mermaid version across the repository
- one `html-to-docx` version across the repository
- one Chromium version implicitly pinned by the pinned Puppeteer version used in `@markdocx/runtime-node-mermaid`

The root workspace manifest should enforce this with `overrides` so workspaces cannot drift silently.

---

## 5. Host Integrations

### 5.1 Chrome Extension

Status: already implemented and currently the best source of truth.

Plan:

- Keep the existing UI and conversion flow.
- Move conversion modules from `markdocx-extension/src/lib/` into `@markdocx/core` and `@markdocx/runtime-browser`.
- Keep the page and background layers thin.
- Use the current extension output as the initial golden reference during migration.

### 5.2 VSCode Extension

Plan:

- Use the browser runtime family in a hidden webview.
- The webview hosts the browser runtime and core bundle.
- The extension host handles command registration, workspace file access, style settings, and output file writing.
- Use `retainContextWhenHidden: true` for a single retained hidden webview so runtime startup and Mermaid initialization are amortized across conversions. This costs memory, but it is the preferred tradeoff for parity and responsiveness.
- The browser runtime bundle used in the webview must be self-contained, loaded through `asWebviewUri`, and compatible with strict webview CSP.

Why this family:

- VSCode already provides a browser-capable webview.
- This keeps VSCode aligned with Chrome extension behavior.
- It avoids splitting browser-specific rendering rules between Chrome and VSCode.

### 5.3 CLI

Plan:

- Rebuild CLI on the Node runtime family.
- Keep the CLI wrapper small: argument parsing, input/output handling, runtime creation, and invocation.
- Do not require a full-document browser runtime for the default conversion path.

CLI style configuration must be first-class, not deferred:

- `--style-preset <name>`
- `--margin-preset <name>`
- `--style-json <json-or-path>`
- `--set key=value` for targeted overrides
- environment defaults such as:
  - `MARKDOCX_STYLE_PRESET`
  - `MARKDOCX_MARGIN_PRESET`
  - `MARKDOCX_STYLE_JSON`
  - `MARKDOCX_STYLE_SET`

CLI precedence order:

1. `--style-preset` establishes the base preset.
2. `--style-json` overlays object values on top of the preset.
3. `--set` overlays targeted keys on top of both preset and style JSON.
4. Within repeated `--set` arguments, later arguments win.
5. CLI arguments as a group override environment variables.
6. Environment variables override defaults.
7. Default preset is last.

`MARKDOCX_STYLE_SET` uses semicolon-separated dotted-path assignments, for example:

```text
code.fontSizePt=11;blockquote.italic=false;page.marginPreset=wide
```

`--set` uses the same dotted-path assignment syntax and always overrides values coming from `--style-preset` and `--style-json`.

Precedence is by option kind, not by command-line position. `--set` always overrides `--style-json` and `--style-preset` regardless of argument order.

The current root `md-to-docx.mjs` is frozen as of Phase A. After that point, all CLI behavior changes must flow through the Node runtime family plan rather than ad hoc edits to the legacy monolith.

### 5.4 Agent Skill

Plan:

- Rebuild the skill on the same Node runtime family as CLI.
- Keep the skill wrapper focused on parameter parsing, file or content input, and output handling.
- Use the same style schema as CLI.
- This design assumes the first skill target runs in a local Node environment with filesystem access. If a later skill host is sandboxed and cannot read local files, it should get a separate adapter that accepts markdown and image blobs explicitly rather than silently changing the Node runtime assumptions.

Skill style configuration must support:

- explicit skill parameters such as `stylePreset`, `marginPreset`, `styleJson`, and `styleSet`
- environment defaults for non-interactive deployment

Skill precedence order:

1. `stylePreset` establishes the base preset.
2. `styleJson` overlays object values on top of the preset.
3. `styleSet` overlays targeted keys on top of both preset and style JSON.
4. Explicit skill parameters as a group override environment variables.
5. Environment variables override defaults.
6. Default preset is last.

`styleSet` is a string parameter using the same dotted-path assignment syntax as CLI `--set` and `MARKDOCX_STYLE_SET`, not an object. Agents passing an object should use `styleJson` instead.

No UI is required or desired for CLI and skill.

---

## 6. Consistency Strategy

### 6.1 Canonical Output Rule

For the same Markdown input and same style options, all four hosts must produce the same normalized DOCX output.

We will define parity on normalized DOCX contents, not raw zip bytes. Metadata such as timestamps may differ and should be stripped before comparison.

Normalization rules are part of this design, not just the comparison script implementation. The comparison script must at minimum normalize:

- `docProps/core.xml` created timestamp
- `docProps/core.xml` modified timestamp
- `docProps/core.xml` revision
- `word/document.xml` `w:rsid*` attributes
- `word/settings.xml` rsid lists
- WordprocessingML hex color literals inside `w:color` and `w:shd` elements, where letter casing is not semantic

If later drift introduces additional non-semantic metadata fields, the design must be updated before the comparison script is changed.

For Mermaid content, parity is defined at the SVG layer plus declared display extents, not at the final PNG raster layer. The comparison tooling should compare canonical Mermaid SVG output hashes and the width/height extents declared for the final embedded image. It may decode embedded PNGs to inspect dimensions, but Mermaid PNG pixels are not a CI-gating parity signal.

To make that rule executable at the DOCX layer, the DOCX comparison should canonicalize Mermaid-generated raster media references by diagram order rather than by PNG bytes. Document XML still gates on the declared embedded image extents and placement, while Mermaid SVG hashes gate diagram semantics and layout.

This is intentional. Under the two-runtime-family design, Chrome extension, VSCode extension, and Node-family helpers do not necessarily rasterize through the same Chromium build, so pixel-identical PNG output is not a stable contract. If Mermaid layout, styling, or semantics change, the SVG changes and parity still fails loudly.

Phase A should also generate one reference rasterization for each Mermaid-heavy fixture as a non-gating visual baseline. Visual drift against that baseline should raise a warning for manual review, not a CI failure.

Font handling also needs a declared rule: parity checks compare declared font names and document structure, not machine-local font rasterization. The fixture corpus should use an approved document font list and assume fonts are referenced by name rather than embedded. Font substitution at viewer time is outside the parity contract and is treated as a user environment concern rather than a refactor concern.

### 6.2 What Is Shared

All hosts must share:

- the same `@markdocx/core` conversion rules
- the same style preset definitions
- the same layout preset definitions
- the same syntax highlighting behavior
- the same Mermaid config values
- the same fixture corpus
- the same parity scripts

### 6.3 What May Differ

Hosts may differ only in:

- file access
- DOM adapter implementation
- host message passing
- host UI/settings surface
- the narrow Mermaid rendering adapter used by that runtime family

### 6.4 Mermaid Parity Rule

Mermaid is the highest-risk area for runtime drift.

To keep parity credible:

1. Pin one Mermaid version across the repository.
2. Pin one Mermaid config and layout constant set.
3. Use one canonical Mermaid SVG output as the reference parity artifact.
4. Make the Node family rasterize Mermaid through the narrow Puppeteer-based helper package, while the browser family continues to rasterize in-host.
5. Do not introduce a silent degraded mode into the default path.

See §4.6 for the concrete pinning and Puppeteer mechanism rules.

### 6.5 Fixture and Parity Tests

We need shared fixtures under `test-markdown/` that cover:

- plain prose
- tables
- blockquotes and line-break edge cases
- syntax-highlighted code blocks
- local images
- Mermaid-heavy documents
- custom style presets and overrides
- long documents with page overflow cases

Parity script requirements:

1. Convert the same fixture through every supported host.
2. Unzip the DOCX files.
3. Strip known metadata noise. See §6.1 for the authoritative normalization rules.
4. Compare `word/document.xml` and other relevant payload files.
5. For Mermaid content, compare canonical SVG hashes produced through the same host Mermaid runtime that the host uses during conversion, and compare declared image extents rather than embedded PNG byte streams.
6. Fail the build on any host mismatch.

The parity entry points must build the Chrome extension before generating goldens or running parity so `markdocx-extension/dist/` reflects the current workspace sources rather than stale artifacts.

The golden manifest should summarize both donor SHA and donor tree state at the top level. A dirty donor tree is an allowed transitional state during development, but it must be visible in the manifest and treated as a reproducibility debt to burn down.

---

## 7. Configuration Model

### 7.1 One Shared Style Schema

The repository should have one canonical `styleOptions` schema shared by all hosts.

That schema should cover:

- style preset
- body typography
- heading typography
- table colors
- code font, theme, and colors
- blockquote styling
- margin preset

### 7.2 Host Mapping Rules

Each host maps its own surface into the same shared schema:

- Chrome extension: UI controls -> `styleOptions`
- VSCode extension: settings -> `styleOptions`
- CLI: args/env -> `styleOptions`
- Agent skill: parameters/env -> `styleOptions`

This mapping must be documented and tested.

### 7.3 Shared JSON Schema

A shared JSON schema for `styleOptions` is required, not optional future work.

Reason:

- CLI `--style-json`
- skill `styleJson`
- Chrome extension UI mapping
- VSCode settings mapping

all need one validation source to avoid drift.

The schema artifact should land no later than the shared-core extraction phase.

CLI argument parsing and skill parameter parsing must validate against this schema before Phase D and Phase F close, so the schema is the actual validation source rather than documentation.

---

## 8. Migration Roadmap

### 8.0 Proposed Workspace and Build Conventions

To keep the migration concrete, the refactor should standardize root workspace scripts.

Proposed root workspace commands:

- `npm run build:core`
- `npm run build:runtime-browser`
- `npm run build:runtime-node`
- `npm run build:runtime-node-mermaid`
- `npm run build:chrome-extension`
- `npm run build:vscode-extension`
- `npm run build:cli`
- `npm run build:agent-skill`
- `npm run dev:chrome-extension`
- `npm run dev:vscode-extension`
- `npm run dev:cli`
- `npm run test:parity`
- `npm run smoke:all`

Proposed package names:

- `@markdocx/core`
- `@markdocx/runtime-browser`
- `@markdocx/runtime-node`
- `@markdocx/runtime-node-mermaid`

Migration should preserve current user-facing entry points until replacements are proven by parity gates.

Root manifest transition rule:

- Today the root `package.json` is the active CLI package and holds legacy CLI dependencies.
- In Phase B, the root manifest becomes a workspaces-first shell.
- Legacy CLI dependencies move temporarily into `apps/cli/package.json` if they are still needed during migration.
- Once the Node runtime family is in place, obsolete dependencies such as `sharp`, `jsdom`, `@mermaid-js/mermaid-cli`, and duplicated rendering libraries are removed.

### Phase A - Freeze Current Browser Output

Goal:

- Capture the current Chrome extension output as the initial golden reference.

Work:

1. Add a shared DOCX comparison script.
2. Generate golden outputs from the current Chrome extension for the fixture set.
3. Add fixtures for style presets and known recent regressions, specifically the blockquote background regression and the custom-style propagation regression.
4. Add a root script target for parity checking.
5. Record the exact git SHA used to generate the initial golden corpus.
6. Freeze the legacy root CLI implementation for feature work.
7. Add a core unit test harness alongside parity tooling.

Concrete package and file work:

- Keep current `markdocx-extension/` in place during this phase.
- Add `scripts/compare-docx.mjs`.
- Add `test-markdown/__golden__/` for normalized golden outputs.
- Record the Chrome extension donor SHA in the golden fixture metadata or design notes.
- Add non-gating visual Mermaid raster baselines for manual review.

Build commands:

- `npm run build:chrome-extension`
- `npm run test:parity`

Migration checkpoint:

- The repository has one accepted golden fixture corpus based on the current Chrome extension output.

Gate:

- Golden fixture set exists and comparison tooling works.

### Phase B - Extract Shared Core

Goal:

- Move stable logic from the current Chrome extension modules into `@markdocx/core`.

Work:

1. Extract style and layout modules.
2. Extract Markdown rendering and syntax highlighting.
3. Extract image inlining, HTML normalization, and DOCX generation.
4. Introduce runtime contracts for image resolution, DOM parsing, and Mermaid rendering.
5. Add the shared JSON schema for `styleOptions`.

Concrete package and file work:

- Create `packages/core/package.json`.
- Move shared modules from `markdocx-extension/src/lib/` into `packages/core/src/`.
- Start with:
  - `document-style.js`
  - `document-layout.js`
  - `constants.js`
  - `md-renderer.js`
  - `syntax-highlighter.js`
  - `image-inliner.js`
  - `table-normalizer.js`
  - `docx-generator.js`
- Add `packages/core/src/contracts/runtime.js` or equivalent JSDoc contract file.
- Convert the root manifest into a workspaces-first manifest in this phase.

Build commands:

- `npm run build:core`
- `npm run build:chrome-extension`
- `npm run test:parity`

Migration checkpoint:

- Chrome extension compiles against `@markdocx/core` for extracted modules without output drift.

Gate:

- Chrome extension rebuilt on `@markdocx/core` still produces a normalized match against the golden set.

### Phase C - Build Browser Runtime Family

Goal:

- Move browser-specific adapters into `@markdocx/runtime-browser`.

Work:

1. Move current Mermaid browser renderer.
2. Add native DOM adapter.
3. Add image map resolver.
4. Keep Chrome extension thin.

Concrete package and file work:

- Create `packages/runtime-browser/package.json`.
- Add:
  - `packages/runtime-browser/src/dom-native.js`
  - `packages/runtime-browser/src/image-map.js`
  - `packages/runtime-browser/src/mermaid-browser.js`
  - `packages/runtime-browser/src/index.js`
- Update Chrome extension orchestration to consume `@markdocx/runtime-browser`.

Build commands:

- `npm run build:runtime-browser`
- `npm run build:chrome-extension`
- `npm run test:parity`

Migration checkpoint:

- Chrome extension host wiring is thin and browser-specific logic no longer lives in app-local renderer modules.

Gate:

- Chrome extension still produces a normalized match against the golden set.

### Phase D - Build Node Runtime Family

Goal:

- Replace the old CLI monolith with a shared Node runtime.

Work:

1. Add filesystem image resolver.
2. Add lightweight DOM adapter.
3. Add Node runtime wrapper around the shared core.
4. Add a parity-preserving Mermaid adapter strategy.
5. Add CLI style args and env support.

Concrete package and file work:

- Create `packages/runtime-node/package.json`.
- Add:
  - `packages/runtime-node/src/image-fs.js`
  - `packages/runtime-node/src/dom-linkedom.js`
  - `packages/runtime-node/src/mermaid-adapter.js`
  - `packages/runtime-node/src/index.js`
- Add `packages/runtime-node-mermaid/package.json` and implement the narrow Puppeteer-based Mermaid helper.
- Replace `md-to-docx.mjs` implementation with a thin CLI wrapper that calls the Node runtime.
- Preserve top-level CLI compatibility via a temporary shim if needed.

Build commands:

- `npm run build:runtime-node`
- `npm run build:cli`
- `npm run test:parity`

Migration checkpoint:

- CLI no longer owns a separate monolithic conversion pipeline.
- CLI style configuration through args and env is implemented, documented, and tested.

Gate:

- CLI matches browser-family golden outputs on the shared fixture set.

### Phase E - Add VSCode Extension

Goal:

- Ship VSCode conversion on the browser runtime family.

Work:

1. Build hidden webview host.
2. Add commands and context menu.
3. Add settings mapped to shared `styleOptions`.

Concrete package and file work:

- Create `apps/vscode-extension/package.json`.
- Add:
  - `apps/vscode-extension/src/extension.js`
  - `apps/vscode-extension/src/webview-host.js`
  - `apps/vscode-extension/src/convert.js`
  - `apps/vscode-extension/webview/index.html`
- Use `@markdocx/core` and `@markdocx/runtime-browser` inside the webview host path.

Build commands:

- `npm run build:vscode-extension`
- `npm run test:parity`

Migration checkpoint:

- VSCode extension converts the shared fixtures with the same normalized output as Chrome extension.

Gate:

- VSCode extension matches the same golden outputs.

### Phase F - Add Agent Skill

Goal:

- Ship agent skill on the Node runtime family.

Work:

1. Add skill wrapper.
2. Add style parameters and env defaults.
3. Reuse the same Node runtime as CLI.

Concrete package and file work:

- Create `apps/agent-skill/` with:
  - `SKILL.md`
  - `skill.mjs`
  - `README.md`
- Reuse `@markdocx/runtime-node`.
- Do not create a second conversion implementation for the skill.

Build commands:

- `npm run build:agent-skill`
- `npm run test:parity`

Migration checkpoint:

- Agent skill accepts style parameters and env defaults that map to the same schema as CLI.

Gate:

- Agent skill matches the same golden outputs.

### Phase G - CI, Cleanup, and Documentation

Goal:

- Lock in the new structure and remove dead code.

Work:

1. Add smoke tests for all hosts.
2. Add parity checks to CI.
3. Remove obsolete monolith code.
4. Update repository docs.

Concrete package and file work:

- Add `scripts/smoke-all-hosts.mjs`.
- Add CI workflow entries for core, runtimes, and apps.
- Move `markdocx-extension/` to `apps/chrome-extension/` in this phase, after the extension app has become a thin wrapper over `@markdocx/core` and `@markdocx/runtime-browser`.
- Update parity tooling paths and build entry points in the same phase so golden generation and parity checks continue to target the built Chrome extension rather than hard-coded pre-move source paths.
- Remove obsolete renderer duplicates and old monolith paths after parity is stable.

Build commands:

- `npm run build:core`
- `npm run build:runtime-browser`
- `npm run build:runtime-node`
- `npm run build:runtime-node-mermaid`
- `npm run build:chrome-extension`
- `npm run build:vscode-extension`
- `npm run build:cli`
- `npm run build:agent-skill`
- `npm run smoke:all`

Migration checkpoint:

- Fresh clone build and parity validation are automated end-to-end.

Gate:

- Fresh clone builds cleanly and all host parity checks pass.

CI requirement:

- Parity checks run on every pull request, not only on nightly or release builds.

---

## 9. Risks and Tradeoffs

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Runtime drift between browser and Node | Violates the same-result requirement | Use shared core, pinned versions, shared fixtures, and a strict parity gate |
| Mermaid rendering mismatch | Mermaid is the most likely source of host divergence | Pin Mermaid/config/layout; define parity at SVG+extent level; route Node-family rasterization through `@markdocx/runtime-node-mermaid` |
| CLI or skill dependency bloat | Conflicts with the small-host requirement | Keep the main pipeline Node-native and isolate any browser-backed helper to Mermaid only |
| Over-abstracting too early | Can make the repo harder to understand | Extract only stable behavior from the current extension, keep host wrappers thin |
| Silent feature degradation | Creates support and trust problems | Fail fast when a parity-preserving path is unavailable |

Main tradeoff:

- **We are choosing shared behavior plus two runtime families over one runtime everywhere.**

That is the cleaner design for this repository because it preserves parity while keeping CLI and agent skill operationally lighter than a full-browser execution model.

---

## 10. Acceptance Criteria

This refactor is complete when all of the following are true:

1. Chrome extension, VSCode extension, CLI, and agent skill all convert the same fixture corpus to the same normalized DOCX result.
2. The shared conversion rules live in `@markdocx/core` rather than being copied across apps.
3. Browser-specific code lives in the browser runtime family.
4. Node-specific code lives in the Node runtime family.
5. CLI and agent skill support style configuration via args/parameters and environment variables without UI.
6. Chrome extension and VSCode extension map their UI/settings into the same shared style schema.
7. The repository structure is clearer than the current split implementation.
8. CLI and agent skill do not require a full-document browser runtime for the common path.
9. Any required browser-backed helper inside the Node family is narrow, explicit, and parity-driven.
10. CI fails on host output drift and runs parity checks on every pull request, not only on nightly or release jobs.

---

## 11. Summary

The right refactor for markdocx is not "one runtime everywhere". The right refactor is:

- one shared conversion core
- one browser runtime family
- one Node runtime family
- one strict parity contract

This lets us keep the repository clean and understandable, preserve the current Chrome extension work as the canonical source, add VSCode extension and agent skill support, keep CLI and skill as small as practical, and still enforce the requirement that all four tools produce the same DOCX result for the same Markdown input.

---

## 12. Implementation Checklist

This section turns the design into a next-session work breakdown.

### Epic 1 - Parity Baseline

- [x] Add `scripts/compare-docx.mjs`.
- [x] Define DOCX normalization rules for metadata stripping.
- [x] Add a core unit test harness alongside parity tooling.
- [x] Create golden outputs from the current Chrome extension.
- [x] Add fixtures for style presets, Mermaid, local images, and blockquote edge cases.
- [x] Add non-gating visual Mermaid raster baselines for manual review.
- [x] Add `npm run test:parity`.

### Epic 2 - Shared Core Extraction

- [ ] Initialize workspaces in the root `package.json`.
- [ ] Create `packages/core/package.json`.
- [ ] Move style/layout modules into `packages/core/src/style/`.
- [ ] Move Markdown renderer and syntax highlighter into `packages/core/src/markdown/`.
- [ ] Move `image-inliner.js` into `packages/core/src/html/`.
- [ ] Move HTML normalization into `packages/core/src/html/`.
- [ ] Move DOCX generation into `packages/core/src/docx/`.
- [ ] Add runtime contracts.
- [ ] Add the shared JSON schema for `styleOptions`.
- [ ] Build Chrome extension against the extracted core.

### Epic 3 - Browser Runtime Family

- [ ] Create `packages/runtime-browser/package.json`.
- [ ] Add native DOM adapter.
- [ ] Add image map adapter.
- [ ] Move browser Mermaid renderer into the browser runtime package.
- [ ] Wire Chrome extension to the browser runtime package.
- [ ] Validate parity against golden outputs.

### Epic 4 - Node Runtime Family

- [ ] Create `packages/runtime-node/package.json`.
- [ ] Add filesystem image resolver.
- [ ] Add lightweight DOM adapter.
- [ ] Add Node runtime composition entry.
- [ ] Create `packages/runtime-node-mermaid/` for Puppeteer-based Mermaid rendering only.
- [ ] Replace CLI monolith with a thin wrapper.
- [ ] Add CLI style args and env parsing.
- [ ] Add an explicit fail-fast test for the "Mermaid helper missing" path.
- [ ] Validate CLI parity against golden outputs.

### Epic 5 - VSCode Extension

- [ ] Create `apps/vscode-extension/package.json`.
- [ ] Add extension activation and command registration.
- [ ] Build hidden webview host.
- [ ] Map VSCode settings into shared `styleOptions`.
- [ ] Add fixture conversion smoke tests.
- [ ] Validate parity against golden outputs.

### Epic 6 - Agent Skill

- [ ] Create `apps/agent-skill/SKILL.md`.
- [ ] Add `skill.mjs` wrapper.
- [ ] Reuse Node runtime family.
- [ ] Add style parameter parsing.
- [ ] Add env-default support.
- [ ] Validate parity against golden outputs.

### Epic 7 - Cleanup and CI

- [ ] Add `scripts/smoke-all-hosts.mjs`.
- [ ] Add CI workflow for all package builds.
- [ ] Add CI parity checks on every pull request.
- [ ] Remove obsolete monolith code after parity is stable.
- [ ] Update README and repo architecture notes.

### First Working Session Recommendation

The next implementation session should focus only on:

1. workspace initialization
2. parity tooling
3. extracting `@markdocx/core` from the current Chrome extension

That is the highest-leverage cut because it creates the real shared asset without yet committing to host migrations.
