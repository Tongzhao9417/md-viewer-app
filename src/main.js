import {
  applyMarkdownTheme,
  getAvailableThemes,
  getThemeCategories,
  getCurrentThemeCSS,
  getCurrentThemeDefinition,
  normalizeThemeId,
} from "./theme-engine.js";
import {
  TYPOGRAPHY_FIELDS,
  clearThemeTypographySettings,
  coerceTypographyValue,
  getThemeTypographySettings,
  getTypographyValuesForScope,
  saveThemeTypographySettings,
} from "./theme-settings.js";
import {
  applyTranslations,
  getAvailableLocales,
  getHtmlLang,
  getLocale,
  pickLocalized,
  setLocale,
  t,
} from "./i18n.js";
import { open, save } from "@tauri-apps/plugin-dialog";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { initCopyHandler } from "./copy-handler.js";
import { exportDOCX } from "./docx-exporter.js";
import {
  backToTopButton,
  contentEl,
  currentThemeId,
  documentWorkspaceEl,
  editorEl,
  editorStatusEl,
  emptyEl,
  languageSelect,
  readerContentEl,
  saveMarkdownButton,
  tabListEl,
  themeSelect,
} from "./dom.js";
import { handleEditorKeyDown as handleMarkdownEditorKeyDown } from "./editor-behavior.js";
import { copyImageToClipboard } from "./image-clipboard.js";
import {
  getMarkdownHeadingSourceLines,
  getPortableMarkdownHTML,
  renderMarkdown as renderMarkdownContent,
} from "./markdown-content.js";
import {
  applyLineEnding,
  detectLineEnding,
  escapeHTML,
  getBaseName,
  getDirName,
  getFileName,
  getPathParts,
  getPathRelativeToRoot,
  isMarkdownPath,
  isPathInsideRoot,
  isSameLocalPath,
  joinLocalPath,
  joinPath,
  normalizeMarkdownContent,
  normalizePathSeparators,
} from "./path-utils.js";
import { applyDefaultSidebarWidth, initResizablePanels } from "./resizable-panels.js";

const searchParams = new URLSearchParams(window.location.search);
const isScreenshotDemo = searchParams.get("demo") === "screenshot";
const initialWorkspacePath =
  typeof window.__MD_VIEWER_INITIAL_WORKSPACE__ === "string"
    ? window.__MD_VIEWER_INITIAL_WORKSPACE__
    : "";
const isTauriRuntime = Boolean(window.__TAURI__?.core);
const invoke = window.__TAURI__?.core?.invoke ?? (async () => {
  throw new Error(t("error.tauriUnavailable"));
});
const listen = window.__TAURI__?.event?.listen ?? (() => {});
const getCurrentWebviewWindow = window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow ?? (() => null);
const getCurrentWindow = window.__TAURI__?.window?.getCurrentWindow ?? (() => ({ startDragging() {} }));

let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let nextDraftId = 1;
let workspace = null;
let looseFiles = [];
let contextTabId = null;
let contextWorkspacePath = null;
let contextWorkspaceTarget = null;
let contextImageTarget = null;
let isUpdateInstalling = false;
let viewMode = "preview";
let pendingPreviewRenderId = 0;
let unsavedDecisionResolver = null;
let settingsUpdateStatusKey = "";
let settingsUpdateStatusParams = {};
const collapsedWorkspaceDirs = new Set();
const VIEW_MODE_KEY = "md-viewer-view-mode";
const SCREENSHOT_DEMO_ROOT = "/Users/demo/Documents/Markdown Library";
const UPDATE_CHECK_DELAY_MS = 1200;
const BACK_TO_TOP_THRESHOLD = 260;
const SCREENSHOT_DEMO_FILES = [
  {
    path: `${SCREENSHOT_DEMO_ROOT}/README.md`,
    name: "README.md",
    relative_path: "README.md",
  },
  {
    path: `${SCREENSHOT_DEMO_ROOT}/Research/Markdown Reader Notes.md`,
    name: "Markdown Reader Notes.md",
    relative_path: "Research/Markdown Reader Notes.md",
  },
  {
    path: `${SCREENSHOT_DEMO_ROOT}/Research/Export Checklist.md`,
    name: "Export Checklist.md",
    relative_path: "Research/Export Checklist.md",
  },
  {
    path: `${SCREENSHOT_DEMO_ROOT}/Writing/Academic Theme.md`,
    name: "Academic Theme.md",
    relative_path: "Writing/Academic Theme.md",
  },
  {
    path: `${SCREENSHOT_DEMO_ROOT}/Writing/Technical Documentation.md`,
    name: "Technical Documentation.md",
    relative_path: "Writing/Technical Documentation.md",
  },
  {
    path: `${SCREENSHOT_DEMO_ROOT}/Archive/Release Notes.md`,
    name: "Release Notes.md",
    relative_path: "Archive/Release Notes.md",
  },
];
const SCREENSHOT_DEMO_DOCS = {
  [`${SCREENSHOT_DEMO_ROOT}/Writing/Technical Documentation.md`]: `# Markdown Reader Workspace

MD Viewer is designed for reading Markdown collections without opening a full editor. Drop a folder into the window, browse Markdown files from the left explorer, and keep related documents open in tabs.

## Reading Flow

- Open a folder once and move between Markdown files quickly.
- Keep reference notes, drafts, and documentation in separate tabs.
- Use the document outline to jump through long files.
- Adjust the explorer and outline panels when a workspace gets dense.

## Workspace Layout

| Area | Purpose |
| --- | --- |
| Files | Browse Markdown documents by folder |
| Tabs | Switch between open documents |
| Outline | Navigate headings in the active document |

## Example

\`\`\`js
const reader = createMarkdownReader({
  workspace: "Markdown Library",
  theme: "Technical Documentation",
});
\`\`\`

The interface stays quiet so the document remains the primary surface.`,
  [`${SCREENSHOT_DEMO_ROOT}/Writing/Academic Theme.md`]: `# Literature Notes

This view is optimized for long-form reading. Each Markdown document can keep its own theme, which makes it practical to review technical notes, paper drafts, and reading summaries side by side.

## Summary

Markdown is often used as a lightweight writing format, but reading large folders of notes inside a code editor can add unnecessary visual weight. A dedicated reader keeps the navigation model while reducing the rest of the interface.

## Observations

1. Folder-based browsing is still useful for personal knowledge bases.
2. Tabs make comparison and cross-reading faster.
3. Export support keeps the reading workflow connected to sharing and publishing.`,
};
function syncLanguageSelect() {
  const select = languageSelect();
  if (select) select.value = getLocale();
}

function setSettingsUpdateStatus(key = "", params = {}) {
  settingsUpdateStatusKey = key;
  settingsUpdateStatusParams = params;

  const status = document.getElementById("settings-update-status");
  if (status) {
    status.textContent = key ? t(key, params) : "";
  }
}

function syncSettingsUpdateStatus() {
  setSettingsUpdateStatus(settingsUpdateStatusKey, settingsUpdateStatusParams);
}

function buildLanguageSelectOptions(select) {
  select.innerHTML = "";
  getAvailableLocales().forEach((locale) => {
    const option = document.createElement("option");
    option.value = locale.id;
    option.textContent = locale.label;
    option.selected = locale.id === getLocale();
    select.appendChild(option);
  });
}

function refreshLocalizedUI() {
  applyTranslations(document);
  syncLanguageSelect();
  syncSettingsUpdateStatus();

  const currentTheme = currentThemeId();
  const themeControl = themeSelect();
  if (themeControl) {
    buildThemeSelectOptions(themeControl, currentTheme);
    themeControl.value = currentTheme;
  }

  const typographyBackdrop = document.getElementById("settings-backdrop");
  if (typographyBackdrop && !typographyBackdrop.classList.contains("hidden")) {
    fillTypographyDialog();
  }

  const unsavedBackdrop = document.getElementById("unsaved-backdrop");
  const unsavedMessage = document.getElementById("unsaved-message");
  if (unsavedBackdrop && unsavedMessage && !unsavedBackdrop.classList.contains("hidden")) {
    unsavedMessage.textContent = t("unsaved.closeMessage");
  }

  const activeTab = getActiveTab();
  setTitle(activeTab, { dirty: Boolean(activeTab?.dirty) });
  renderWorkspaceFiles();
  renderDocumentOutline();
  updateEditorControls();
  updateWorkspaceContextMenuState(contextWorkspaceTarget);
}

function initI18nControls() {
  applyTranslations(document);

  const select = languageSelect();
  if (!select) return;

  buildLanguageSelectOptions(select);
  select.value = getLocale();
  select.addEventListener("change", (event) => {
    setLocale(event.target.value);
    refreshLocalizedUI();
  });
}

async function renderMarkdown(raw, filePath = getActiveTab()?.path) {
  await renderMarkdownContent(raw, {
    filePath,
    invoke,
    isTauriRuntime,
    workspaceRoot: workspace?.root || null,
    afterRender() {
      renderDocumentOutline();
      updateBackToTopButton();
    },
  });
}

function getTabDisplayName(tab) {
  if (!tab) return "";
  return tab.path ? getFileName(tab.path) : tab.draftName || t("workspace.untitled");
}

function getNextDraftName() {
  const number = nextDraftId++;
  if (number === 1) return t("workspace.untitled");
  return t("workspace.untitledNumbered", { number });
}

function setTitle(tab, { dirty = false } = {}) {
  if (!tab) {
    document.title = t("app.name");
    return;
  }
  const name = getTabDisplayName(tab);
  document.title = (dirty ? "* " : "") + name + " — " + t("app.name");
}

function getRuntimePlatform() {
  return String(navigator.userAgentData?.platform || navigator.platform || "");
}

function getRevealActionLabel() {
  const platform = getRuntimePlatform();
  if (/win/i.test(platform)) return t("context.reveal.win");
  if (/mac/i.test(platform)) return t("context.reveal.mac");
  return t("context.reveal.default");
}

function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

function getReaderScrollY() {
  if (viewMode === "split") {
    return contentEl()?.scrollTop ?? 0;
  }
  return readerContentEl()?.scrollTop ?? window.scrollY;
}

function setReaderScrollY(value) {
  if (viewMode === "split") {
    if (contentEl()) contentEl().scrollTop = value;
    return;
  }
  const reader = readerContentEl();
  if (reader) {
    reader.scrollTop = value;
  } else {
    window.scrollTo(0, value);
  }
}

