# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A lightweight macOS desktop app (8.6MB) for viewing Markdown files. Replaces heavy tools like VSCode or browser extensions with a minimal native app that opens .md files on double-click, renders them beautifully, and supports copy-to-Word.

## Tech Stack

- **Framework**: Tauri v2 (Rust backend + WebView frontend)
- **Frontend bundler**: Vite
- **Markdown parser**: markdown-it (JS)
- **Syntax highlighting**: highlight.js
- **Styling**: GitHub-flavored CSS with dark mode (follows system)

## Build & Run

```bash
# Install dependencies
pnpm install

# Dev mode (hot reload)
pnpm tauri dev

# Production build → .app + .dmg
pnpm build && pnpm tauri build

# Test with a file
open "src-tauri/target/release/bundle/macos/MD Viewer.app" --args /path/to/file.md
```

Requires: Xcode Command Line Tools, Rust (rustup), Node.js, pnpm.

## Architecture

**Rendering pipeline**: Rust reads .md file → emits event to WebView → markdown-it parses to HTML → highlight.js post-processes code blocks → GitHub CSS styles output.

**Key files**:
- `src/main.js` — Frontend: markdown rendering, drag-drop handling, event listeners
- `src/styles.css` — GitHub-flavored markdown CSS with light/dark mode
- `src/index.html` — HTML shell
- `src-tauri/src/lib.rs` — Rust backend: file I/O, file watching, CLI arg handling
- `src-tauri/tauri.conf.json` — App config, window settings, bundle targets
- `src-tauri/Info.plist` — macOS file association for .md/.markdown/.mkd/.mdx
- `vite.config.js` — Vite config (root=src, output=dist)

**File opening methods**:
1. CLI args: `open MDViewer.app --args file.md`
2. Drag & drop: drop .md file onto window (handled via Tauri's `onDragDropEvent` JS API)
3. Double-click: via Info.plist file association (requires setting as default app)

**Live reload**: A background thread polls file mtime every 1s and emits `file-changed` events.

## Key Design Decisions

- WebView over native rendering: SwiftUI markdown is too limited. WKWebView + JS gives tables, code highlighting, and good copy-to-Word fidelity.
- All JS/CSS bundled via Vite, no CDN. Fully offline.
- Single-window, single-file. No tabs, no file browser.
- `titleBarStyle: "Overlay"` with `hiddenTitle: true` for clean macOS look. Toolbar area is draggable.
