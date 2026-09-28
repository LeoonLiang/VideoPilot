# VideoPilot Implementation Plan

> **For agentic workers:** Execute the following tasks inline, with a test-first cycle and an independent code review before delivery.

**Goal:** Build a directly loadable browser extension with configurable playback speed, temporary hold-to-boost, and keyboard seeking.

**Architecture:** A dependency-free Manifest V3 extension. Shared settings and playback helpers feed the content script and popup; local browser storage propagates settings to open pages. Content scripts choose the visible active video and protect text input.

**Tech Stack:** HTML, CSS, JavaScript, Chrome extension APIs, Node test runner, Playwright for browser integration checks.

## Global Constraints

- Chrome and Edge, Manifest V3; no backend or remote assets.
- Z seeks backward, X seeks forward, S toggles playback, D boosts after a 200 ms hold and restores on release.
- Popup configures normal speed (0.25–4), boost speed (0.25–8), and independent backward/forward durations (1–120 seconds).
- Settings persist locally and apply immediately; typing, modified shortcuts, hidden videos, and loss of focus are handled safely.

### Task 1: Settings and playback behavior

**Files:** `extension/shared.js`, `tests/core.test.cjs`, `package.json`.

**Interfaces:** `VideoPilot.normalizeSettings(input)` returns validated settings; `VideoPilot.seek(video, delta)` clamps the target to media bounds; `VideoPilot.createController(options)` exposes `keydown`, `keyup`, `release`, `updateSettings`.

- [x] Write behavioral tests: `seek(videoAt3, -10)` produces time 0; invalid settings fall back; a held D restores the pre-hold rate on release, blur, and disable; editable input does not activate a shortcut.
- [x] Run `node --test tests/core.test.cjs` and confirm missing behavior fails.
- [x] Implement settings normalization, seek bounds including live seekable ranges, and the timer-backed keyboard controller.
- [x] Run `node --test tests/core.test.cjs` and require all cases to pass.

### Task 2: Browser integration and popup

**Files:** `extension/manifest.json`, `extension/content.js`, `extension/popup.html`, `extension/popup.css`, `extension/popup.js`, `extension/icons/*`, `tests/browser.test.cjs`.

**Interfaces:** Content scripts consume `VideoPilot` and `chrome.storage.local`; popup writes `{settings}` and content scripts observe `chrome.storage.onChanged`.

- [x] Add browser checks that inject scripts into real pages and assert video speed, seek offsets, pause/play, input isolation, dynamic video discovery, and storage propagation. Simulate only the extension API boundary when running ordinary-page checks.
- [x] Run browser checks and reproduce fullscreen, popup persistence/height, and shadow-host reattachment regressions before fixing them.
- [x] Implement all-frame content scripts, visible-video selection, discreet video feedback, and a Chinese popup with speed presets, number controls, enable switch, shortcut guide, save feedback, and reset.
- [x] Generate local extension icons; validate manifest asset references and script syntax.
- [x] Run integration checks plus inspect a screenshot of the popup. When supported, load the actual extension in an isolated browser profile to validate the real storage and injection boundary.

### Task 3: Packaging and review

**Files:** `README.md`, `scripts/package.cjs`, `.gitignore`.

- [x] Document unpacked installation, keyboard mapping, settings, multi-video selection, and browser/site limitations.
- [x] Package only the extension directory into `dist/VideoPilot.zip` using `npm run package`.
- [x] Run `npm test`, browser checks, and packaging; inspect generated files.
- [x] Request a read-only independent code review and resolve substantive findings.
- [x] Deliver the extension directory, installation steps, and verified test results.

## Final validation

- 11 core tests passed.
- 7 browser integration tests passed, including actual unpacked MV3 extension loading and iframe storage propagation.
- JavaScript syntax checks passed.
- Popup screenshot inspected at 380 × 600; content height is within the browser popup limit.
- ZIP created and its manifest/assets inspected.
- Independent review findings for fullscreen selection and shadow-host reattachment reproduced and fixed with passing browser regressions.