function getActiveTopScrollY() {
  if (!activeTabId) return 0;
  if (viewMode === "edit") return editorEl()?.scrollTop ?? 0;
  if (viewMode === "split") {
    return Math.max(editorEl()?.scrollTop ?? 0, contentEl()?.scrollTop ?? 0);
  }
  return readerContentEl()?.scrollTop ?? 0;
}

function updateBackToTopButton() {
  const button = backToTopButton();
  if (!button) return;

  button.classList.toggle("hidden", getActiveTopScrollY() < BACK_TO_TOP_THRESHOLD);
}

function scrollElementToTop(element) {
  if (!element) return;
  element.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

function scrollActiveViewToTop() {
  if (viewMode === "edit") {
    scrollElementToTop(editorEl());
  } else if (viewMode === "split") {
    scrollElementToTop(editorEl());
    scrollElementToTop(contentEl());
  } else {
    scrollElementToTop(readerContentEl());
  }

  window.setTimeout(updateBackToTopButton, 320);
}

function getLineStartOffset(value, lineIndex) {
  if (lineIndex <= 0) return 0;

  let offset = 0;
  for (let line = 0; line < lineIndex; line += 1) {
    const nextBreak = value.indexOf("\n", offset);
    if (nextBreak === -1) return value.length;
    offset = nextBreak + 1;
  }
  return offset;
}

function getEditorLineScrollTop(editor, lineIndex) {
  const styles = window.getComputedStyle(editor);
  const fontSize = Number.parseFloat(styles.fontSize) || 14;
  const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.65;
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0;

  return Math.max(0, paddingTop + lineIndex * lineHeight - lineHeight * 2);
}

function scrollEditorToLine(lineIndex) {
  const editor = editorEl();
  const tab = getActiveTab();
  if (!editor || !tab || lineIndex === null || Number.isNaN(lineIndex)) return;

  const position = getLineStartOffset(editor.value, lineIndex);
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(position, position);
  editor.scrollTop = getEditorLineScrollTop(editor, lineIndex);
  tab.editorScrollY = editor.scrollTop;
}

function scrollPreviewHeadingToId(targetId) {
  const heading = document.getElementById(targetId);
  if (!heading) return;

  scrollPreviewHeadingToElement(heading);
}

function scrollPreviewHeadingToElement(heading) {
  const container = viewMode === "split" ? contentEl() : readerContentEl();
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const headingRect = heading.getBoundingClientRect();
  const top = container.scrollTop + headingRect.top - containerRect.top - 24;

  container.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth",
  });
}

function decodeAnchorFragment(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/\+/g, " "));
  } catch (_) {
    return String(value || "");
  }
}

function normalizeAnchorKey(value) {
  return decodeAnchorFragment(value)
    .trim()
    .toLocaleLowerCase();
}

