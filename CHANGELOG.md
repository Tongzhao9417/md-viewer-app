# Changelog

## 0.3.4 - 2026-05-22

- Added a New Markdown action that opens an untitled editable draft before choosing a save location.
- Added first-save handling for untitled Markdown drafts, including Markdown file filters and workspace/sidebar tracking after save.
- Refactored the main frontend entrypoint into focused modules for DOM access, Markdown rendering, editor behavior, image clipboard handling, copy handling, path utilities, and resizable panels.
- Updated workspace toolbar actions with clearer document, folder, and refresh icons.

## 0.3.3 - 2026-05-15

- Added interface localization with Chinese and English language options.
- Added a Settings panel for language selection and theme typography settings.
- Added a manual update check action in Settings.

## 0.3.2 - 2026-05-15

- Added Mermaid diagram rendering for `mermaid` fenced code blocks.
- Re-render Mermaid diagrams when switching preview themes.
- Show Mermaid render errors with the original diagram source instead of leaving a blank preview.

## 0.3.1 - 2026-05-15

- Added image right-click copying from rendered Markdown previews.
- Added Windows installer file association support for Markdown files.
- Fixed Markdown files opened from the operating system not loading into the app.
- Reduced the default sidebar width on first launch.

## 0.3.0 - 2026-05-13

- Added nested document outline rendering for `h1` through `h6`.
- Added outline navigation in preview, edit, and split modes, including synchronized editor and preview positioning.
- Added support for Markdown heading anchor links, including Chinese and mixed Chinese/English headings.
- Added a back-to-top button for long documents.
- Added workspace context actions to close the current workspace and close loose single files.
- Added multi-window workspace opening when dropping a second folder into an existing workspace window.
- Added full filename tooltips on tabs.
- Improved exports so save dialogs default to the source Markdown folder.
- Improved the academic DOCX export format with 1.5 line spacing, first-line indentation, and compact heading spacing while keeping the app preview style unchanged.
- Improved Windows support with Explorer reveal actions and adaptive startup window sizing.
- Fixed loose single files staying in the sidebar after closing their tabs.
- Fixed compact document outline layout when a document has only a few headings.

## 0.2.0 - 2026-05-13

- Added lightweight Markdown editing with preview, edit, and split view modes.
- Added save support with dirty tab indicators and unsaved-change confirmation.
- Added Markdown editing assists for lists, task lists, quotes, code fences, inline formatting, links, and paired delimiters.
- Preserved automatic updater support and cross-platform local image path handling from v0.1.3.

## 0.1.3 - 2026-05-13

- Added automatic update checks on app startup with an in-app update prompt.
- Added signed updater artifact generation for GitHub Releases.
- Added update download progress and automatic app relaunch after installation.
- Improved release publishing so updater metadata is generated before the release is made public.
- Improved cross-platform Markdown image path resolution for Windows-authored paths on macOS.
