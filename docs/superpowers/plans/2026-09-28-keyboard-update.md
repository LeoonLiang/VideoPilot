# Keyboard Controls Update Implementation Plan

> **For agentic workers:** Execute inline with behavioral tests before implementation and a read-only review before delivery.

**Goal:** Make X distinguish tap-to-seek from hold-to-boost, and use S/D/R for the current video's speed.

**Architecture:** Keep popup settings and video selection unchanged. The shared controller tracks one X gesture, records its target, defers seeking until release, and restores its rate on release or cancellation. Direct speed shortcuts never write global settings.

**Tech Stack:** Plain JavaScript, Node test runner, Playwright, existing MV3 extension packaging.

## Global Constraints

- Z remains backward seek; a short X tap seeks forward only on keyup.
- Holding X for 200 ms boosts using the popup value; release restores the original rate without seeking.
- S reduces the current video speed by 0.1; D increases it by 0.1; R resets it to 1×.
- Direct speed adjustments clamp to 0.25–4× and round to two decimals. They do not change global popup settings or other videos.
- Blur, disabling, settings changes, and editing/modifier context cancel pending X taps; no delayed seek occurs.
- S/D/R during an X gesture cancels that gesture before changing speed, so the later X release cannot undo the change or seek.

### Task 1: Shared controller

**Files:** `tests/core.test.cjs`, `extension/shared.js`.

- [x] Replace old pause/D-hold expectations with tap/hold X and per-video S/D/R behavior tests.
- [x] Cover short versus held X, repeats, target changes, blur/disable/settings cancellation, editable/modifier input, speed precision/bounds, and S/D/R during X.
- [x] Run tests against the old implementation and confirm behavioral failures, then implement and re-run.

### Task 2: UI, docs and browser verification

**Files:** `extension/popup.html`, `extension/popup.css`, `extension/manifest.json`, `package.json`, `README.md`, `CHANGELOG.md`, `tests/browser.test.cjs`.

- [x] Update browser tests before implementation: X changes time only on a short release, long X never seeks, S/D/R preserve pause state and change only the selected video without saving global settings.
- [x] Replace shortcut descriptions in the popup and documentation, including reset to 1× and cancellation behavior.
- [x] Verify actual extension loading, iframe behavior and popup height with the full browser suite; inspect the screenshot.

### Task 3: Review and distribution

- [x] Review the new controller while finishing UI/browser checks, and resolve substantive issues.
- [x] Run `npm test`, `npm run check`, `npm run test:browser`, release note generation and packaging.
- [x] Refresh `dist/VideoPilot/` and `dist/VideoPilot.zip`; deliver keyboard mapping and reload instructions.

## Verification

- 30 Node tests passed (19 core control tests and 11 release/packaging tests).
- All 7 real-browser tests passed, including actual MV3 loading, iframe-local speed changes, and fullscreen selection.
- Independent review found delayed-timer misclassification; the controller now checks keyboard event timestamps, with a regression covering 199 ms, 200 ms, and 500 ms presses.
- Fullscreen test waits for fullscreenchange before sending keys; an in-flight fullscreen transition correctly cancels an X gesture.
- Popup screenshot inspected at 380 × 600; no overflow.
- JavaScript syntax checks and release note extraction passed; unpacked distribution matches current source and ZIP integrity check passed.