function slugifyHeadingText(text, { replacePunctuation = true } = {}) {
  const normalized = String(text || "")
    .trim()
    .normalize("NFKD")
    .toLocaleLowerCase();
  const punctuationPattern = /[^\p{Letter}\p{Number}\p{Mark}]+/gu;
  const slug = replacePunctuation
    ? normalized.replace(punctuationPattern, "-")
    : normalized.replace(/[^\p{Letter}\p{Number}\p{Mark}\s-]+/gu, "").replace(/\s+/g, "-");

  return slug.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function getHeadingSlugCandidates(text) {
  const values = [
    slugifyHeadingText(text, { replacePunctuation: true }),
    slugifyHeadingText(text, { replacePunctuation: false }),
    String(text || "").trim().toLocaleLowerCase(),
  ];

  return Array.from(new Set(values.filter(Boolean)));
}

function getUniqueSlug(slug, slugCounts) {
  const count = slugCounts.get(slug) || 0;
  slugCounts.set(slug, count + 1);
  return count ? `${slug}-${count}` : slug;
}

function applyHeadingAnchors(headings, headingSourceLines) {
  const slugCounts = new Map();

  headings.forEach((heading, index) => {
    const existingId = heading.getAttribute("id");
    const slugs = getHeadingSlugCandidates(heading.textContent);
    const uniqueSlugs = slugs.map((slug) => getUniqueSlug(slug, slugCounts));
    const fallbackId = `md-heading-${activeTabId}-${index}`;
    const primaryId = existingId || uniqueSlugs[0] || fallbackId;

    heading.id = primaryId;
    heading.dataset.anchorSlugs = JSON.stringify(
      Array.from(new Set([primaryId, ...uniqueSlugs, fallbackId])).map(normalizeAnchorKey),
    );
    if (headingSourceLines[index] !== null && headingSourceLines[index] !== undefined) {
      heading.dataset.sourceLine = String(headingSourceLines[index]);
    }
  });
}

function findMarkdownAnchorTarget(fragment) {
  const rawFragment = String(fragment || "").replace(/^#/, "");
  if (!rawFragment) return null;

  const decodedFragment = decodeAnchorFragment(rawFragment);
  const directTarget = document.getElementById(decodedFragment) || document.getElementById(rawFragment);
  if (directTarget && contentEl()?.contains(directTarget)) return directTarget;

  const key = normalizeAnchorKey(rawFragment);
  return Array.from(contentEl().querySelectorAll("[data-anchor-slugs]"))
    .find((heading) => {
      try {
        return JSON.parse(heading.dataset.anchorSlugs || "[]").includes(key);
      } catch (_) {
        return false;
      }
    }) || null;
}

function getMarkdownLinkHash(link) {
  const href = link.getAttribute("href") || "";
  if (href.startsWith("#")) return href.slice(1);

  try {
    const url = new URL(link.href);
    const current = new URL(window.location.href);
    if (url.origin === current.origin && url.pathname === current.pathname && url.hash) {
      return url.hash.slice(1);
    }
  } catch (_) {}

  return null;
}

function activateOutlineTarget(targetId) {
  const outline = document.getElementById("document-outline");
  if (!outline || !targetId) return;

  const targetButton =
    Array.from(outline.querySelectorAll("[data-outline-target]"))
      .find((button) => button.dataset.outlineTarget === targetId);
  if (!targetButton) return;

  outline.querySelectorAll(".active").forEach((item) => item.classList.remove("active"));
  targetButton.closest("li")?.classList.add("active");
}

function navigateToMarkdownAnchor(target) {
  if (!target) return;

  scrollPreviewHeadingToElement(target);
  activateOutlineTarget(target.id);

  const lineIndex = Number.parseInt(target.dataset.sourceLine || "", 10);
  if (viewMode === "split" && !Number.isNaN(lineIndex)) {
    scrollEditorToLine(lineIndex);
  }
}

function renderDocumentOutline() {
  const outline = document.getElementById("document-outline");
  if (!outline) return;

  outline.innerHTML = "";
  if (!activeTabId) {
    const item = document.createElement("li");
    item.className = "outline-empty";
    item.textContent = t("outline.openFile");
    outline.appendChild(item);
    return;
  }

  const headings = Array.from(contentEl().querySelectorAll("h1, h2, h3, h4, h5, h6"));
  if (!headings.length) {
    const item = document.createElement("li");
    item.className = "outline-empty";
    item.textContent = t("outline.noHeadings");
    outline.appendChild(item);
    return;
  }

  const stack = [{ level: 0, list: outline }];
  const headingSourceLines = getMarkdownHeadingSourceLines(getActiveTab()?.content);
  applyHeadingAnchors(headings, headingSourceLines);

  headings.forEach((heading, index) => {
    const id = heading.id;
    const level = Number(heading.tagName.slice(1));

    while (stack.length > 1 && stack.at(-1).level >= level) {
      stack.pop();
    }

    const parent = stack.at(-1);
    const item = document.createElement("li");
    item.className = `outline-item outline-level-h${level}`;
    if (index === 0) item.classList.add("active");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "outline-link";
    button.dataset.outlineTarget = id;
    if (headingSourceLines[index] !== null && headingSourceLines[index] !== undefined) {
      button.dataset.outlineLine = String(headingSourceLines[index]);
    }
    button.textContent = heading.textContent.trim() || t("outline.heading", { number: index + 1 });
    item.appendChild(button);

    const childList = document.createElement("ol");
    childList.className = "outline-children";
    item.appendChild(childList);

    parent.list.appendChild(item);
    stack.push({ level, list: childList });
  });
}

function createWorkspaceTree(files) {
  const root = {
    name: "",
    path: "",
    dirs: new Map(),
    files: [],
  };

  files.forEach((file) => {
    const parts = getPathParts(file.relative_path || file.name);
    if (!parts.length) return;

    let node = root;
    parts.slice(0, -1).forEach((part) => {
      const dirPath = node.path ? `${node.path}/${part}` : part;
      if (!node.dirs.has(part)) {
        node.dirs.set(part, {
          name: part,
          path: dirPath,
          dirs: new Map(),
          files: [],
        });
      }
      node = node.dirs.get(part);
    });

    node.files.push(file);
  });

  return root;
}

function collapseWorkspaceDirsByDefault(files) {
  collapsedWorkspaceDirs.clear();
  files.forEach((file) => {
    const parts = getPathParts(file.relative_path || file.name).slice(0, -1);
    let current = "";
    parts.forEach((part) => {
      current = current ? `${current}/${part}` : part;
      collapsedWorkspaceDirs.add(current);
    });
  });
}

function ensureWorkspaceDirExpanded(relativePath) {
  collapsedWorkspaceDirs.delete("");
  const parts = getPathParts(relativePath).slice(0, -1);
  let current = "";
  parts.forEach((part) => {
    current = current ? `${current}/${part}` : part;
    collapsedWorkspaceDirs.delete(current);
  });
}

function renderFileTreeItem(file, parentList, depth, activePath, source = "workspace") {
  const item = document.createElement("li");
  item.className = "tree-item file-item";
  item.style.setProperty("--tree-depth", depth);
  if (file.path === activePath) item.classList.add("active");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "file-row";
  button.dataset.workspaceFile = file.path;
  button.dataset.workspaceSource = source;
  button.title = file.relative_path || file.name;

  const spacer = document.createElement("span");
  spacer.className = "tree-twisty spacer";
  button.appendChild(spacer);

  const icon = document.createElement("span");
  icon.className = "file-icon";
  button.appendChild(icon);

  const name = document.createElement("span");
  name.className = "tree-name";
  name.textContent = file.name || file.relative_path;
  button.appendChild(name);

  item.appendChild(button);
  parentList.appendChild(item);
}

function renderEmptyTreeItem(parentList, text, depth = 0) {
  const item = document.createElement("li");
  item.className = "file-list-empty indented";
  item.style.setProperty("--tree-depth", depth);
  item.textContent = text;
  parentList.appendChild(item);
}

function renderWorkspaceTreeNode(node, parentList, depth, activePath) {
  const dirs = Array.from(node.dirs.values()).sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
  const files = [...node.files].sort((a, b) =>
    (a.name || a.relative_path).toLowerCase().localeCompare((b.name || b.relative_path).toLowerCase()),
  );

  dirs.forEach((dir) => {
    const item = document.createElement("li");
    item.className = "tree-item folder-item";
    item.style.setProperty("--tree-depth", depth);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-row";
    button.dataset.workspaceDir = dir.path;
    button.title = dir.path;

    const isCollapsed = collapsedWorkspaceDirs.has(dir.path);
    const twisty = document.createElement("span");
    twisty.className = "tree-twisty";
    twisty.textContent = isCollapsed ? "›" : "⌄";
    button.appendChild(twisty);

    const icon = document.createElement("span");
    icon.className = "folder-icon";
    button.appendChild(icon);

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = dir.name;
    button.appendChild(name);

    item.appendChild(button);
    parentList.appendChild(item);

    if (!isCollapsed) {
      renderWorkspaceTreeNode(dir, parentList, depth + 1, activePath);
    }
  });

  files.forEach((file) => {
    renderFileTreeItem(file, parentList, depth, activePath);
  });
}

function renderWorkspaceRoot(parentList, activePath) {
  const item = document.createElement("li");
  item.className = "tree-item folder-item workspace-root-item";
  item.style.setProperty("--tree-depth", 0);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "folder-row workspace-root-row";
  button.dataset.workspaceDir = "";
  button.title = workspace.root;

  const isCollapsed = collapsedWorkspaceDirs.has("");
  const twisty = document.createElement("span");
  twisty.className = "tree-twisty";
  twisty.textContent = isCollapsed ? "›" : "⌄";
  button.appendChild(twisty);

  const icon = document.createElement("span");
  icon.className = "folder-icon";
  button.appendChild(icon);

  const name = document.createElement("span");
  name.className = "tree-name";
  name.textContent = workspace.name || getBaseName(workspace.root) || t("workspace.defaultName");
  button.appendChild(name);

  const count = document.createElement("span");
  count.className = "tree-count";
  count.textContent = String(workspace.files.length);
  button.appendChild(count);

  item.appendChild(button);
  parentList.appendChild(item);

  if (isCollapsed) return;

  if (!workspace.files.length) {
    renderEmptyTreeItem(parentList, t("workspace.noMarkdown"), 1);
    return;
  }

  renderWorkspaceTreeNode(createWorkspaceTree(workspace.files), parentList, 1, activePath);
}

function renderLooseFiles(activePath) {
  const section = document.getElementById("loose-files-section");
  const fileList = document.getElementById("loose-file-list");
  if (!section || !fileList) return;

  fileList.innerHTML = "";
  section.hidden = looseFiles.length === 0;
  if (!looseFiles.length) return;

  looseFiles
    .slice()
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    .forEach((file) => renderFileTreeItem(file, fileList, 0, activePath, "loose"));
}

function renderWorkspaceFiles() {
  const fileList = document.getElementById("workspace-file-list");
  if (!fileList) return;

  fileList.innerHTML = "";
  if (!workspace) {
    if (!looseFiles.length) {
      renderEmptyTreeItem(fileList, t("workspace.drop"));
    }
    renderLooseFiles(getActiveTab()?.path);
    return;
  }

  const activePath = getActiveTab()?.path;
  renderWorkspaceRoot(fileList, activePath);
  renderLooseFiles(activePath);
}

function setWorkspace(payload) {
  workspace = {
    root: payload.root,
    name: payload.name,
    files: payload.files || [],
  };
  collapseWorkspaceDirsByDefault(workspace.files);
  looseFiles = looseFiles.filter((file) => !isPathInsideRoot(file.path, workspace.root));
  renderWorkspaceFiles();
}

function upsertLooseFile(path) {
  if (looseFiles.some((file) => file.path === path)) return;
  looseFiles.push({
    path,
    name: getFileName(path),
    relative_path: getFileName(path),
  });
}

function ensureFileTracked(path) {
  if (!isMarkdownPath(path)) return;

  if (!workspace || !isPathInsideRoot(path, workspace.root)) {
    upsertLooseFile(path);
    renderWorkspaceFiles();
    return;
  }

  if (!workspace.files.some((file) => file.path === path)) {
    workspace.files.push({
      path,
      name: getFileName(path),
      relative_path: getPathRelativeToRoot(path, workspace.root),
    });
    workspace.files.sort((a, b) =>
      a.relative_path.toLowerCase().localeCompare(b.relative_path.toLowerCase()),
    );
  }
  ensureWorkspaceDirExpanded(getPathRelativeToRoot(path, workspace.root));

  renderWorkspaceFiles();
}

function pruneClosedLooseFiles(closedPaths = []) {
  const closed = new Set(closedPaths);
  if (!closed.size) return;

  const openPaths = new Set(tabs.map((tab) => tab.path).filter(Boolean));
  const beforeCount = looseFiles.length;
  looseFiles = looseFiles.filter((file) => {
    if (!closed.has(file.path)) return true;
    if (file.path && openPaths.has(file.path)) return true;
    return workspace && isPathInsideRoot(file.path, workspace.root);
  });

  if (looseFiles.length !== beforeCount) renderWorkspaceFiles();
}

function updateSidePanel() {
  const activeTab = getActiveTab();
  document.body.classList.toggle("has-open-document", Boolean(activeTab));
  renderWorkspaceFiles();

  if (!activeTab) {
    renderDocumentOutline();
  }
}

function initScreenshotDemo() {
  const sidePanel = document.getElementById("side-panel");
  applyDefaultSidebarWidth();
  sidePanel?.style.setProperty("--outline-panel-height", "230px");

  setWorkspace({
    root: SCREENSHOT_DEMO_ROOT,
    name: "Markdown Library",
    files: SCREENSHOT_DEMO_FILES,
  });

  looseFiles = [
    {
      path: "/Users/demo/Downloads/meeting-notes.md",
      name: "meeting-notes.md",
      relative_path: "meeting-notes.md",
    },
    {
      path: "/Users/demo/Desktop/release-plan.md",
      name: "release-plan.md",
      relative_path: "release-plan.md",
    },
  ];

  createTab(
    `${SCREENSHOT_DEMO_ROOT}/Writing/Technical Documentation.md`,
    SCREENSHOT_DEMO_DOCS[`${SCREENSHOT_DEMO_ROOT}/Writing/Technical Documentation.md`],
  );
  const technicalTab = getActiveTab();
  if (technicalTab) technicalTab.themeId = "technical";

  createTab(
    `${SCREENSHOT_DEMO_ROOT}/Writing/Academic Theme.md`,
    SCREENSHOT_DEMO_DOCS[`${SCREENSHOT_DEMO_ROOT}/Writing/Academic Theme.md`],
  );
  const academicTab = getActiveTab();
  if (academicTab) academicTab.themeId = "academic";

  if (technicalTab) switchToTab(technicalTab.id);

  document.body.dataset.screenshotReady = "true";
}

function getTabByPath(path) {
  if (!path) return null;
  return tabs.find((t) => t.path === path);
}

function renderTabBar() {
  const list = tabListEl();
  list.innerHTML = tabs
    .map(
      (tab) => {
        const classes = ["tab"];
        if (tab.id === activeTabId) classes.push("active");
        if (tab.dirty) classes.push("dirty");
        if (tab.externalContent !== null) classes.push("conflicted");
        const fileName = getTabDisplayName(tab);
        const title = escapeHTML(fileName);
        const closeLabel = escapeHTML(t("common.close"));
        return (
          `<div class="${classes.join(" ")}" data-tab-id="${tab.id}" title="${title}">` +
          `<span class="tab-title" title="${title}">${title}</span>` +
          `<button class="tab-close" type="button" title="${closeLabel}" aria-label="${closeLabel}">×</button>` +
          `</div>`
        );
      },
    )
    .join("");

  requestAnimationFrame(() => scrollTabIntoView(activeTabId));
}

function scrollTabIntoView(tabId) {
  if (!tabId) return;
  const tab = tabListEl().querySelector(`[data-tab-id="${tabId}"]`);
  tab?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
}

function getErrorMessage(error) {
  if (typeof error === "string") return error;
  return error?.message || t("error.unknown");
}

function cancelPendingPreviewRender() {
  if (!pendingPreviewRenderId) return;
  cancelAnimationFrame(pendingPreviewRenderId);
  pendingPreviewRenderId = 0;
}

function renderActiveDraftPreview() {
  const tab = getActiveTab();
  if (!tab) return;
  renderMarkdown(tab.content);
  updateSidePanel();
}

function scheduleActivePreviewRender() {
  cancelPendingPreviewRender();
  pendingPreviewRenderId = requestAnimationFrame(() => {
    pendingPreviewRenderId = 0;
    renderActiveDraftPreview();
  });
}

function flushActivePreviewRender() {
  if (!pendingPreviewRenderId) return;
  cancelPendingPreviewRender();
  renderActiveDraftPreview();
}

function syncEditorFromTab(tab) {
  const editor = editorEl();
  if (!editor || !tab) return;
  if (editor.value !== tab.content) {
    editor.value = tab.content;
  }
}

function getEditorScrollY() {
  return editorEl()?.scrollTop ?? 0;
}

function setEditorScrollY(value) {
  const editor = editorEl();
  if (editor) editor.scrollTop = value;
}

function applyEditorEdit(nextValue, selectionStart, selectionEnd = selectionStart) {
  const editor = editorEl();
  if (!editor) return;

  const scrollTop = editor.scrollTop;
  editor.value = nextValue;
  editor.focus();
  editor.setSelectionRange(selectionStart, selectionEnd);
  handleEditorInput();
  editor.scrollTop = scrollTop;
}

function handleEditorKeyDown(event) {
  handleMarkdownEditorKeyDown(event, {
    getEditorElement: editorEl,
    applyEditorEdit,
  });
}

function setViewMode(mode, { persist = true, focusEditor = false } = {}) {
  const nextMode = ["preview", "edit", "split"].includes(mode) ? mode : "preview";
  const previousMode = viewMode;
  const previousReaderScrollY = getReaderScrollY();
  const previousEditorScrollY = getEditorScrollY();
  viewMode = nextMode;

  if (persist) {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }

  const workspaceEl = documentWorkspaceEl();
  if (workspaceEl) {
    workspaceEl.classList.remove("mode-preview", "mode-edit", "mode-split");
    workspaceEl.classList.add(`mode-${viewMode}`);
  }

  const readerEl = readerContentEl();
  if (readerEl) {
    readerEl.classList.remove("reader-mode-preview", "reader-mode-edit", "reader-mode-split");
    readerEl.classList.add(`reader-mode-${viewMode}`);
  }

  document.querySelectorAll("#view-mode-toggle [data-view-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.viewMode === viewMode));
  });

  if (focusEditor && getActiveTab() && (viewMode === "edit" || viewMode === "split")) {
    editorEl()?.focus();
  }

  if (previousMode !== viewMode && getActiveTab()) {
    requestAnimationFrame(() => {
      setReaderScrollY(previousReaderScrollY);
      setEditorScrollY(previousEditorScrollY);
      updateBackToTopButton();
    });
  }
  updateBackToTopButton();
}

function updateEditorControls() {
  const tab = getActiveTab();
  const hasDocument = Boolean(tab);
  const saveButton = saveMarkdownButton();

  document.querySelectorAll("#view-mode-toggle [data-view-mode]").forEach((button) => {
    button.disabled = !hasDocument;
    button.setAttribute("aria-pressed", String(button.dataset.viewMode === viewMode));
  });

  if (saveButton) {
    saveButton.disabled = !tab || tab.saving || (!tab.isDraft && !tab.dirty);
  }

  const status = editorStatusEl();
  if (status) {
    if (!tab) status.textContent = "";
    else if (tab.saving) status.textContent = t("editor.status.saving");
    else if (tab.isDraft) status.textContent = t("editor.status.draft");
    else if (tab.externalContent !== null) status.textContent = t("editor.status.externalModified");
    else if (tab.dirty) status.textContent = t("editor.status.unsaved");
    else status.textContent = t("editor.status.saved");
  }

  if (tab) {
    setTitle(tab, { dirty: tab.dirty });
  }
  document.body.classList.toggle("has-unsaved-documents", tabs.some((item) => item.dirty));
  updateBackToTopButton();
}

async function chooseMarkdownSavePath(tab) {
  const selected = await save({
    title: t("dialog.saveMarkdown"),
    defaultPath: getNewMarkdownDefaultPath(tab),
    filters: [
      { name: t("filter.markdown"), extensions: ["md", "markdown", "mdx", "mkd"] },
    ],
    canCreateDirectories: true,
  });

  if (typeof selected !== "string" || !selected) return "";
  return ensureMarkdownFileExtension(selected);
}

function updateTabDirtyState(tab) {
  const wasDirty = tab.dirty;
  tab.dirty = tab.content !== tab.savedContent;
  if (wasDirty !== tab.dirty) {
    renderTabBar();
  }
  if (tab.id === activeTabId) {
    updateEditorControls();
  }
}

function replaceTabContentFromDisk(tab, rawContent) {
  const normalized = normalizeMarkdownContent(rawContent);
  tab.content = normalized;
  tab.savedContent = normalized;
  tab.lineEnding = detectLineEnding(rawContent);
  tab.isDraft = false;
  tab.draftName = "";
  tab.dirty = false;
  tab.externalContent = null;
  tab.externalLineEnding = null;

  if (tab.id === activeTabId) {
    syncEditorFromTab(tab);
    cancelPendingPreviewRender();
    renderMarkdown(tab.content);
    updateSidePanel();
    updateEditorControls();
  }
}

async function saveTab(tab = getActiveTab()) {
  if (!tab || tab.saving) return false;

  const draftAtSave = tab.content;
  let targetPath = "";
  try {
    targetPath = tab.path || await chooseMarkdownSavePath(tab);
  } catch (error) {
    console.error("Failed to choose Markdown save path:", error);
    window.alert(t("alert.saveFailed", { message: getErrorMessage(error) }));
    return false;
  }
  if (!targetPath) return false;

  const existingTarget = getTabByPath(targetPath);
  if (existingTarget && existingTarget.id !== tab.id) {
    window.alert(t("alert.savePathAlreadyOpen", { name: getFileName(targetPath) }));
    switchToTab(existingTarget.id);
    return false;
  }

  tab.saving = true;
  renderTabBar();
  updateEditorControls();

  try {
    const contents = applyLineEnding(draftAtSave, tab.lineEnding || "\n");
    const command = tab.isDraft ? "write_markdown_file" : "save_markdown_file";
    const result = await invoke(command, { path: targetPath, contents });
    const savedRawContent = result?.content ?? contents;
    const savedContent = normalizeMarkdownContent(savedRawContent);

    tab.path = result?.path || targetPath;
    tab.isDraft = false;
    tab.draftName = "";
    tab.savedContent = savedContent;
    tab.lineEnding = detectLineEnding(savedRawContent);
    tab.externalContent = null;
    tab.externalLineEnding = null;

    if (tab.content === draftAtSave) {
      tab.content = savedContent;
      tab.dirty = false;
      if (tab.id === activeTabId) {
        syncEditorFromTab(tab);
        cancelPendingPreviewRender();
        renderMarkdown(tab.content);
        updateSidePanel();
      }
    } else {
      tab.dirty = tab.content !== tab.savedContent;
    }

    ensureFileTracked(tab.path);

    return true;
  } catch (error) {
    console.error("Failed to save Markdown:", error);
    window.alert(t("alert.saveFailed", { message: getErrorMessage(error) }));
    return false;
  } finally {
    tab.saving = false;
    renderTabBar();
    updateEditorControls();
    updateSidePanel();
  }
}

async function saveActiveTab() {
  return saveTab(getActiveTab());
}

function handleEditorInput() {
  const tab = getActiveTab();
  const editor = editorEl();
  if (!tab || !editor) return;

  const wasDirty = tab.dirty;
  const hadExternalContent = tab.externalContent !== null;
  tab.content = normalizeMarkdownContent(editor.value);

  if (tab.externalContent !== null && tab.content === tab.externalContent) {
    tab.savedContent = tab.externalContent;
    tab.lineEnding = tab.externalLineEnding || tab.lineEnding;
    tab.externalContent = null;
    tab.externalLineEnding = null;
  }

  tab.dirty = tab.content !== tab.savedContent;
  scheduleActivePreviewRender();

  if (wasDirty !== tab.dirty || hadExternalContent !== (tab.externalContent !== null)) {
    renderTabBar();
  }
  updateEditorControls();
}

async function handleExternalFileChange(path, rawContent) {
  const tab = getTabByPath(path);
  if (!tab) return;

  const normalized = normalizeMarkdownContent(rawContent);

  if (normalized === tab.savedContent) {
    tab.externalContent = null;
    tab.externalLineEnding = null;
    updateTabDirtyState(tab);
    renderTabBar();
    return;
  }

  if (normalized === tab.content) {
    replaceTabContentFromDisk(tab, rawContent);
    renderTabBar();
    return;
  }

  if (!tab.dirty) {
    replaceTabContentFromDisk(tab, rawContent);
    renderTabBar();
    return;
  }

  if (tab.externalContent === normalized) return;

  tab.externalContent = normalized;
  tab.externalLineEnding = detectLineEnding(rawContent);
  renderTabBar();
  updateEditorControls();

  if (tab.id !== activeTabId) return;

  const shouldReload = window.confirm(t("confirm.externalModified", { name: getFileName(tab.path) }));

  if (shouldReload) {
    replaceTabContentFromDisk(tab, rawContent);
    renderTabBar();
  }
}

function switchToTab(tabId) {
  const current = tabs.find((t) => t.id === activeTabId);
  if (current) {
    current.scrollY = getReaderScrollY();
    current.editorScrollY = getEditorScrollY();
  }

  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return;

  activeTabId = tabId;
  cancelPendingPreviewRender();
  applyTabTheme(tab);
  syncEditorFromTab(tab);
  renderMarkdown(tab.content);
  setTitle(tab, { dirty: tab.dirty });
  renderTabBar();
  updateExportButton();
  updateSidePanel();
  updateEditorControls();

  requestAnimationFrame(() => {
    setReaderScrollY(tab.scrollY || 0);
    setEditorScrollY(tab.editorScrollY || 0);
    updateBackToTopButton();
  });
}

function createTab(path, content) {
  ensureFileTracked(path);
  const normalizedContent = normalizeMarkdownContent(content);

  const existing = getTabByPath(path);
  if (existing) {
    if (existing.dirty) {
      if (normalizedContent === existing.content) {
        replaceTabContentFromDisk(existing, content);
      } else if (normalizedContent !== existing.savedContent) {
        existing.externalContent = normalizedContent;
        existing.externalLineEnding = detectLineEnding(content);
      }
    } else {
      replaceTabContentFromDisk(existing, content);
    }
    switchToTab(existing.id);
    return;
  }

  const id = "tab-" + nextTabId++;
  tabs.push({
    id,
    path,
    draftName: "",
    isDraft: false,
    content: normalizedContent,
    savedContent: normalizedContent,
    lineEnding: detectLineEnding(content),
    dirty: false,
    saving: false,
    externalContent: null,
    externalLineEnding: null,
    scrollY: 0,
    editorScrollY: 0,
    themeId: currentThemeId(),
  });
  switchToTab(id);
}

function createDraftTab() {
  const id = "tab-" + nextTabId++;
  tabs.push({
    id,
    path: "",
    draftName: getNextDraftName(),
    isDraft: true,
    content: "",
    savedContent: "",
    lineEnding: "\n",
    dirty: false,
    saving: false,
    externalContent: null,
    externalLineEnding: null,
    scrollY: 0,
    editorScrollY: 0,
    themeId: currentThemeId(),
  });
  switchToTab(id);
  setViewMode("edit", { focusEditor: true });
}

function resetAllTabs() {
  tabs = [];
  activeTabId = null;
  nextDraftId = 1;
  cancelPendingPreviewRender();
  editorEl().value = "";
  contentEl().innerHTML = "";
  documentWorkspaceEl().hidden = true;
  emptyEl().style.display = "";
  setTitle(null);
  renderTabBar();
  updateExportButton();
  updateSidePanel();
  updateEditorControls();
  updateBackToTopButton();
}

function resolveUnsavedDecision(decision) {
  const resolver = unsavedDecisionResolver;
  unsavedDecisionResolver = null;
  document.getElementById("unsaved-backdrop")?.classList.add("hidden");
  resolver?.(decision);
}

function requestUnsavedDecision(tab) {
  const backdrop = document.getElementById("unsaved-backdrop");
  const fileName = document.getElementById("unsaved-file-name");
  const message = document.getElementById("unsaved-message");

  if (!backdrop || !fileName || !message) {
    return Promise.resolve(window.confirm(t("unsaved.confirmDiscard")) ? "discard" : "cancel");
  }

  fileName.textContent = getTabDisplayName(tab);
  message.textContent = t("unsaved.closeMessage");
  backdrop.classList.remove("hidden");

  return new Promise((resolve) => {
    unsavedDecisionResolver = resolve;
    requestAnimationFrame(() => document.getElementById("unsaved-save")?.focus());
  });
}

async function confirmTabClose(tab) {
  if (!tab?.dirty) return true;

  const decision = await requestUnsavedDecision(tab);
  if (decision === "cancel") return false;
  if (decision === "discard") return true;
  if (decision === "save") return saveTab(tab);
  return false;
}

async function confirmTabsCanClose(tabIds) {
  for (const tabId of tabIds) {
    const tab = tabs.find((item) => item.id === tabId);
    if (!(await confirmTabClose(tab))) {
      return false;
    }
  }
  return true;
}

function closeTabsNow(tabIds, fallbackIndex = 0, fallbackTabId = null) {
  const ids = new Set(tabIds);
  if (!ids.size) return;
  const closedPaths = tabs.filter((tab) => ids.has(tab.id)).map((tab) => tab.path).filter(Boolean);

  const current = getActiveTab();
  if (current) {
    current.scrollY = getReaderScrollY();
    current.editorScrollY = getEditorScrollY();
  }

  const activeWasClosed = ids.has(activeTabId);
  tabs = tabs.filter((tab) => !ids.has(tab.id));

  if (!tabs.length) {
    resetAllTabs();
    pruneClosedLooseFiles(closedPaths);
    return;
  }

  pruneClosedLooseFiles(closedPaths);

  if (!activeWasClosed && tabs.some((tab) => tab.id === activeTabId)) {
    renderTabBar();
    updateExportButton();
    updateSidePanel();
    updateEditorControls();
    return;
  }

  const fallbackExists = fallbackTabId && tabs.some((tab) => tab.id === fallbackTabId);
  const nextTab = fallbackExists
    ? tabs.find((tab) => tab.id === fallbackTabId)
    : tabs[Math.min(fallbackIndex, tabs.length - 1)];
  switchToTab(nextTab?.id || tabs[0].id);
}

async function closeTab(tabId) {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  if (!(await confirmTabsCanClose([tabId]))) return;
  closeTabsNow([tabId], Math.min(idx, tabs.length - 2));
}

async function clearAllTabs() {
  const closedPaths = tabs.map((tab) => tab.path).filter(Boolean);
  const ids = tabs.map((tab) => tab.id);
  if (!(await confirmTabsCanClose(ids))) return;
  resetAllTabs();
  pruneClosedLooseFiles(closedPaths);
}

async function closeTabs(tabIds, fallbackIndex = 0, fallbackTabId = null) {
  if (!(await confirmTabsCanClose(tabIds))) return false;
  closeTabsNow(tabIds, fallbackIndex, fallbackTabId);
  return true;
}

function hideTabContextMenu() {
  const menu = document.getElementById("tab-context-menu");
  if (!menu) return;
  menu.classList.add("hidden");
  contextTabId = null;
}

function hideWorkspaceContextMenu() {
  const menu = document.getElementById("workspace-context-menu");
  if (!menu) return;
  menu.classList.add("hidden");
  contextWorkspacePath = null;
  contextWorkspaceTarget = null;
}

function hideImageContextMenu() {
  const menu = document.getElementById("image-context-menu");
  if (!menu) return;
  menu.classList.add("hidden");
  contextImageTarget = null;
}

function positionContextMenu(menu, x, y) {
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.classList.remove("hidden");

  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  });
}

