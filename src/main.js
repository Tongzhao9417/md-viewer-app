import markdownit from "markdown-it";
import hljs from "highlight.js";
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
import { open, save } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { exportDOCX } from "./docx-exporter.js";

const searchParams = new URLSearchParams(window.location.search);
const isScreenshotDemo = searchParams.get("demo") === "screenshot";
const isTauriRuntime = Boolean(window.__TAURI__?.core);
const invoke = window.__TAURI__?.core?.invoke ?? (async () => {
  throw new Error("Tauri runtime is unavailable.");
});
const listen = window.__TAURI__?.event?.listen ?? (() => {});
const getCurrentWebviewWindow = window.__TAURI__?.webviewWindow?.getCurrentWebviewWindow ?? (() => null);
const getCurrentWindow = window.__TAURI__?.window?.getCurrentWindow ?? (() => ({ startDragging() {} }));

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (_) {}
    }
    return "";
  },
});

const contentEl = () => document.getElementById("markdown-content");
const documentWorkspaceEl = () => document.getElementById("document-workspace");
const editorEl = () => document.getElementById("markdown-editor");
const emptyEl = () => document.getElementById("empty-state");
const tabListEl = () => document.getElementById("tab-list");
const themeSelect = () => document.getElementById("theme-select");
const readerContentEl = () => document.getElementById("reader-content");
const saveMarkdownButton = () => document.getElementById("save-md-btn");
const editorStatusEl = () => document.getElementById("editor-status");
const currentThemeId = () => document.body.getAttribute("data-theme") || "default";

let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let workspace = null;
let looseFiles = [];
let contextTabId = null;
let contextWorkspacePath = null;
let isUpdateInstalling = false;
let viewMode = "preview";
let pendingPreviewRenderId = 0;
let unsavedDecisionResolver = null;
const collapsedWorkspaceDirs = new Set();
const SIDEBAR_WIDTH_KEY = "md-viewer-sidebar-width";
const OUTLINE_HEIGHT_KEY = "md-viewer-outline-height";
const VIEW_MODE_KEY = "md-viewer-view-mode";
const SIDEBAR_MIN_WIDTH = 248;
const SIDEBAR_MAX_WIDTH = 560;
const READER_MIN_WIDTH = 420;
const WORKSPACE_MIN_HEIGHT = 132;
const OUTLINE_MIN_HEIGHT = 96;
const RESIZE_KEYBOARD_STEP = 18;
const SCREENSHOT_DEMO_ROOT = "/Users/demo/Documents/Markdown Library";
const UPDATE_CHECK_DELAY_MS = 1200;
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
const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DIV",
  "DL",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "UL",
]);

function getDirName(path) {
  const value = String(path || "").replace(/[\\/]+$/, "");
  const index = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  if (index < 0) return "";
  if (index === 0) return value.slice(0, 1);
  if (index === 2 && /^[A-Za-z]:/.test(value)) return value.slice(0, 3);
  return value.slice(0, index);
}

function isWindowsAbsolutePath(path) {
  return /^[A-Za-z]:(?:[\\/]|%5[cC]|%2[fF])/.test(String(path || ""));
}

function isLocalAbsolutePath(path) {
  const value = String(path || "");
  return value.startsWith("/") || value.startsWith("\\\\") || isWindowsAbsolutePath(value);
}

function usesWindowsPath(path) {
  const value = String(path || "");
  return isWindowsAbsolutePath(value) || value.includes("\\");
}

function splitImageSrcSuffix(src) {
  const queryIndex = src.indexOf("?");
  const hashIndex = src.indexOf("#");
  const suffixIndex = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (suffixIndex === undefined) {
    return { pathPart: src, suffix: "" };
  }

  return {
    pathPart: src.slice(0, suffixIndex),
    suffix: src.slice(suffixIndex),
  };
}

function decodeImagePath(path) {
  try {
    return decodeURI(path).replace(/%5[cC]/g, "\\").replace(/%2[fF]/g, "/");
  } catch (_) {
    return String(path || "").replace(/%5[cC]/g, "\\").replace(/%2[fF]/g, "/");
  }
}

function fileUrlToPath(src) {
  try {
    const url = new URL(src);
    if (url.protocol !== "file:") return null;

    let pathname = decodeURIComponent(url.pathname);
    if (url.host) {
      return `\\\\${url.host}${pathname.replace(/\//g, "\\")}`;
    }
    if (/^\/[A-Za-z]:\//.test(pathname)) {
      pathname = pathname.slice(1).replace(/\//g, "\\");
    }
    return pathname;
  } catch (_) {
    return null;
  }
}

function normalizeLocalPath(path, preferWindows = false) {
  const separator = preferWindows ? "\\" : "/";
  const uncMatch = String(path || "").match(/^[\\/]{2}([^\\/]+)[\\/]+([^\\/]+)(.*)$/);

  if (preferWindows && uncMatch) {
    const [, server, share, rest = ""] = uncMatch;
    const parts = [];
    rest
      .replace(/^[\\/]+/, "")
      .replace(/[\\/]+/g, "/")
      .split("/")
      .forEach((part) => {
        if (!part || part === ".") return;
        if (part === "..") {
          if (parts.length) parts.pop();
          return;
        }
        parts.push(part);
      });

    return `\\\\${server}\\${share}${parts.length ? `\\${parts.join("\\")}` : ""}`;
  }

  const normalized = String(path || "").replace(/[\\/]+/g, "/");
  const hasDrive = /^[A-Za-z]:\//.test(normalized);
  const isAbsolute = normalized.startsWith("/");
  const prefix = hasDrive ? normalized.slice(0, 3) : isAbsolute ? "/" : "";
  const parts = [];

  normalized
    .slice(prefix.length)
    .split("/")
    .forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") {
        if (parts.length && parts[parts.length - 1] !== "..") {
          parts.pop();
        } else if (!prefix) {
          parts.push(part);
        }
        return;
      }
      parts.push(part);
    });

  const body = parts.join(separator);
  if (hasDrive) {
    const drivePrefix = prefix.replace("/", separator);
    return body ? `${drivePrefix}${body}` : drivePrefix;
  }
  if (isAbsolute) return body ? `${separator}${body}` : separator;
  return body;
}

function joinLocalPath(baseDir, relativePath) {
  const preferWindows = usesWindowsPath(baseDir);
  const separator = preferWindows ? "\\" : "/";
  const joined = `${String(baseDir || "").replace(/[\\/]+$/, "")}${separator}${relativePath}`;
  return normalizeLocalPath(joined, preferWindows);
}

function shouldPreserveImageSrc(src) {
  const value = String(src || "").trim();
  if (!value || value.startsWith("#") || value.startsWith("//")) return true;
  if (isWindowsAbsolutePath(value)) return false;
  if (/^file:/i.test(value)) return false;
  if (isWindowsAbsolutePath(decodeImagePath(value))) return false;
  return /^[A-Za-z][A-Za-z\d+.-]*:/.test(value);
}

