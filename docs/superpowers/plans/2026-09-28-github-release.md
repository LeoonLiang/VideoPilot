# GitHub Release Implementation Plan

> **For agentic workers:** Execute inline with behavioral tests first; use an independent read-only review before delivery.

**Goal:** Document installation and maintenance, and publish tag-triggered GitHub Releases using version-specific CHANGELOG notes.

**Architecture:** Dependency-free Node scripts validate release versions, extract Markdown notes, and produce both an unpacked extension and a ZIP. GitHub Actions runs validation/tests before publishing the ZIP with the extracted notes.

**Tech Stack:** Node.js 22, GitHub Actions, GitHub CLI, system zip, Markdown.

## Global Constraints

- Repository: `https://github.com/LeoonLiang/VideoPilot.git`.
- Release tags: `vMAJOR.MINOR.PATCH`; manifest and package versions must match the tag.
- Notes come only from the exact `## [MAJOR.MINOR.PATCH] - YYYY-MM-DD` CHANGELOG section; missing, duplicate or empty sections fail.
- Preserve unpacked distribution at `dist/VideoPilot/`; ZIP contains the loadable extension at its root.
- Configure the local remote; do not create or push a release tag as part of setup.

### Task 1: Release scripts and behavioral tests

**Files:** `scripts/release-notes.cjs`, `scripts/package.cjs`, `tests/release.test.cjs`, `package.json`.

**Interfaces:** `extractReleaseNotes(markdown, version): string`, `prepareRelease(root, tag): {version, notesPath}`, `packageExtension(root): {directory, archive}`.

- [x] Test exact version extraction, Markdown fences, missing/empty/duplicate entries, mismatched versions, CLI success/failure, and real ZIP/unpacked contents using temporary directories.
- [x] Run `node --test tests/release.test.cjs` before implementation and confirm failures.
- [x] Implement the tested scripts with no runtime dependencies, then run `npm test` and `npm run check`.

### Task 2: Workflow and documentation

**Files:** `.github/workflows/release.yml`, `CHANGELOG.md`, `README.md`.

- [x] Write initial 1.0.0 changes and an Unreleased section. Document installation, controls, multi-video/iframe behavior, settings and limitations.
- [x] On pushes matching `v*`, check out the tag, select Node 22, run tests/syntax checks, prepare notes and package, then create a GitHub Release with `contents: write` using the extracted notes and ZIP.
- [x] Document exact initial Git commit/push and tag commands, and show how each subsequent version updates all three version sources before tagging.
- [x] Validate YAML/workflow structure and locally run the same validation and packaging commands without publishing a real Release.

### Task 3: Repository and final verification

- [x] Initialize Git on main and add the supplied origin remote.
- [x] Obtain a read-only review while inspecting package contents and documentation.
- [x] Resolve substantive findings, re-run relevant checks, and report the configured workflow plus the remaining user-triggered push/tag step.

## Verification

- 22 Node behavior tests pass, including two regressions for commented CHANGELOG headings.
- All plugin and release script syntax checks pass.
- Exact 1.0.0 notes extracted; unpacked directory and ZIP generated and ZIP integrity checked.
- Workflow YAML parsed and publish shell passed bash syntax checks. A controlled gh boundary verified first publish, draft retry, published-release refusal, and failed-upload behavior.
- Independent review identified HTML comment headings; reproduced both failures and fixed them.
- Git initialized on main; origin is https://github.com/LeoonLiang/VideoPilot.git. No commits, tags or pushes were created.
- Live GitHub Actions execution remains to be triggered by pushing the repository and a release tag.