function updateTabContextMenuState(tabId) {
  const menu = document.getElementById("tab-context-menu");
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (!menu || index === -1) return;

  menu.querySelector('[data-tab-action="close-left"]').disabled = index === 0;
  menu.querySelector('[data-tab-action="close-right"]').disabled = index === tabs.length - 1;
  menu.querySelector('[data-tab-action="close-all"]').disabled = tabs.length === 0;
}

function showTabContextMenu(tabId, x, y) {
  const menu = document.getElementById("tab-context-menu");
  if (!menu) return;

  contextTabId = tabId;
  updateTabContextMenuState(tabId);
  positionContextMenu(menu, x, y);
}

async function runTabContextAction(action, targetTabId = contextTabId) {
  const index = tabs.findIndex((tab) => tab.id === targetTabId);
  if (index === -1) return;

  const tabId = targetTabId;
  if (action === "close-current") {
    await closeTabs([tabId], index);
  } else if (action === "close-left") {
    await closeTabs(tabs.slice(0, index).map((tab) => tab.id), index, tabId);
  } else if (action === "close-right") {
    await closeTabs(tabs.slice(index + 1).map((tab) => tab.id), index, tabId);
  } else if (action === "close-all") {
    await clearAllTabs();
  }
}

function getTabsInFolder(folderPath) {
  return tabs.filter((tab) => tab.path && isPathInsideRoot(tab.path, folderPath));
}

