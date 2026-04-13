# Golden Corpus

This directory is the Epic 1 golden corpus scaffold.

Rules:

- Golden DOCX files must be generated from the Chrome extension donor build selected for Phase A.
- `manifest.json` is the authoritative fixture list for `npm run test:parity`.
- `npm run generate:goldens` generates or refreshes pending goldens from the current Chrome extension donor build and records the donor git SHA.
- To refresh existing goldens, use `npm run generate:goldens -- --refresh all` or `npm run generate:goldens -- --refresh <fixture-id>[,<fixture-id>...]`.
- Golden generation refuses to run on a dirty working tree unless `--allow-dirty` is passed. Dirty-tree generations are recorded per fixture as non-clean provenance.
- Chromium sandbox-disabling flags are off by default. Use `MARKDOCX_PUPPETEER_NO_SANDBOX=1` or `--no-sandbox` only in CI/container environments that require it.
- `status: "pending"` means the fixture is selected for the parity corpus but does not yet have a verified Chrome-extension-generated golden.
- `status: "verified"` means the fixture has a verified golden and participates in automated parity runs.
- Mermaid visual baselines are non-gating artifacts used for manual review only.
- Do not treat ad hoc CLI outputs as goldens unless they have been explicitly promoted and provenance is recorded.

Manual review workflow for Mermaid visual baselines:

1. Regenerate the target fixture with `npm run generate:goldens -- --refresh <fixture-id>`.
2. Inspect `test-markdown/__golden__/visual-baselines/<fixture-id>/` against the previous baseline set in Git diff or an image diff tool.
3. If the visual drift is expected and the SVG parity hashes remain stable, accept the updated baseline images with the regenerated golden.
4. If the SVG parity hashes changed unexpectedly, treat that as a real parity regression and investigate before updating the golden.

Expected next step:

- populate `manifest.json` with verified Chrome-extension-generated `.docx` outputs and the donor git SHA.