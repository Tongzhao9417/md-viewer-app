# Changelog

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