function isWorkspaceRootPath(path) {
  return Boolean(
    workspace?.root &&
      normalizePathSeparators(path) === normalizePathSeparators(workspace.root).replace(/\/+$/, ""),
  );
}

function removeClosedWorkspaceFolder(folderPath) {
  if (!workspace?.root) return;
  if (!isWorkspaceRootPath(folderPath)) return;

  workspace = null;
  collapsedWorkspaceDirs.clear();
  renderWorkspaceFiles();
}

async function closeWorkspaceFolder(folderPath) {
  if (!folderPath || !workspace?.root) return;
  if (!isWorkspaceRootPath(folderPath)) return;

  const folderTabs = getTabsInFolder(folderPath);
  const tabIds = folderTabs.map((tab) => tab.id);
  if (!(await confirmTabsCanClose(tabIds))) return;

  if (tabIds.length) {
    closeTabsNow(tabIds, 0);
  }
  removeClosedWorkspaceFolder(folderPath);
}

async function closeLooseFile(filePath) {
  if (!filePath) return;

  const fileTabs = tabs.filter((tab) => tab.path === filePath);
  const tabIds = fileTabs.map((tab) => tab.id);
  if (!(await confirmTabsCanClose(tabIds))) return;

  if (tabIds.length) {
    const firstIndex = tabs.findIndex((tab) => tab.id === tabIds[0]);
    closeTabsNow(tabIds, Math.max(0, firstIndex));
  }

  const beforeCount = looseFiles.length;
  looseFiles = looseFiles.filter((file) => file.path !== filePath);
  if (looseFiles.length !== beforeCount) renderWorkspaceFiles();
}

function updateWorkspaceContextMenuState(target) {
  const menu = document.getElementById("workspace-context-menu");
  if (!menu) return;

  const reveal = menu.querySelector('[data-workspace-action="reveal"]');
  const closeFolder = menu.querySelector('[data-workspace-action="close-folder"]');
  const closeFile = menu.querySelector('[data-workspace-action="close-file"]');
  const separator = menu.querySelector(".context-menu-separator");
  const canCloseFolder = target?.type === "folder" && target?.isWorkspaceRoot;
  const canCloseFile = target?.type === "file" && target?.source === "loose";
  const hasCloseAction =
    canCloseFolder || canCloseFile;
  if (reveal) reveal.textContent = getRevealActionLabel();
  if (closeFolder) closeFolder.hidden = !canCloseFolder;
  if (closeFile) closeFile.hidden = !canCloseFile;
  if (separator) separator.hidden = !hasCloseAction;
}

function showWorkspaceContextMenu(target, x, y) {
  const menu = document.getElementById("workspace-context-menu");
  if (!menu) return;

  contextWorkspaceTarget = target;
  contextWorkspacePath = target?.path || null;
  updateWorkspaceContextMenuState(target);
  positionContextMenu(menu, x, y);
}

function showImageContextMenu(image, x, y) {
  const menu = document.getElementById("image-context-menu");
  if (!menu) return;

  contextImageTarget = image;
  positionContextMenu(menu, x, y);
}

async function runWorkspaceContextAction(action) {
  if (!contextWorkspacePath) return;
  if (action === "reveal") {
    try {
      await invoke("reveal_path", { path: contextWorkspacePath });
    } catch (e) {
      console.error("Failed to reveal path:", e);
    }
  } else if (
    action === "close-folder" &&
    contextWorkspaceTarget?.type === "folder" &&
    contextWorkspaceTarget?.isWorkspaceRoot
  ) {
    await closeWorkspaceFolder(contextWorkspacePath);
  } else if (action === "close-file" && contextWorkspaceTarget?.type === "file") {
    await closeLooseFile(contextWorkspacePath);
  }
}

async function runImageContextAction(action, image = contextImageTarget) {
  if (action === "copy-image") {
    await copyImageToClipboard(image, { invoke, isTauriRuntime });
  }
}