function resolveLocalImagePath(src, documentPath) {
  const { pathPart, suffix } = splitImageSrcSuffix(String(src || "").trim());
  if (!pathPart || shouldPreserveImageSrc(pathPart)) return null;

  if (/^file:/i.test(pathPart)) {
    const filePath = fileUrlToPath(pathPart);
    return filePath ? { path: filePath, suffix } : null;
  }

  const decodedPath = decodeImagePath(pathPart);
  if (isLocalAbsolutePath(decodedPath)) {
    return {
      path: normalizeLocalPath(decodedPath, usesWindowsPath(decodedPath)),
      suffix,
    };
  }

  const baseDir = getDirName(documentPath);
  if (!baseDir) return null;

  return {
    path: joinLocalPath(baseDir, decodedPath),
    suffix,
  };
}

async function rewriteMarkdownImageSources(documentPath) {
  if (!isTauriRuntime) return;

  const images = Array.from(contentEl().querySelectorAll("img[src]"));

  await Promise.all(images.map(async (img) => {
    const originalSrc = img.getAttribute("src");
    const resolved = resolveLocalImagePath(originalSrc, documentPath);
    if (!resolved) return;

    let imagePath = resolved.path;
    if (isLocalAbsolutePath(imagePath)) {
      imagePath = await invoke("resolve_image_path", {
        path: imagePath,
        documentPath,
        workspaceRoot: workspace?.root || null,
      }) || imagePath;
    }

    img.dataset.mdOriginalSrc = originalSrc;
    img.src = `${convertFileSrc(imagePath)}${resolved.suffix}`;
  }));
}

function getPortableMarkdownHTML() {
  const clone = contentEl().cloneNode(true);
  clone.querySelectorAll("img[data-md-original-src]").forEach((img) => {
    img.setAttribute("src", img.dataset.mdOriginalSrc);
    img.removeAttribute("data-md-original-src");
  });
  return clone.innerHTML;
}

async function renderMarkdown(raw, filePath = getActiveTab()?.path) {
  const html = md.render(raw);
  contentEl().innerHTML = html;
  await rewriteMarkdownImageSources(filePath);
  documentWorkspaceEl().hidden = false;
  emptyEl().style.display = "none";
  renderDocumentOutline();
}

function normalizeMarkdownContent(content) {
  return String(content ?? "").replace(/\r\n?/g, "\n");
}

function detectLineEnding(content) {
  const match = String(content ?? "").match(/\r\n|\r|\n/);
  return match?.[0] || "\n";
}

function applyLineEnding(content, lineEnding = "\n") {
  const normalized = normalizeMarkdownContent(content);
  if (lineEnding === "\n") return normalized;
  return normalized.replace(/\n/g, lineEnding);
}

