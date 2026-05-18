# MD Viewer

[中文说明](README.zh-CN.md)

MD Viewer is a lightweight desktop app for reading and working with Markdown documents.

The idea is simple: VS Code is excellent, but it can feel too heavy when you only want to open a folder and read the Markdown files inside it. MD Viewer keeps the parts that make editor-style reading useful, such as a file explorer, tabs, document outlines, themes, and quick navigation, while keeping the interface focused on the document.

## Background

This project was inspired by [markdown-viewer-extension](https://github.com/markdown-viewer/markdown-viewer-extension). That project provides a strong Markdown preview and theme experience, and it helped shape the direction of MD Viewer as a standalone desktop reader.

MD Viewer is not intended to replace the original extension. It is a focused desktop app built around my own reading workflow: when the goal is reading Markdown, the app should feel lighter, more direct, and closer to a dedicated document viewer.

## Features

- Open Markdown files by drag and drop.
- Open folders and browse Markdown files in a VS Code-like explorer.
- Keep multiple documents open in tabs.
- Use a different preview theme per tab.
- Navigate long documents with a nested document outline.
- Edit Markdown with preview, edit, and split view modes.
- Use editing assists for lists, task lists, quotes, code fences, inline formatting, links, and paired delimiters.
- Render Mermaid diagrams from fenced `mermaid` code blocks.
- Adjust theme typography for preview and DOCX export.
- Export to HTML, DOCX, or print / PDF.
- Copy rendered Markdown content with cleaner formatting.
- Copy images from the rendered preview.
- Resize the sidebar and document outline panels.
- Reveal files or folders in Finder, File Explorer, or the system file manager.
- Switch the interface between Chinese and English.
- Check for app updates from Settings.

## Screenshots

![Workspace](docs/screenshots/workspace.png)

![Academic Theme](docs/screenshots/academic-theme.png)

![Export Menu](docs/screenshots/export-menu.png)

## Next Version

The next version explores an in-app Agent panel that stays beside the Markdown document. The goal is to make writing assistance feel like part of the reading and editing workspace: summarize the current document, adjust tone, continue a draft, or save the result without moving text into a separate chat window.

This direction keeps the scope close to document-centered Markdown workflows: reading, drafting, rewriting, summarizing, and saving.

![Next Version Agent Concept](docs/screenshots/agent-chat-next-version.png)

HTML mockup: [Agent Chat Concept](docs/agent-chat-concept-en.html).

## Development

Install dependencies:

```bash
pnpm install
```

Run the Tauri development app:

```bash
pnpm tauri dev
```

Build a local app package:

```bash
pnpm tauri build
```

## Tech Stack

- Tauri 2
- Vite
- Vanilla JavaScript
- Markdown-it
- Mermaid

## Acknowledgements

Thanks to the author of [markdown-viewer-extension](https://github.com/markdown-viewer/markdown-viewer-extension). MD Viewer was influenced by its theme experience and Markdown reading direction.

## Links

- [LinuxDO](https://linux.do)