function initContextMenus() {
  const tabMenu = document.getElementById("tab-context-menu");
  const workspaceMenu = document.getElementById("workspace-context-menu");
  const imageMenu = document.getElementById("image-context-menu");
  if (!tabMenu || !workspaceMenu || !imageMenu) return;

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const tabEl = e.target.closest(".tab");
    if (tabEl && tabListEl().contains(tabEl)) {
      hideWorkspaceContextMenu();
      hideImageContextMenu();
      showTabContextMenu(tabEl.dataset.tabId, e.clientX, e.clientY);
      return;
    }

    const imageEl = e.target.closest("#markdown-content img");
    if (imageEl && contentEl().contains(imageEl)) {
      hideTabContextMenu();
      hideWorkspaceContextMenu();
      showImageContextMenu(imageEl, e.clientX, e.clientY);
      return;
    }

    const workspaceBrowser = document.getElementById("workspace-browser");
    const fileEl = e.target.closest("[data-workspace-file]");
    if (fileEl && workspaceBrowser?.contains(fileEl)) {
      hideTabContextMenu();
      hideImageContextMenu();
      showWorkspaceContextMenu(
        {
          type: "file",
          source: fileEl.dataset.workspaceSource || "workspace",
          path: fileEl.dataset.workspaceFile,
        },
        e.clientX,
        e.clientY,
      );
      return;
    }

    const dirEl = e.target.closest("[data-workspace-dir]");
    if (dirEl && workspaceBrowser?.contains(dirEl) && workspace?.root) {
      const isWorkspaceRoot = dirEl.dataset.workspaceDir === "";
      hideTabContextMenu();
      hideImageContextMenu();
      showWorkspaceContextMenu(
        {
          type: "folder",
          source: "workspace",
          isWorkspaceRoot,
          path: joinPath(workspace.root, dirEl.dataset.workspaceDir),
        },
        e.clientX,
        e.clientY,
      );
      return;
    }

    hideTabContextMenu();
    hideWorkspaceContextMenu();
    hideImageContextMenu();
  });

  tabMenu.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-tab-action]");
    if (!item || item.disabled) return;
    const action = item.dataset.tabAction;
    const tabId = contextTabId;
    hideTabContextMenu();
    await runTabContextAction(action, tabId);
  });

  workspaceMenu.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-workspace-action]");
    if (!item || item.disabled) return;
    await runWorkspaceContextAction(item.dataset.workspaceAction);
    hideWorkspaceContextMenu();
  });

  imageMenu.addEventListener("click", async (e) => {
    const item = e.target.closest("[data-image-action]");
    if (!item || item.disabled) return;

    const image = contextImageTarget;
    const actionPromise = runImageContextAction(item.dataset.imageAction, image);
    hideImageContextMenu();

    try {
      await actionPromise;
    } catch (error) {
      console.error("Failed to copy image:", error);
      window.alert(t("alert.copyImageFailed", { message: getErrorMessage(error) }));
    }
  });

  document.addEventListener("click", (e) => {
    if (!tabMenu.contains(e.target)) hideTabContextMenu();
    if (!workspaceMenu.contains(e.target)) hideWorkspaceContextMenu();
    if (!imageMenu.contains(e.target)) hideImageContextMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideTabContextMenu();
      hideWorkspaceContextMenu();
      hideImageContextMenu();
    }
  });

  window.addEventListener("blur", () => {
    hideTabContextMenu();
    hideWorkspaceContextMenu();
    hideImageContextMenu();
  });
}

function setUpdateDialogBusy(isBusy) {
  isUpdateInstalling = isBusy;
  document.getElementById("update-install").disabled = isBusy;
  document.getElementById("update-later").disabled = isBusy;
  document.getElementById("update-close").disabled = isBusy;
}

function closeUpdateDialog() {
  if (isUpdateInstalling) return;
  document.getElementById("update-backdrop")?.classList.add("hidden");
}

function setUpdateProgress(percent, label) {
  const progress = document.getElementById("update-progress");
  const bar = document.getElementById("update-progress-bar");
  const text = document.getElementById("update-progress-text");
  progress?.classList.remove("hidden");

  if (bar && Number.isFinite(percent)) {
    bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
  if (text) {
    text.textContent = label;
  }
}

function formatUpdateNotes(body) {
  return String(body || "").trim() || t("update.defaultNotes");
}

function showUpdateDialog(update) {
  const backdrop = document.getElementById("update-backdrop");
  const version = document.getElementById("update-version");
  const notes = document.getElementById("update-notes");
  const progress = document.getElementById("update-progress");
  const progressBar = document.getElementById("update-progress-bar");
  const progressText = document.getElementById("update-progress-text");
  const error = document.getElementById("update-error");
  const installButton = document.getElementById("update-install");
  if (!backdrop || !installButton) return;

  setUpdateDialogBusy(false);
  if (version) version.textContent = `${update.currentVersion} → ${update.version}`;
  if (notes) notes.textContent = formatUpdateNotes(update.body);
  progress?.classList.add("hidden");
  if (progressBar) progressBar.style.width = "0%";
  if (progressText) progressText.textContent = t("update.ready");
  error?.classList.add("hidden");
  if (error) error.textContent = "";
  backdrop.classList.remove("hidden");

  installButton.onclick = async () => {
    setUpdateDialogBusy(true);
    error?.classList.add("hidden");

    let downloaded = 0;
    let contentLength = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          downloaded = 0;
          contentLength = event.data.contentLength || 0;
          setUpdateProgress(0, contentLength ? t("update.downloadStart") : t("update.downloading"));
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const percent = contentLength ? (downloaded / contentLength) * 100 : 0;
          setUpdateProgress(
            percent,
            contentLength ? t("update.downloadingPercent", { percent: Math.round(percent) }) : t("update.downloading"),
          );
        } else if (event.event === "Finished") {
          setUpdateProgress(100, t("update.installing"));
        }
      });
      setUpdateProgress(100, t("update.relaunching"));
      await relaunch();
    } catch (err) {
      console.error("Failed to install update:", err);
      if (error) {
        error.textContent = t("update.failed");
        error.classList.remove("hidden");
      }
      setUpdateDialogBusy(false);
    }
  };
}

async function checkForAppUpdate({ manual = false } = {}) {
  if (!isTauriRuntime || isScreenshotDemo) {
    if (manual) setSettingsUpdateStatus("update.unavailable");
    return null;
  }

  try {
    const update = await check();
    if (update) {
      if (manual) closeSettingsDialog();
      showUpdateDialog(update);
      return update;
    }

    if (manual) setSettingsUpdateStatus("update.none");
    return null;
  } catch (err) {
    console.warn("Failed to check for updates:", err);
    if (manual) {
      setSettingsUpdateStatus("update.checkFailed", { message: getErrorMessage(err) });
    }
    return null;
  }
}

function initUpdateDialog() {
  document.getElementById("update-close")?.addEventListener("click", closeUpdateDialog);
  document.getElementById("update-later")?.addEventListener("click", closeUpdateDialog);

  document.getElementById("update-backdrop")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeUpdateDialog();
  });

  document.addEventListener("keydown", (e) => {
    const backdrop = document.getElementById("update-backdrop");
    if (e.key === "Escape" && backdrop && !backdrop.classList.contains("hidden")) {
      closeUpdateDialog();
    }
  });
}

function getActiveFileName() {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return "document";
  return getTabDisplayName(tab).replace(/\.[^.]+$/, "");
}

function getExportDefaultPath(extension) {
  const baseName = getActiveFileName();
  const fileName = `${baseName}.${extension}`;
  const sourceDir = getDirName(getActiveTab()?.path);

  return sourceDir ? joinLocalPath(sourceDir, fileName) : fileName;
}

function getNewMarkdownDefaultPath(tab = getActiveTab()) {
  const fileName = `${getTabDisplayName(tab) || t("workspace.untitled")}.md`;
  const sourceDir = workspace?.root || getDirName(tab?.path || getActiveTab()?.path);
  return sourceDir ? joinLocalPath(sourceDir, fileName) : fileName;
}

function ensureMarkdownFileExtension(path) {
  if (isMarkdownPath(path)) return path;
  const fileName = getFileName(path);
  return /\.[^./\\]+$/.test(fileName) ? path : `${path}.md`;
}

function getContentCSS() {
  const rules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        const text = rule.cssText;
        if (
          text.includes("#markdown-content") ||
          text.includes(".hljs") ||
          text.includes(".katex")
        ) {
          rules.push(text);
        }
      }
    } catch (_) {}
  }
  return rules.join("\n");
}

function getTypographyOverrideCSS() {
  return document.getElementById("theme-typography-override")?.textContent || "";
}

function ptToPx(pt) {
  return `${(pt * 4) / 3}px`;
}