function setTitle(filePath, { dirty = false } = {}) {
  if (!filePath) {
    document.title = "MD Viewer";
    return;
  }
  const name = getFileName(filePath);
  document.title = `${dirty ? "* " : ""}${name} — MD Viewer`;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFileName(path) {
  return path ? path.split(/[\\/]/).pop() : "";
}

function getBaseName(path) {
  if (!path) return "";
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function getPathParts(path) {
  return String(path || "").split(/[\\/]/).filter(Boolean);
}

function normalizePathSeparators(path) {
  return String(path || "").replace(/\\/g, "/");
}

function joinPath(base, relative) {
  if (!relative) return base;
  const separator = String(base || "").includes("\\") ? "\\" : "/";
  const normalizedBase = String(base || "").replace(/[\\/]+$/, "");
  const normalizedRelative = String(relative || "").replace(/^[\\/]+/, "").replace(/[\\/]/g, separator);
  return `${normalizedBase}${separator}${normalizedRelative}`;
}

function isPathInsideRoot(path, root) {
  const normalizedPath = normalizePathSeparators(path);
  const normalizedRoot = normalizePathSeparators(root).replace(/\/+$/, "");
  return Boolean(
    normalizedPath &&
      normalizedRoot &&
      (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)),
  );
}

function getPathRelativeToRoot(path, root) {
  const normalizedPath = normalizePathSeparators(path);
  const normalizedRoot = normalizePathSeparators(root).replace(/\/+$/, "");
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : getFileName(path);
}

function clampSize(value, min, max) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function isMarkdownPath(path) {
  return /\.(md|markdown|mdx|mkd)$/i.test(path);
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

function renderDocumentOutline() {
  const outline = document.getElementById("document-outline");
  if (!outline) return;

  outline.innerHTML = "";
  if (!activeTabId) {
    const item = document.createElement("li");
    item.className = "outline-empty";
    item.textContent = "Open a markdown file";
    outline.appendChild(item);
    return;
  }

  const headings = Array.from(contentEl().querySelectorAll("h1, h2, h3"));
  if (!headings.length) {
    const item = document.createElement("li");
    item.className = "outline-empty";
    item.textContent = "No headings";
    outline.appendChild(item);
    return;
  }

  headings.forEach((heading, index) => {
    const id = `md-heading-${activeTabId}-${index}`;
    heading.id = id;

    const item = document.createElement("li");
    item.className = `outline-level-${heading.tagName.slice(1).toLowerCase()}`;
    if (index === 0) item.classList.add("active");

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.outlineTarget = id;
    button.textContent = heading.textContent.trim() || `Heading ${index + 1}`;
    item.appendChild(button);
    outline.appendChild(item);
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

function renderFileTreeItem(file, parentList, depth, activePath) {
  const item = document.createElement("li");
  item.className = "tree-item file-item";
  item.style.setProperty("--tree-depth", depth);
  if (file.path === activePath) item.classList.add("active");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "file-row";
  button.dataset.workspaceFile = file.path;
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
  name.textContent = workspace.name || getBaseName(workspace.root) || "Workspace";
  button.appendChild(name);

  const count = document.createElement("span");
  count.className = "tree-count";
  count.textContent = String(workspace.files.length);
  button.appendChild(count);

  item.appendChild(button);
  parentList.appendChild(item);

  if (isCollapsed) return;

  if (!workspace.files.length) {
    renderEmptyTreeItem(parentList, "No Markdown files found", 1);
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
    .forEach((file) => renderFileTreeItem(file, fileList, 0, activePath));
}

function renderWorkspaceFiles() {
  const fileList = document.getElementById("workspace-file-list");
  if (!fileList) return;

  fileList.innerHTML = "";
  if (!workspace) {
    if (!looseFiles.length) {
      renderEmptyTreeItem(fileList, "Drop a folder or Markdown file");
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

  renderWorkspaceFiles();
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
  const shell = document.getElementById("app-shell");
  const sidePanel = document.getElementById("side-panel");
  shell?.style.setProperty("--side-panel-width", "350px");
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
        return (
          `<div class="${classes.join(" ")}" data-tab-id="${tab.id}">` +
          `<span class="tab-title">${escapeHTML(getFileName(tab.path))}</span>` +
          `<button class="tab-close">×</button>` +
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
  return error?.message || "Unknown error";
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

function getLineBounds(value, position) {
  const safePosition = Math.min(Math.max(position, 0), value.length);
  const lineStart = value.lastIndexOf("\n", safePosition - 1) + 1;
  const nextBreak = value.indexOf("\n", safePosition);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  return {
    lineStart,
    lineEnd,
    line: value.slice(lineStart, lineEnd),
  };
}

function getSelectedLineRange(value, selectionStart, selectionEnd) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const effectiveEnd =
    selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
      ? selectionEnd - 1
      : selectionEnd;
  const nextBreak = value.indexOf("\n", effectiveEnd);
  return {
    lineStart,
    lineEnd: nextBreak === -1 ? value.length : nextBreak,
  };
}

function mapPositionThroughLineChanges(position, rangeStart, originalLines, lineChanges) {
  const relativePosition = Math.max(0, position - rangeStart);
  let originalOffset = 0;
  let nextOffset = 0;

  for (let index = 0; index < originalLines.length; index += 1) {
    const originalLine = originalLines[index];
    const change = lineChanges[index];
    const originalLineEnd = originalOffset + originalLine.length;

    if (relativePosition <= originalLineEnd) {
      const positionInLine = relativePosition - originalOffset;
      let nextPositionInLine = positionInLine;

      if (change.delta !== 0) {
        if (positionInLine > change.changeAt) {
          nextPositionInLine = Math.max(change.changeAt, positionInLine + change.delta);
        } else if (positionInLine === change.changeAt && change.delta > 0) {
          nextPositionInLine += change.delta;
        }
      }

      return rangeStart + nextOffset + nextPositionInLine;
    }

    originalOffset = originalLineEnd + 1;
    nextOffset += change.text.length + 1;
  }

  return rangeStart + lineChanges.map((change) => change.text).join("\n").length;
}

function replaceSelectedLines(transformLine) {
  const editor = editorEl();
  if (!editor) return;

  const value = editor.value;
  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;
  const range = getSelectedLineRange(value, selectionStart, selectionEnd);
  const originalSegment = value.slice(range.lineStart, range.lineEnd);
  const originalLines = originalSegment.split("\n");
  const lineChanges = originalLines.map(transformLine);
  const nextSegment = lineChanges.map((change) => change.text).join("\n");
  const nextValue = value.slice(0, range.lineStart) + nextSegment + value.slice(range.lineEnd);
  const nextSelectionStart = mapPositionThroughLineChanges(
    selectionStart,
    range.lineStart,
    originalLines,
    lineChanges,
  );
  const nextSelectionEnd =
    selectionStart === selectionEnd
      ? nextSelectionStart
      : mapPositionThroughLineChanges(selectionEnd, range.lineStart, originalLines, lineChanges);

  applyEditorEdit(nextValue, nextSelectionStart, nextSelectionEnd);
}

function isInsideFencedCodeBlock(value, lineStart) {
  const lines = value.slice(0, lineStart).split("\n");
  let fence = null;

  for (const line of lines) {
    const match = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (!match) continue;

    const marker = match[1][0];
    if (!fence) {
      fence = marker;
    } else if (marker === fence) {
      fence = null;
    }
  }

  return Boolean(fence);
}

function getListContinuation(line) {
  const match = line.match(/^((?:[ \t]*>[ \t]?)*)([ \t]*)(?:(\d+)([.)])|([-+*]))([ \t]+)(?:\[([ xX])\][ \t]+)?/);
  if (!match) return null;

  const quotePrefix = match[1] || "";
  const indent = match[2] || "";
  const markerEnd = match[0].length;
  const content = line.slice(markerEnd);
  const isOrdered = match[3] !== undefined;
  const isTask = match[7] !== undefined;
  const nextPrefix = isOrdered
    ? `${quotePrefix}${indent}${Number(match[3]) + 1}${match[4]}${match[6]}`
    : `${quotePrefix}${indent}${match[5]}${match[6]}${isTask ? "[ ] " : ""}`;

  return {
    markerEnd,
    content,
    emptyPrefix: `${quotePrefix}${indent}`,
    nextPrefix,
  };
}

function handleMarkdownEnter(event) {
  const editor = event.currentTarget;
  if (editor.selectionStart !== editor.selectionEnd) return false;

  const value = editor.value;
  const position = editor.selectionStart;
  const { lineStart, lineEnd, line } = getLineBounds(value, position);
  const positionInLine = position - lineStart;
  const beforeCursor = line.slice(0, positionInLine);
  const afterCursor = line.slice(positionInLine);
  const restAfterCursor = value.slice(position);
  const fenceMatch = beforeCursor.match(/^([ \t]*)(`{3,}|~{3,})[^`~]*$/);

  if (fenceMatch && restAfterCursor.match(/^\n\n[ \t]*(`{3,}|~{3,})/)) {
    event.preventDefault();
    editor.setSelectionRange(position + 1, position + 1);
    return true;
  }

  if (fenceMatch && afterCursor.trim() === "") {
    const indent = fenceMatch[1] || "";
    const fence = fenceMatch[2];
    const closingFence = fence[0].repeat(fence.length);
    const insertion = `\n${indent}\n${indent}${closingFence}`;
    const nextPosition = position + 1 + indent.length;
    event.preventDefault();
    applyEditorEdit(value.slice(0, position) + insertion + value.slice(position), nextPosition);
    return true;
  }

  if (isInsideFencedCodeBlock(value, lineStart)) return false;

  const listContinuation = getListContinuation(line);
  if (listContinuation && positionInLine >= listContinuation.markerEnd) {
    event.preventDefault();

    if (listContinuation.content.trim() === "") {
      const nextLine = listContinuation.emptyPrefix;
      const nextValue = value.slice(0, lineStart) + nextLine + value.slice(lineEnd);
      applyEditorEdit(nextValue, lineStart + nextLine.length);
      return true;
    }

    const insertion = `\n${listContinuation.nextPrefix}`;
    const nextPosition = position + insertion.length;
    applyEditorEdit(value.slice(0, position) + insertion + value.slice(position), nextPosition);
    return true;
  }

  const quoteMatch = line.match(/^((?:[ \t]*>[ \t]?)+)(.*)$/);
  if (quoteMatch && positionInLine >= quoteMatch[1].length) {
    event.preventDefault();

    if (quoteMatch[2].trim() === "") {
      const nextValue = value.slice(0, lineStart) + value.slice(lineEnd);
      applyEditorEdit(nextValue, lineStart);
      return true;
    }

    const insertion = `\n${quoteMatch[1]}`;
    applyEditorEdit(value.slice(0, position) + insertion + value.slice(position), position + insertion.length);
    return true;
  }

  return false;
}

function handleMarkdownBackspace(event) {
  const editor = event.currentTarget;
  if (editor.selectionStart !== editor.selectionEnd) return false;

  const value = editor.value;
  const position = editor.selectionStart;
  const { lineStart, lineEnd, line } = getLineBounds(value, position);
  const positionInLine = position - lineStart;
  const listContinuation = getListContinuation(line);

  if (
    listContinuation &&
    listContinuation.content.trim() === "" &&
    positionInLine >= listContinuation.markerEnd
  ) {
    event.preventDefault();
    const exitsRootList = listContinuation.emptyPrefix === "" && lineStart > 0;
    const nextLine = exitsRootList ? "\n" : listContinuation.emptyPrefix;
    const suffixStart = exitsRootList && value[lineEnd] === "\n" ? lineEnd + 1 : lineEnd;
    const nextValue = value.slice(0, lineStart) + nextLine + value.slice(suffixStart);
    applyEditorEdit(nextValue, lineStart + nextLine.length);
    return true;
  }

  return false;
}

function getMarkdownBasePrefix(line) {
  return line.match(/^((?:[ \t]*>[ \t]?)*[ \t]*)/)?.[1] || "";
}

function getListMarkerMatch(line, type = "any") {
  const patterns = {
    ordered: /^((?:[ \t]*>[ \t]?)*[ \t]*)\d+[.)][ \t]+/,
    unordered: /^((?:[ \t]*>[ \t]?)*[ \t]*)[-+*][ \t]+(?!\[[ xX]\][ \t]+)/,
    task: /^((?:[ \t]*>[ \t]?)*[ \t]*)[-+*][ \t]+\[[ xX]\][ \t]+/,
    any: /^((?:[ \t]*>[ \t]?)*[ \t]*)(?:(?:\d+[.)]|[-+*])[ \t]+(?:\[[ xX]\][ \t]+)?)/,
  };
  return line.match(patterns[type]);
}

function getListMarker(type, number) {
  if (type === "ordered") return `${number}. `;
  if (type === "task") return "- [ ] ";
  return "- ";
}

function toggleMarkdownList(type) {
  const editor = editorEl();
  if (!editor) return;

  const value = editor.value;
  const range = getSelectedLineRange(value, editor.selectionStart, editor.selectionEnd);
  const lines = value.slice(range.lineStart, range.lineEnd).split("\n");
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");
  const shouldRemove = nonEmptyLines.length > 0 && nonEmptyLines.every((line) => getListMarkerMatch(line, type));
  let itemNumber = 1;

  replaceSelectedLines((line) => {
    if (line.trim() === "") {
      return { text: line, changeAt: 0, delta: 0 };
    }

    const existingMarker = getListMarkerMatch(line, shouldRemove ? type : "any");
    const basePrefix = existingMarker?.[1] ?? getMarkdownBasePrefix(line);
    const marker = shouldRemove ? "" : getListMarker(type, itemNumber);
    const contentStart = existingMarker ? existingMarker[0].length : basePrefix.length;
    const nextLine = `${basePrefix}${marker}${line.slice(contentStart)}`;
    itemNumber += 1;

    return {
      text: nextLine,
      changeAt: basePrefix.length,
      delta: nextLine.length - line.length,
    };
  });
}

function adjustMarkdownIndent(outdent = false) {
  replaceSelectedLines((line) => {
    if (!outdent) {
      return {
        text: `  ${line}`,
        changeAt: 0,
        delta: 2,
      };
    }

    if (line.startsWith("  ")) {
      return {
        text: line.slice(2),
        changeAt: 0,
        delta: -2,
      };
    }

    if (line.startsWith("\t") || line.startsWith(" ")) {
      return {
        text: line.slice(1),
        changeAt: 0,
        delta: -1,
      };
    }

    return { text: line, changeAt: 0, delta: 0 };
  });
}

function applyInlineMarkdown(open, close = open, placeholder = "text") {
  const editor = editorEl();
  if (!editor) return;

  const value = editor.value;
  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;
  const selectedText = value.slice(selectionStart, selectionEnd);

  if (selectedText.startsWith(open) && selectedText.endsWith(close) && selectedText.length >= open.length + close.length) {
    const innerText = selectedText.slice(open.length, selectedText.length - close.length);
    const nextValue = value.slice(0, selectionStart) + innerText + value.slice(selectionEnd);
    applyEditorEdit(nextValue, selectionStart, selectionStart + innerText.length);
    return;
  }

  const text = selectedText || placeholder;
  const replacement = `${open}${text}${close}`;
  const nextValue = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
  const nextSelectionStart = selectionStart + open.length;
  applyEditorEdit(nextValue, nextSelectionStart, nextSelectionStart + text.length);
}

function applyMarkdownLink() {
  const editor = editorEl();
  if (!editor) return;

  const value = editor.value;
  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;
  const selectedText = value.slice(selectionStart, selectionEnd);
  const existingLink = selectedText.match(/^\[([^\]]*)\]\(([^)]*)\)$/);

  if (existingLink) {
    const nextValue = value.slice(0, selectionStart) + existingLink[1] + value.slice(selectionEnd);
    applyEditorEdit(nextValue, selectionStart, selectionStart + existingLink[1].length);
    return;
  }

  const isSelectedUrl = /^https?:\/\//i.test(selectedText.trim());
  const label = isSelectedUrl ? "link" : selectedText || "text";
  const url = isSelectedUrl ? selectedText.trim() : "url";
  const replacement = `[${label}](${url})`;
  const nextValue = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
  const urlStart = selectionStart + label.length + 3;
  applyEditorEdit(nextValue, urlStart, urlStart + url.length);
}

function isAsciiWordCharacter(char) {
  return /[A-Za-z0-9_]/.test(char || "");
}

function shouldPairSingleUnderscore(value, selectionStart, selectionEnd) {
  if (selectionStart !== selectionEnd) return true;
  return !isAsciiWordCharacter(value[selectionStart - 1]) && !isAsciiWordCharacter(value[selectionEnd]);
}

function handleFenceCompletion(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.key !== "`" && event.key !== "~") return false;

  const editor = event.currentTarget;
  if (editor.selectionStart !== editor.selectionEnd) return false;

  const value = editor.value;
  const position = editor.selectionStart;
  const { line, lineStart } = getLineBounds(value, position);
  const positionInLine = position - lineStart;
  const beforeCursor = line.slice(0, positionInLine);
  const afterCursor = line.slice(positionInLine);
  const marker = event.key.repeat(2);
  const fence = event.key.repeat(3);
  const fencePrefix = beforeCursor.match(/^[ \t]*/)?.[0] || "";

  if (beforeCursor !== `${fencePrefix}${marker}` || afterCursor !== "") return false;

  event.preventDefault();
  const insertion = `${event.key}\n\n${fencePrefix}${fence}`;
  const nextValue = value.slice(0, position) + insertion + value.slice(position);
  applyEditorEdit(nextValue, position + 1);
  return true;
}

function handlePairCompletion(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (handleFenceCompletion(event)) return true;

  const editor = event.currentTarget;
  const markdownDelimiterKeys = new Set(["*", "_", "~"]);
  const pairs = {
    "(": ")",
    "[": "]",
    "{": "}",
  };
  const closers = new Set(Object.values(pairs));
  const value = editor.value;
  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;

  if (markdownDelimiterKeys.has(event.key)) {
    if (
      event.key === "*" &&
      selectionStart === selectionEnd &&
      value.slice(selectionStart - 2, selectionStart) === "**" &&
      value.slice(selectionStart, selectionStart + 2) === "**"
    ) {
      event.preventDefault();
      const nextValue =
        value.slice(0, selectionStart) +
        "*" +
        value.slice(selectionStart, selectionStart + 2) +
        "*" +
        value.slice(selectionStart + 2);
      applyEditorEdit(nextValue, selectionStart + 1);
      return true;
    }

    if (
      event.key === "*" &&
      selectionStart === selectionEnd &&
      value[selectionStart] === "*" &&
      value[selectionStart - 1] === "*" &&
      value[selectionStart - 2] === "*"
    ) {
      event.preventDefault();
      editor.setSelectionRange(selectionStart + 1, selectionStart + 1);
      return true;
    }

    if (
      event.key === "*" &&
      selectionStart === selectionEnd &&
      value[selectionStart - 1] === "*" &&
      value[selectionStart - 2] === "*" &&
      value[selectionStart] !== "*"
    ) {
      event.preventDefault();
      const selectedText = value.slice(selectionStart, selectionEnd);
      const closingDelimiter = event.key.repeat(3);
      const replacement = `${event.key}${selectedText}${closingDelimiter}`;
      const nextValue = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
      const nextSelectionStart = selectionStart + 1;
      applyEditorEdit(nextValue, nextSelectionStart, nextSelectionStart + selectedText.length);
      return true;
    }

    if (
      event.key === "*" &&
      selectionStart === selectionEnd &&
      value.slice(selectionStart, selectionStart + 3) === "***"
    ) {
      event.preventDefault();
      editor.setSelectionRange(selectionStart + 1, selectionStart + 1);
      return true;
    }

    if (
      event.key === "_" &&
      selectionStart === selectionEnd &&
      value[selectionStart - 1] === "_" &&
      value[selectionStart] === "_" &&
      value[selectionStart + 1] !== "_" &&
      !isAsciiWordCharacter(value[selectionStart - 2]) &&
      !isAsciiWordCharacter(value[selectionStart + 1])
    ) {
      event.preventDefault();
      const nextValue = value.slice(0, selectionStart) + "_" + value.slice(selectionStart) + "_";
      applyEditorEdit(nextValue, selectionStart + 1);
      return true;
    }

    if (
      selectionStart === selectionEnd &&
      value[selectionStart] === event.key &&
      (value[selectionStart - 1] !== event.key || value[selectionStart - 2] !== event.key)
    ) {
      event.preventDefault();
      editor.setSelectionRange(selectionStart + 1, selectionStart + 1);
      return true;
    }

    if (event.key === "_" && shouldPairSingleUnderscore(value, selectionStart, selectionEnd)) {
      event.preventDefault();
      const selectedText = value.slice(selectionStart, selectionEnd);
      const replacement = `_${selectedText}_`;
      const nextValue = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
      const nextSelectionStart = selectionStart + 1;
      applyEditorEdit(nextValue, nextSelectionStart, nextSelectionStart + selectedText.length);
      return true;
    }

    if (
      value[selectionStart - 1] === event.key &&
      value[selectionStart - 2] !== event.key &&
      value[selectionStart] !== event.key
    ) {
      event.preventDefault();
      const selectedText = value.slice(selectionStart, selectionEnd);
      const closingDelimiter = event.key.repeat(2);
      const replacement = `${event.key}${selectedText}${closingDelimiter}`;
      const nextValue = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
      const nextSelectionStart = selectionStart + 1;
      applyEditorEdit(nextValue, nextSelectionStart, nextSelectionStart + selectedText.length);
      return true;
    }
  }

  if (closers.has(event.key) && selectionStart === selectionEnd && value[selectionStart] === event.key) {
    event.preventDefault();
    editor.setSelectionRange(selectionStart + 1, selectionStart + 1);
    return true;
  }

  if (!pairs[event.key]) return false;

  event.preventDefault();
  const selectedText = value.slice(selectionStart, selectionEnd);
  const replacement = `${event.key}${selectedText}${pairs[event.key]}`;
  const nextValue = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
  const nextSelectionStart = selectionStart + event.key.length;
  const nextSelectionEnd = nextSelectionStart + selectedText.length;
  applyEditorEdit(nextValue, nextSelectionStart, nextSelectionEnd);
  return true;
}

function handleEditorShortcut(event) {
  const key = event.key.toLowerCase();
  const hasPrimaryModifier = event.metaKey || event.ctrlKey;

  if (!hasPrimaryModifier || event.altKey) return false;

  if (event.shiftKey && key === "7") {
    event.preventDefault();
    toggleMarkdownList("ordered");
    return true;
  }

  if (event.shiftKey && key === "8") {
    event.preventDefault();
    toggleMarkdownList("unordered");
    return true;
  }

  if (event.shiftKey && key === "x") {
    event.preventDefault();
    toggleMarkdownList("task");
    return true;
  }

  if (event.shiftKey) return false;

  if (key === "b") {
    event.preventDefault();
    applyInlineMarkdown("**", "**", "bold");
    return true;
  }

  if (key === "i") {
    event.preventDefault();
    applyInlineMarkdown("_", "_", "italic");
    return true;
  }

  if (key === "e") {
    event.preventDefault();
    applyInlineMarkdown("`", "`", "code");
    return true;
  }

  if (key === "k") {
    event.preventDefault();
    applyMarkdownLink();
    return true;
  }

  return false;
}

function handleEditorKeyDown(event) {
  if (event.isComposing) return;

  if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (handleMarkdownEnter(event)) return;
  }

  if (event.key === "Backspace" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (handleMarkdownBackspace(event)) return;
  }

  if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    adjustMarkdownIndent(event.shiftKey);
    return;
  }

  if (handleEditorShortcut(event)) return;
  handlePairCompletion(event);
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
    });
  }
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
    saveButton.disabled = !tab || !tab.dirty || tab.saving;
  }

  const status = editorStatusEl();
  if (status) {
    if (!tab) status.textContent = "";
    else if (tab.saving) status.textContent = "保存中...";
    else if (tab.externalContent !== null) status.textContent = "外部已修改";
    else if (tab.dirty) status.textContent = "未保存";
    else status.textContent = "已保存";
  }

  if (tab) {
    setTitle(tab.path, { dirty: tab.dirty });
  }
  document.body.classList.toggle("has-unsaved-documents", tabs.some((item) => item.dirty));
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
  tab.saving = true;
  renderTabBar();
  updateEditorControls();

  try {
    const contents = applyLineEnding(draftAtSave, tab.lineEnding || "\n");
    const result = await invoke("save_markdown_file", { path: tab.path, contents });
    const savedRawContent = result?.content ?? contents;
    const savedContent = normalizeMarkdownContent(savedRawContent);

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

    return true;
  } catch (error) {
    console.error("Failed to save Markdown:", error);
    window.alert(`保存失败：${getErrorMessage(error)}`);
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

  const shouldReload = window.confirm(
    `"${getFileName(tab.path)}" 已在外部修改。\n\n重新载入会丢弃当前未保存的编辑。要重新载入吗？`,
  );

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
  setTitle(tab.path, { dirty: tab.dirty });
  renderTabBar();
  updateExportButton();
  updateSidePanel();
  updateEditorControls();

  requestAnimationFrame(() => {
    setReaderScrollY(tab.scrollY || 0);
    setEditorScrollY(tab.editorScrollY || 0);
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

function resetAllTabs() {
  tabs = [];
  activeTabId = null;
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
    return Promise.resolve(window.confirm("文档有未保存的更改。关闭并放弃更改吗？") ? "discard" : "cancel");
  }

  fileName.textContent = getFileName(tab.path);
  message.textContent = "这个文档有未保存的更改。关闭前可以保存，也可以放弃这些更改。";
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

  const current = getActiveTab();
  if (current) {
    current.scrollY = getReaderScrollY();
    current.editorScrollY = getEditorScrollY();
  }

  const activeWasClosed = ids.has(activeTabId);
  tabs = tabs.filter((tab) => !ids.has(tab.id));

  if (!tabs.length) {
    resetAllTabs();
    return;
  }

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
  const ids = tabs.map((tab) => tab.id);
  if (!(await confirmTabsCanClose(ids))) return;
  resetAllTabs();
}

async function closeTabs(tabIds, fallbackIndex = 0, fallbackTabId = null) {
  if (!(await confirmTabsCanClose(tabIds))) return;
  closeTabsNow(tabIds, fallbackIndex, fallbackTabId);
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

function showWorkspaceContextMenu(path, x, y) {
  const menu = document.getElementById("workspace-context-menu");
  if (!menu) return;
  contextWorkspacePath = path;
  positionContextMenu(menu, x, y);
}

async function runWorkspaceContextAction(action) {
  if (!contextWorkspacePath) return;
  if (action === "reveal") {
    try {
      await invoke("reveal_in_finder", { path: contextWorkspacePath });
    } catch (e) {
      console.error("Failed to reveal in Finder:", e);
    }
  }
}

function initContextMenus() {
  const tabMenu = document.getElementById("tab-context-menu");
  const workspaceMenu = document.getElementById("workspace-context-menu");
  if (!tabMenu || !workspaceMenu) return;

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const tabEl = e.target.closest(".tab");
    if (tabEl && tabListEl().contains(tabEl)) {
      hideWorkspaceContextMenu();
      showTabContextMenu(tabEl.dataset.tabId, e.clientX, e.clientY);
      return;
    }

    const workspaceBrowser = document.getElementById("workspace-browser");
    const fileEl = e.target.closest("[data-workspace-file]");
    if (fileEl && workspaceBrowser?.contains(fileEl)) {
      hideTabContextMenu();
      showWorkspaceContextMenu(fileEl.dataset.workspaceFile, e.clientX, e.clientY);
      return;
    }

    const dirEl = e.target.closest("[data-workspace-dir]");
    if (dirEl && workspaceBrowser?.contains(dirEl) && workspace?.root) {
      hideTabContextMenu();
      showWorkspaceContextMenu(joinPath(workspace.root, dirEl.dataset.workspaceDir), e.clientX, e.clientY);
      return;
    }

    hideTabContextMenu();
    hideWorkspaceContextMenu();
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

  document.addEventListener("click", (e) => {
    if (!tabMenu.contains(e.target)) hideTabContextMenu();
    if (!workspaceMenu.contains(e.target)) hideWorkspaceContextMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideTabContextMenu();
      hideWorkspaceContextMenu();
    }
  });

  window.addEventListener("blur", () => {
    hideTabContextMenu();
    hideWorkspaceContextMenu();
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
  return String(body || "").trim() || "此版本包含修复和改进。";
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
  if (progressText) progressText.textContent = "准备下载";
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
          setUpdateProgress(0, contentLength ? "开始下载更新" : "正在下载更新");
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const percent = contentLength ? (downloaded / contentLength) * 100 : 0;
          setUpdateProgress(percent, contentLength ? `下载中 ${Math.round(percent)}%` : "正在下载更新");
        } else if (event.event === "Finished") {
          setUpdateProgress(100, "下载完成，正在安装");
        }
      });
      setUpdateProgress(100, "安装完成，正在重启");
      await relaunch();
    } catch (err) {
      console.error("Failed to install update:", err);
      if (error) {
        error.textContent = "更新失败，请稍后重试。";
        error.classList.remove("hidden");
      }
      setUpdateDialogBusy(false);
    }
  };
}

async function checkForAppUpdate() {
  if (!isTauriRuntime || isScreenshotDemo) return;

  try {
    const update = await check();
    if (update) {
      showUpdateDialog(update);
    }
  } catch (err) {
    console.warn("Failed to check for updates:", err);
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
  return getFileName(tab.path).replace(/\.[^.]+$/, "");
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
    theme.theme.name || theme.theme.name_en || theme.id;
  document.getElementById("typography-preview-enabled").checked =
    settings?.previewEnabled ?? true;
  document.getElementById("typography-export-enabled").checked =
    settings?.exportEnabled ?? true;

  const fieldsEl = document.getElementById("typography-fields");
  fieldsEl.innerHTML = TYPOGRAPHY_FIELDS.map((field) => `
    <div class="typography-field">
      <label for="typography-${field.key}">${field.label}</label>
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

function openTypographyDialog() {
  fillTypographyDialog();
  document.getElementById("settings-backdrop").classList.remove("hidden");
  document.querySelector("[data-typography-key]")?.focus();
}

function closeTypographyDialog(revertPreview = true) {
  document.getElementById("settings-backdrop").classList.add("hidden");
  if (revertPreview) applyTypographyOverrides();
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

function initTypographySettings() {
  const backdrop = document.getElementById("settings-backdrop");
  const dialog = document.getElementById("typography-dialog");
  const applyDraft = () => applyTypographyOverrides(currentThemeId(), readTypographyDialog());

  document.getElementById("typography-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openTypographyDialog();
  });
  document.getElementById("typography-close").addEventListener("click", () => closeTypographyDialog());
  document.getElementById("typography-cancel").addEventListener("click", () => closeTypographyDialog());
  document.getElementById("typography-save").addEventListener("click", saveTypographyDialog);
  document.getElementById("typography-reset").addEventListener("click", resetTypographyDialog);

  backdrop.addEventListener("click", (e) => {
    if (!dialog.contains(e.target)) closeTypographyDialog();
  });
  backdrop.addEventListener("input", (e) => {
    if (e.target.matches("[data-typography-key]")) applyDraft();
  });
  backdrop.addEventListener("change", (e) => {
    if (e.target.matches("#typography-preview-enabled, #typography-export-enabled")) {
      applyDraft();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !backdrop.classList.contains("hidden")) {
      closeTypographyDialog();
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
    defaultPath: baseName + ".html",
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!filePath) return;

  const themeCSS = getCurrentThemeCSS();
  const contentCSS = getContentCSS();
  const typographyCSS = getTypographyOverrideCSS();
  const bodyHTML = getPortableMarkdownHTML();
  const dataTheme = document.body.getAttribute("data-theme") || "default";

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
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
  const baseName = getActiveFileName();
  const filePath = await save({
    defaultPath: baseName + ".docx",
    filters: [{ name: "Word Document", extensions: ["docx"] }],
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
    group.label = categories[categoryId]?.name || categoryId;

    groupThemes.forEach((theme) => {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.name || theme.name_en || theme.id;
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

    outline.querySelectorAll(".active").forEach((item) => item.classList.remove("active"));
    targetButton.closest("li")?.classList.add("active");

    document.getElementById(targetButton.dataset.outlineTarget)?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  });
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

async function handleDroppedPath(path) {
  if (isMarkdownPath(path)) {
    await openWorkspaceFile(path);
    return;
  }

  await loadWorkspace(path);
}

async function chooseWorkspace() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "选择 Markdown 目录",
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

function initWorkspaceNavigation() {
  const workspaceBrowser = document.getElementById("workspace-browser");
  const openButton = document.getElementById("open-workspace-btn");
  const refreshButton = document.getElementById("refresh-workspace-btn");

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

function getSidebarWidthBounds() {
  const maxWidth = Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - READER_MIN_WIDTH),
  );

  return {
    min: SIDEBAR_MIN_WIDTH,
    max: maxWidth,
  };
}

function setSidebarWidth(width, { persist = true } = {}) {
  const shell = document.getElementById("app-shell");
  if (!shell) return;

  const bounds = getSidebarWidthBounds();
  const nextWidth = clampSize(width, bounds.min, bounds.max);
  shell.style.setProperty("--side-panel-width", `${Math.round(nextWidth)}px`);

  if (persist) {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(nextWidth)));
  }
}

function getOutlineHeightBounds() {
  const workspaceSection = document.getElementById("workspace-section");
  const outlineSection = document.getElementById("outline-section");
  if (!workspaceSection || !outlineSection) {
    return { min: OUTLINE_MIN_HEIGHT, max: OUTLINE_MIN_HEIGHT };
  }

  const workspaceHeight = workspaceSection.getBoundingClientRect().height;
  const outlineHeight = outlineSection.getBoundingClientRect().height;
  const adjustableHeight = workspaceHeight + outlineHeight;

  return {
    min: OUTLINE_MIN_HEIGHT,
    max: Math.max(OUTLINE_MIN_HEIGHT, adjustableHeight - WORKSPACE_MIN_HEIGHT),
  };
}

function setOutlineHeight(height, { persist = true } = {}) {
  const sidePanel = document.getElementById("side-panel");
  if (!sidePanel) return;

  const bounds = getOutlineHeightBounds();
  const nextHeight = clampSize(height, bounds.min, bounds.max);
  sidePanel.style.setProperty("--outline-panel-height", `${Math.round(nextHeight)}px`);

  if (persist) {
    localStorage.setItem(OUTLINE_HEIGHT_KEY, String(Math.round(nextHeight)));
  }
}

function startResize(className, onMove) {
  document.body.classList.add(className);

  const stopResize = () => {
    document.body.classList.remove(className);
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", stopResize);
    document.removeEventListener("pointercancel", stopResize);
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", stopResize);
  document.addEventListener("pointercancel", stopResize);
}

function initResizablePanels() {
  const sidebarResizer = document.getElementById("sidebar-resizer");
  const outlineResizer = document.getElementById("outline-resizer");

  const savedSidebarWidth = Number.parseFloat(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (Number.isFinite(savedSidebarWidth)) {
    setSidebarWidth(savedSidebarWidth, { persist: false });
  }

  requestAnimationFrame(() => {
    const savedOutlineHeight = Number.parseFloat(localStorage.getItem(OUTLINE_HEIGHT_KEY));
    if (Number.isFinite(savedOutlineHeight)) {
      setOutlineHeight(savedOutlineHeight, { persist: false });
    }
  });

  sidebarResizer?.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const sidePanel = document.getElementById("side-panel");
    const startX = e.clientX;
    const startWidth = sidePanel?.getBoundingClientRect().width || SIDEBAR_MIN_WIDTH;

    startResize("is-resizing-sidebar", (moveEvent) => {
      setSidebarWidth(startWidth + moveEvent.clientX - startX);
    });
  });

  sidebarResizer?.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();

    const sidePanel = document.getElementById("side-panel");
    const currentWidth = sidePanel?.getBoundingClientRect().width || SIDEBAR_MIN_WIDTH;
    setSidebarWidth(currentWidth + (e.key === "ArrowRight" ? RESIZE_KEYBOARD_STEP : -RESIZE_KEYBOARD_STEP));
  });

  sidebarResizer?.addEventListener("dblclick", () => {
    document.getElementById("app-shell")?.style.removeProperty("--side-panel-width");
    localStorage.removeItem(SIDEBAR_WIDTH_KEY);
  });

  outlineResizer?.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    const outlineSection = document.getElementById("outline-section");
    const startY = e.clientY;
    const startHeight = outlineSection?.getBoundingClientRect().height || OUTLINE_MIN_HEIGHT;

    startResize("is-resizing-outline", (moveEvent) => {
      setOutlineHeight(startHeight - (moveEvent.clientY - startY));
    });
  });

  outlineResizer?.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();

    const outlineSection = document.getElementById("outline-section");
    const currentHeight = outlineSection?.getBoundingClientRect().height || OUTLINE_MIN_HEIGHT;
    setOutlineHeight(currentHeight + (e.key === "ArrowUp" ? RESIZE_KEYBOARD_STEP : -RESIZE_KEYBOARD_STEP));
  });

  outlineResizer?.addEventListener("dblclick", () => {
    document.getElementById("side-panel")?.style.removeProperty("--outline-panel-height");
    localStorage.removeItem(OUTLINE_HEIGHT_KEY);
  });

  let resizeFrame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const sidePanel = document.getElementById("side-panel");
      const outlineSection = document.getElementById("outline-section");
      if (sidePanel) setSidebarWidth(sidePanel.getBoundingClientRect().width, { persist: false });
      if (outlineSection) setOutlineHeight(outlineSection.getBoundingClientRect().height, { persist: false });
    });
  });
}

function isBlockNode(node) {
  return node?.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName);
}

function removeCopyWhitespaceNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest("pre, code")) {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.nodeValue.trim() !== "") {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      const isBetweenBlocks = (!node.previousSibling || isBlockNode(node.previousSibling)) &&
        (!node.nextSibling || isBlockNode(node.nextSibling));

      return (parent === root || isBlockNode(parent)) && isBetweenBlocks
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  nodes.forEach((textNode) => textNode.remove());
}

function removeEmptyCopyBlocks(root) {
  root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote").forEach((el) => {
    if (el.closest("pre, code")) return;
    if (el.querySelector("img, table, hr, input, br")) return;

    const text = el.textContent.replace(/\u00a0/g, " ").trim();
    if (!text) {
      el.remove();
    }
  });
}

function resetCopiedBlockSpacing(root) {
  root.querySelectorAll("p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre").forEach((el) => {
    el.style.marginTop = "0";
    el.style.marginBottom = "0";
    el.style.paddingTop = "0";
    el.style.paddingBottom = "0";
  });
}

function normalizeCopiedPlainText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .filter((line) => line.trim() !== "")
    .join("\n")
    .trim();
}

function prepareCopyFragment(wrapper) {
  removeCopyWhitespaceNodes(wrapper);
  removeEmptyCopyBlocks(wrapper);
}

function compactCopyFragmentSpacing(wrapper) {
  resetCopiedBlockSpacing(wrapper);
  wrapper.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    el.style.marginTop = "6pt";
  });
}

function markFirstCopyBlock(wrapper) {
  const firstBlock = Array.from(wrapper.children).find((el) => {
    if (!isBlockNode(el)) return false;
    if (el.querySelector("img, table, hr, input")) return true;
    return el.textContent.replace(/\u00a0/g, " ").trim() !== "";
  });

  if (firstBlock) {
    firstBlock.classList.add("first-copy-block");
  }
}

function prepareAcademicCopyFragment(wrapper) {
  wrapper.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));

  wrapper.querySelectorAll("p").forEach((el) => {
    el.className = "MsoBodyText";
  });

  wrapper.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((el) => {
    el.className = `MsoHeading${el.tagName.slice(1)}`;
  });

  wrapper.querySelectorAll("ul, ol").forEach((el) => {
    el.className = "MsoList";
  });

  wrapper.querySelectorAll("li").forEach((el) => {
    el.className = "MsoListItem";
  });

  wrapper.querySelectorAll("li > p").forEach((el) => {
    el.className = "MsoListText";
  });

  wrapper.querySelectorAll("blockquote").forEach((el) => {
    el.className = "MsoQuote";
  });

  wrapper.querySelectorAll("pre").forEach((el) => {
    el.className = "MsoPre";
  });

  markFirstCopyBlock(wrapper);
}

function createWordHtml(bodyHtml) {
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<style>
html, body {
  margin: 0cm;
  padding: 0cm;
}
body {
  color: #000000;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
p.MsoBodyText {
  margin: 0cm;
  text-indent: 24.0pt;
  mso-char-indent-count: 2.0;
  line-height: 150%;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
h1, h2, h3, h4, h5, h6 {
  text-indent: 0cm;
  line-height: 150%;
  font-family: Arial, SimHei, sans-serif;
  font-weight: bold;
  page-break-after: avoid;
}
h1.MsoHeading1 {
  margin: 12.0pt 0cm 6.0pt 0cm;
  font-size: 22.0pt;
}
h2.MsoHeading2 {
  margin: 10.0pt 0cm 3.0pt 0cm;
  font-size: 16.0pt;
}
h3.MsoHeading3 {
  margin: 8.0pt 0cm 3.0pt 0cm;
  font-size: 14.0pt;
}
h4.MsoHeading4,
h5.MsoHeading5,
h6.MsoHeading6 {
  margin: 6.0pt 0cm 2.0pt 0cm;
  font-size: 12.0pt;
}
.first-copy-block {
  margin-top: 0cm !important;
}
ul.MsoList,
ol.MsoList {
  margin: 0cm 0cm 0cm 24.0pt;
  padding-left: 18.0pt;
}
li.MsoListItem {
  margin: 0cm;
  text-indent: 0cm;
  line-height: 150%;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
li.MsoListItem p.MsoListText {
  margin: 0cm;
  text-indent: 0cm;
  line-height: 150%;
}
blockquote.MsoQuote {
  margin: 0cm 0cm 0cm 24.0pt;
  padding: 0cm;
  line-height: 150%;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
blockquote.MsoQuote p {
  text-indent: 0cm;
}
table {
  border-collapse: collapse;
}
td, th {
  padding: 4.0pt 8.0pt;
  font-family: "Times New Roman", SimSun, serif;
  font-size: 12.0pt;
}
code, pre.MsoPre {
  font-family: Monaco, "Courier New", monospace;
  font-size: 10.0pt;
}
pre.MsoPre {
  margin: 0cm;
  padding: 0cm;
  line-height: 120%;
}
</style>
</head>
<body>
<!--StartFragment--><div class="WordSection1">${bodyHtml}</div><!--EndFragment-->
</body>
</html>`;
}

function initCopyHandler() {
  document.addEventListener("copy", (e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const theme = document.body.getAttribute("data-theme");
    const range = sel.getRangeAt(0);
    const content = contentEl();
    if (!content.contains(range.commonAncestorContainer)) return;

    const fragment = range.cloneContents();
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);
    prepareCopyFragment(wrapper);

    if (theme === "academic") {
      prepareAcademicCopyFragment(wrapper);
      e.clipboardData.setData("text/html", createWordHtml(wrapper.innerHTML));
    } else {
      compactCopyFragmentSpacing(wrapper);
      e.clipboardData.setData("text/html", wrapper.innerHTML);
    }

    e.clipboardData.setData("text/plain", normalizeCopiedPlainText(sel.toString()));
    e.preventDefault();
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initTypographySettings();
  initCopyHandler();
  initExportMenu();
  initUnsavedDialog();
  initEditingControls();
  initOutlineNavigation();
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

    if (e.target.closest("#view-mode-toggle, #save-md-btn, #theme-select, #typography-btn, #export-wrapper")) return;

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

    try {
      const initial = await invoke("get_initial_file");
      if (initial) {
        createTab(initial.path, initial.content);
      }
    } catch (_) {}

    setTimeout(checkForAppUpdate, UPDATE_CHECK_DELAY_MS);
  } else {
    document.body.dataset.screenshotReady = "true";
  }
});