function formatTypographyValue(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getDefaultTypographyValues() {
  const { layoutScheme } = getCurrentThemeDefinition();
  const values = {
    body: coerceTypographyValue(layoutScheme.body.fontSize) || 12,
    code: coerceTypographyValue(layoutScheme.code.fontSize) || 10,
  };

  for (const level of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    values[level] = coerceTypographyValue(layoutScheme.headings[level]?.fontSize) || 12;
  }

  return values;
}

function getTypographyInputValues(settings) {
  const defaults = getDefaultTypographyValues();
  const storedValues = settings?.values || {};
  const values = {};

  for (const field of TYPOGRAPHY_FIELDS) {
    values[field.key] = storedValues[field.key] ?? defaults[field.key];
  }

  return values;
}

function buildTypographyCSS(values) {
  const rules = [];
  const fontSizeRule = (selector, value) => `${selector} {\n  font-size: ${ptToPx(value)};\n}`;

  if (values.body) {
    rules.push(fontSizeRule("#markdown-content", values.body));
    rules.push(fontSizeRule("#markdown-content .katex", values.body));
  }

  for (const level of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    if (values[level]) rules.push(fontSizeRule(`#markdown-content ${level}`, values[level]));
  }

  if (values.code) {
    rules.push(fontSizeRule("#markdown-content code", values.code));
    rules.push(fontSizeRule("#markdown-content pre code", values.code));
  }

  return rules.join("\n\n");
}

function applyTypographyOverrides(themeId = currentThemeId(), draftSettings = null) {
  const styleId = "theme-typography-override";
  let styleEl = document.getElementById(styleId);
  const values = draftSettings
    ? draftSettings.previewEnabled ? draftSettings.values : {}
    : getTypographyValuesForScope(themeId, "preview");

  if (!Object.keys(values).length) {
    styleEl?.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = buildTypographyCSS(values);
}

function fillTypographyDialog() {
  const theme = getCurrentThemeDefinition();
  const settings = getThemeTypographySettings(theme.id);
  const values = getTypographyInputValues(settings);

  document.getElementById("typography-theme-name").textContent =
    pickLocalized(theme.theme) || theme.id;
  document.getElementById("typography-preview-enabled").checked =
    settings?.previewEnabled ?? true;
  document.getElementById("typography-export-enabled").checked =
    settings?.exportEnabled ?? true;

  const fieldsEl = document.getElementById("typography-fields");
  fieldsEl.innerHTML = TYPOGRAPHY_FIELDS.map((field) => `
    <div class="typography-field">
      <label for="typography-${field.key}">${t(`typography.field.${field.key}`)}</label>
      <div class="typography-input-wrap">
        <input
          id="typography-${field.key}"
          type="number"
          min="6"
          max="72"
          step="0.5"
          data-typography-key="${field.key}"
          value="${formatTypographyValue(values[field.key])}"
        />
        <span class="typography-unit">pt</span>
      </div>
    </div>
  `).join("");
}

function readTypographyDialog() {
  const values = {};

  document.querySelectorAll("[data-typography-key]").forEach((input) => {
    const value = coerceTypographyValue(input.value);
    if (value !== null) values[input.dataset.typographyKey] = value;
  });

  return {
    previewEnabled: document.getElementById("typography-preview-enabled").checked,
    exportEnabled: document.getElementById("typography-export-enabled").checked,
    values,
  };
}

function showSettingsPanel(panel) {
  const settingsDialog = document.getElementById("settings-dialog");
  const typographyDialog = document.getElementById("typography-dialog");
  const showTypography = panel === "typography";

  settingsDialog?.classList.toggle("hidden", showTypography);
  typographyDialog?.classList.toggle("hidden", !showTypography);
}

function openSettingsDialog() {
  const backdrop = document.getElementById("settings-backdrop");
  if (!backdrop) return;

  setSettingsUpdateStatus();
  showSettingsPanel("settings");
  syncLanguageSelect();
  backdrop.classList.remove("hidden");
  requestAnimationFrame(() => languageSelect()?.focus());
}

function closeSettingsDialog() {
  document.getElementById("settings-backdrop")?.classList.add("hidden");
  showSettingsPanel("settings");
  applyTypographyOverrides();
}

function openTypographyDialog() {
  fillTypographyDialog();
  document.getElementById("settings-backdrop").classList.remove("hidden");
  showSettingsPanel("typography");
  document.querySelector("[data-typography-key]")?.focus();
}

function closeTypographyDialog(revertPreview = true) {
  if (revertPreview) applyTypographyOverrides();
  showSettingsPanel("settings");
  document.getElementById("settings-typography-open")?.focus();
}

function saveTypographyDialog() {
  const themeId = currentThemeId();
  saveThemeTypographySettings(themeId, readTypographyDialog());
  closeTypographyDialog(false);
  applyTypographyOverrides(themeId);
}

function resetTypographyDialog() {
  const themeId = currentThemeId();
  clearThemeTypographySettings(themeId);
  closeTypographyDialog(false);
  applyTypographyOverrides(themeId);
}

async function handleManualUpdateCheck() {
  const button = document.getElementById("settings-check-update");
  if (button?.disabled) return;

  if (button) button.disabled = true;
  setSettingsUpdateStatus("update.checking");

  try {
    await checkForAppUpdate({ manual: true });
  } finally {
    if (button) button.disabled = false;
  }
}

function initSettingsDialog() {
  const backdrop = document.getElementById("settings-backdrop");
  const settingsDialog = document.getElementById("settings-dialog");
  const dialog = document.getElementById("typography-dialog");
  if (!backdrop || !settingsDialog || !dialog) return;

  document.getElementById("settings-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openSettingsDialog();
  });
  document.getElementById("settings-close")?.addEventListener("click", closeSettingsDialog);
  document.getElementById("settings-close-action")?.addEventListener("click", closeSettingsDialog);
  document.getElementById("settings-typography-open")?.addEventListener("click", openTypographyDialog);
  document.getElementById("settings-check-update")?.addEventListener("click", () => {
    void handleManualUpdateCheck();
  });

  backdrop.addEventListener("click", (e) => {
    if (e.target !== backdrop) return;
    if (!dialog.classList.contains("hidden")) {
      closeTypographyDialog();
      return;
    }
    closeSettingsDialog();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || backdrop.classList.contains("hidden")) return;
    if (!dialog.classList.contains("hidden")) {
      closeTypographyDialog();
      return;
    }
    closeSettingsDialog();
  });
}

function initTypographySettings() {
  const backdrop = document.getElementById("settings-backdrop");
  const applyDraft = () => applyTypographyOverrides(currentThemeId(), readTypographyDialog());

  document.getElementById("typography-close").addEventListener("click", () => closeTypographyDialog());
  document.getElementById("typography-cancel").addEventListener("click", () => closeTypographyDialog());
  document.getElementById("typography-save").addEventListener("click", saveTypographyDialog);
  document.getElementById("typography-reset").addEventListener("click", resetTypographyDialog);

  backdrop.addEventListener("input", (e) => {
    if (e.target.matches("[data-typography-key]")) applyDraft();
  });
  backdrop.addEventListener("change", (e) => {
    if (e.target.matches("#typography-preview-enabled, #typography-export-enabled")) {
      applyDraft();
    }
  });
}

function textToBytes(text) {
  return Array.from(new TextEncoder().encode(text));
}

function arrayBufferToBytes(buffer) {
  return Array.from(new Uint8Array(buffer));
}

async function writeExportFile(path, contents) {
  await invoke("write_export_file", { path, contents });
}

async function handleExportHTML() {
  flushActivePreviewRender();
  const baseName = getActiveFileName();
  const filePath = await save({
    defaultPath: getExportDefaultPath("html"),
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!filePath) return;

  const themeCSS = getCurrentThemeCSS();
  const contentCSS = getContentCSS();
  const typographyCSS = getTypographyOverrideCSS();
  const bodyHTML = getPortableMarkdownHTML();
  const dataTheme = document.body.getAttribute("data-theme") || "default";

  const html = `<!DOCTYPE html>
<html lang="${getHtmlLang()}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${baseName}</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
#markdown-content {
  max-width: 1060px;
  margin: 0 auto;
  padding: 40px;
}
${contentCSS}
${themeCSS}
${typographyCSS}
</style>
</head>
<body data-theme="${dataTheme}">
<article id="markdown-content" class="markdown-body">${bodyHTML}</article>
</body>
</html>`;

  await writeExportFile(filePath, textToBytes(html));
}

async function handleExportDOCX() {
  flushActivePreviewRender();
  const filePath = await save({
    defaultPath: getExportDefaultPath("docx"),
    filters: [{ name: t("filter.wordDocument"), extensions: ["docx"] }],
  });
  if (!filePath) return;

  const blob = await exportDOCX(contentEl());
  const buffer = await blob.arrayBuffer();
  await writeExportFile(filePath, arrayBufferToBytes(buffer));
}

async function handlePrintPDF() {
  flushActivePreviewRender();
  const markdown = contentEl();
  const pageBackground =
    getComputedStyle(markdown).backgroundColor ||
    getComputedStyle(document.body).backgroundColor ||
    "#ffffff";
  const printStyle = document.createElement("style");
  printStyle.id = "md-viewer-print-style";
  printStyle.textContent = `
@page {
  margin: 12mm;
  background-color: ${pageBackground};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

@media print {
  html,
  body {
    background-color: ${pageBackground} !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  #markdown-content img {
    max-width: 100%;
    max-height: 9.5in;
    height: auto;
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`;

  document.getElementById(printStyle.id)?.remove();
  document.head.appendChild(printStyle);

  const cleanup = () => {
    printStyle.remove();
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  await Promise.resolve(window.print());
  setTimeout(cleanup, 2000);
}

function initExportMenu() {
  const btn = document.getElementById("export-btn");
  const menu = document.getElementById("export-menu");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn.disabled) return;
    menu.classList.toggle("hidden");
  });

  menu.addEventListener("click", async (e) => {
    const target = e.target.closest("[data-format]");
    if (!target) return;
    menu.classList.add("hidden");

    const format = target.dataset.format;
    try {
      if (format === "html") await handleExportHTML();
      else if (format === "docx") await handleExportDOCX();
      else if (format === "print") await handlePrintPDF();
    } catch (err) {
      console.error("Export failed:", err);
    }
  });

  document.addEventListener("click", () => {
    menu.classList.add("hidden");
  });
}

function updateExportButton() {
  document.getElementById("export-btn").disabled = !activeTabId;
  updateEditorControls();
}

function initUnsavedDialog() {
  const backdrop = document.getElementById("unsaved-backdrop");
  if (!backdrop) return;

  backdrop.addEventListener("click", (e) => {
    const actionButton = e.target.closest("[data-unsaved-action]");
    if (!actionButton) return;
    resolveUnsavedDecision(actionButton.dataset.unsavedAction);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.classList.contains("hidden")) {
      e.preventDefault();
      resolveUnsavedDecision("cancel");
    }
  });
}

function initBackToTopButton() {
  backToTopButton()?.addEventListener("click", () => {
    scrollActiveViewToTop();
  });

  readerContentEl()?.addEventListener("scroll", () => {
    const tab = getActiveTab();
    if (tab && viewMode === "preview") tab.scrollY = getReaderScrollY();
    updateBackToTopButton();
  });

  contentEl()?.addEventListener("scroll", () => {
    const tab = getActiveTab();
    if (tab && viewMode === "split") tab.scrollY = getReaderScrollY();
    updateBackToTopButton();
  });
}

function initEditingControls() {
  const savedMode = localStorage.getItem(VIEW_MODE_KEY);
  setViewMode(savedMode || "preview", { persist: false });

  document.getElementById("view-mode-toggle")?.addEventListener("click", (e) => {
    const button = e.target.closest("[data-view-mode]");
    if (!button || button.disabled) return;
    setViewMode(button.dataset.viewMode, { focusEditor: true });
  });

  const editor = editorEl();
  editor?.addEventListener("keydown", handleEditorKeyDown);
  editor?.addEventListener("input", handleEditorInput);
  editor?.addEventListener("scroll", () => {
    const tab = getActiveTab();
    if (tab) tab.editorScrollY = getEditorScrollY();
    updateBackToTopButton();
  });

  saveMarkdownButton()?.addEventListener("click", () => {
    saveActiveTab();
  });

  document.addEventListener("keydown", (e) => {
    const isSaveShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s";
    if (!isSaveShortcut) return;
    e.preventDefault();
    saveActiveTab();
  });

  window.addEventListener("beforeunload", (e) => {
    if (!tabs.some((tab) => tab.dirty)) return;
    e.preventDefault();
    e.returnValue = "";
    return "";
  });

  updateEditorControls();
}

function buildThemeSelectOptions(select, selectedTheme) {
  const themes = getAvailableThemes();
  const categories = getThemeCategories();
  const groupedThemes = themes.reduce((groups, theme) => {
    const key = theme.category || "other";
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(theme);
    return groups;
  }, new Map());

  select.innerHTML = "";
  groupedThemes.forEach((groupThemes, categoryId) => {
    const group = document.createElement("optgroup");
    group.label = pickLocalized(categories[categoryId]) || categoryId;

    groupThemes.forEach((theme) => {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = pickLocalized(theme) || theme.id;
      option.selected = theme.id === selectedTheme;
      group.appendChild(option);
    });

    select.appendChild(group);
  });
}

function applyTheme(theme, { persist = true } = {}) {
  const appliedTheme = applyMarkdownTheme(theme);
  if (persist) {
    localStorage.setItem("md-viewer-theme", appliedTheme);
  }
  applyTypographyOverrides(appliedTheme);
  return appliedTheme;
}

function syncThemeSelect(themeId) {
  const select = themeSelect();
  if (select) select.value = themeId;
}

function applyTabTheme(tab) {
  const appliedTheme = applyTheme(tab.themeId || currentThemeId(), { persist: false });
  tab.themeId = appliedTheme;
  syncThemeSelect(appliedTheme);
  return appliedTheme;
}

function initTheme() {
  const select = themeSelect();
  const saved = normalizeThemeId(localStorage.getItem("md-viewer-theme") || "default");
  const appliedTheme = applyTheme(saved);
  buildThemeSelectOptions(select, appliedTheme);
  select.value = appliedTheme;
  updateSidePanel();
  select.addEventListener("change", (e) => {
    const nextTheme = applyTheme(e.target.value);
    const activeTab = getActiveTab();
    if (activeTab) {
      activeTab.themeId = nextTheme;
      void renderMarkdown(activeTab.content);
    }
    select.value = nextTheme;
    updateSidePanel();
    if (!document.getElementById("settings-backdrop").classList.contains("hidden")) {
      fillTypographyDialog();
    }
  });
}

function initOutlineNavigation() {
  const outline = document.getElementById("document-outline");
  if (!outline) return;

  outline.addEventListener("click", (e) => {
    const targetButton = e.target.closest("[data-outline-target]");
    if (!targetButton) return;

    const targetId = targetButton.dataset.outlineTarget;
    const lineIndex = Number.parseInt(targetButton.dataset.outlineLine || "", 10);

    flushActivePreviewRender();

    activateOutlineTarget(targetId);

    if (viewMode === "edit" || viewMode === "split") {
      scrollEditorToLine(lineIndex);
    }

    if (viewMode === "preview" || viewMode === "split") {
      scrollPreviewHeadingToId(targetId);
    }
  });
}

function initMarkdownAnchorNavigation() {
  const content = contentEl();
  if (!content) return;

  content.addEventListener("click", (e) => {
    const link = e.target.closest("a[href]");
    if (!link || !content.contains(link)) return;

    const hash = getMarkdownLinkHash(link);
    if (!hash) return;

    const target = findMarkdownAnchorTarget(hash);
    if (!target) return;

    e.preventDefault();
    navigateToMarkdownAnchor(target);
  });
}

function shouldStartPanelWindowDrag(event) {
  if (event.button !== 0) return false;
  if (event.target.closest("button, input, select, textarea, a, [role='separator']")) return false;

  const sidePanel = document.getElementById("side-panel");
  if (!sidePanel) return false;

  const panelRect = sidePanel.getBoundingClientRect();
  const y = event.clientY - panelRect.top;
  return y >= 0 && y <= 68;
}

async function openWorkspaceFile(path) {
  try {
    const file = workspace?.files.find((item) => item.path === path);
    if (file) {
      ensureWorkspaceDirExpanded(file.relative_path || file.name);
    }
    const result = await invoke("open_file", { path });
    createTab(result.path, result.content);
  } catch (e) {
    console.error("Failed to open file:", e);
  }
}

async function loadWorkspace(path) {
  try {
    const result = await invoke("list_markdown_files", { path });
    setWorkspace(result);
  } catch (e) {
    console.error("Failed to load workspace:", e);
  }
}

async function openWorkspaceInNewWindow(path) {
  try {
    await invoke("open_workspace_in_new_window", { path });
  } catch (e) {
    console.error("Failed to open workspace in new window:", e);
    window.alert(t("alert.openWorkspaceInNewWindowFailed", { message: getErrorMessage(e) }));
  }
}

async function handleDroppedPath(path) {
  if (isMarkdownPath(path)) {
    await openWorkspaceFile(path);
    return;
  }

  if (workspace?.root && !isSameLocalPath(path, workspace.root) && isTauriRuntime) {
    await openWorkspaceInNewWindow(path);
    return;
  }

  await loadWorkspace(path);
}

async function handleOpenedPaths(paths) {
  if (!Array.isArray(paths)) return;

  for (const path of paths) {
    if (typeof path !== "string" || !path.trim()) continue;
    await handleDroppedPath(path);
  }
}

async function chooseWorkspace() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t("dialog.chooseWorkspace"),
    });
    if (typeof selected === "string") {
      await loadWorkspace(selected);
    }
  } catch (e) {
    console.error("Failed to choose workspace:", e);
  }
}

async function refreshWorkspace() {
  if (!workspace?.root) return;
  await loadWorkspace(workspace.root);
}

function createMarkdownFile() {
  createDraftTab();
}

function initWorkspaceNavigation() {
  const workspaceBrowser = document.getElementById("workspace-browser");
  const newButton = document.getElementById("new-markdown-btn");
  const openButton = document.getElementById("open-workspace-btn");
  const refreshButton = document.getElementById("refresh-workspace-btn");

  newButton?.addEventListener("click", createMarkdownFile);
  openButton?.addEventListener("click", chooseWorkspace);
  refreshButton?.addEventListener("click", refreshWorkspace);

  if (!workspaceBrowser) return;

  workspaceBrowser.addEventListener("click", async (e) => {
    const dirButton = e.target.closest("[data-workspace-dir]");
    if (dirButton) {
      const dir = dirButton.dataset.workspaceDir;
      if (collapsedWorkspaceDirs.has(dir)) {
        collapsedWorkspaceDirs.delete(dir);
      } else {
        collapsedWorkspaceDirs.add(dir);
      }
      renderWorkspaceFiles();
      return;
    }

    const targetButton = e.target.closest("[data-workspace-file]");
    if (!targetButton) return;
    await openWorkspaceFile(targetButton.dataset.workspaceFile);
  });
}

function initTabScrolling() {
  const list = tabListEl();
  list.addEventListener("wheel", (e) => {
    if (list.scrollWidth <= list.clientWidth) return;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!delta) return;

    e.preventDefault();
    list.scrollLeft += delta;
  }, { passive: false });
}

window.addEventListener("DOMContentLoaded", async () => {
  initI18nControls();
  initTheme();
  initSettingsDialog();
  initTypographySettings();
  initCopyHandler({ contentEl });
  initExportMenu();
  initUnsavedDialog();
  initBackToTopButton();
  initEditingControls();
  initOutlineNavigation();
  initMarkdownAnchorNavigation();
  initWorkspaceNavigation();
  initContextMenus();
  initTabScrolling();
  initResizablePanels();
  initUpdateDialog();

  const tabBar = document.getElementById("tab-bar");

  tabBar.addEventListener("mousedown", async (e) => {
    if (e.button !== 0) return;

    const closeBtn = e.target.closest(".tab-close");
    if (closeBtn) {
      e.stopPropagation();
      await closeTab(closeBtn.closest(".tab").dataset.tabId);
      return;
    }

    const tabEl = e.target.closest(".tab");
    if (tabEl) {
      switchToTab(tabEl.dataset.tabId);
      return;
    }

    if (e.target.closest("#view-mode-toggle, #save-md-btn, #theme-select, #settings-btn, #export-wrapper")) return;

    getCurrentWindow().startDragging();
  });

  document.getElementById("side-panel")?.addEventListener("mousedown", (e) => {
    if (!shouldStartPanelWindowDrag(e)) return;
    getCurrentWindow().startDragging();
  });

  tabBar.addEventListener("auxclick", async (e) => {
    if (e.button !== 1) return;
    const tabEl = e.target.closest(".tab");
    if (tabEl) await closeTab(tabEl.dataset.tabId);
  });

  if (isScreenshotDemo) {
    initScreenshotDemo();
    return;
  }

  if (isTauriRuntime) {
    listen("load-file", (event) => {
      const { path, content } = event.payload;
      createTab(path, content);
    });

    listen("opened", (event) => {
      void handleOpenedPaths(event.payload);
    });

    listen("file-changed", async (event) => {
      const { path, content } = event.payload;
      await handleExternalFileChange(path, content);
    });

    const webview = getCurrentWebviewWindow();
    webview?.onDragDropEvent(async (event) => {
      if (event.payload.type === "drop" && event.payload.paths.length > 0) {
        for (const path of event.payload.paths) {
          await handleDroppedPath(path);
        }
      }
    });

    if (initialWorkspacePath) {
      await loadWorkspace(initialWorkspacePath);
    } else {
      try {
        const initialOpenedPaths = await invoke("opened_paths");
        if (Array.isArray(initialOpenedPaths) && initialOpenedPaths.length > 0) {
          await handleOpenedPaths(initialOpenedPaths);
        } else {
          const initial = await invoke("get_initial_file");
          if (initial) {
            createTab(initial.path, initial.content);
          }
        }
      } catch (_) {}
    }

    setTimeout(checkForAppUpdate, UPDATE_CHECK_DELAY_MS);
  } else {
    document.body.dataset.screenshotReady = "true";
  }
});
