const STORAGE_KEY = "md-viewer-locale";
const DEFAULT_LOCALE = "zh-CN";

const LOCALES = [
  { id: "zh-CN", label: "中文" },
  { id: "en-US", label: "English" },
];

const messages = {
  "zh-CN": {
    "app.name": "MD Viewer",
    "panel.aria": "文档信息",
    "panel.title": "资源管理器",
    "workspace.aria": "Markdown 文件",
    "workspace.title": "文件",
    "workspace.newMarkdown": "新建 Markdown",
    "workspace.open": "打开目录",
    "workspace.refresh": "刷新目录",
    "workspace.untitled": "未命名",
    "workspace.untitledNumbered": "未命名 {number}",
    "workspace.drop": "拖入目录或 Markdown 文件",
    "workspace.singleFiles": "单独文件",
    "workspace.defaultName": "工作区",
    "workspace.noMarkdown": "未找到 Markdown 文件",
    "outline.resize": "调整文件目录和文档目录大小",
    "outline.aria": "文档目录",
    "outline.title": "文档目录",
    "outline.openFile": "打开一个 Markdown 文件",
    "outline.noHeadings": "没有标题",
    "outline.heading": "标题 {number}",
    "sidebar.resize": "调整侧边栏宽度",
    "viewMode.aria": "视图模式",
    "viewMode.preview": "预览",
    "viewMode.edit": "编辑",
    "viewMode.split": "分屏",
    "editor.save": "保存",
    "editor.saveTitle": "保存 Markdown (⌘S)",
    "editor.aria": "Markdown 编辑器",
    "editor.status.saving": "保存中...",
    "editor.status.externalModified": "外部已修改",
    "editor.status.draft": "未保存到文件",
    "editor.status.unsaved": "未保存",
    "editor.status.saved": "已保存",
    "theme.aria": "主题",
    "typography.title": "主题字号",
    "typography.preview": "预览",
    "typography.export": "DOCX",
    "typography.reset": "恢复默认",
    "typography.cancel": "取消",
    "typography.save": "保存",
    "typography.field.body": "正文",
    "typography.field.h1": "H1",
    "typography.field.h2": "H2",
    "typography.field.h3": "H3",
    "typography.field.h4": "H4",
    "typography.field.h5": "H5",
    "typography.field.h6": "H6",
    "typography.field.code": "代码",
    "settings.button": "设置",
    "settings.title": "设置",
    "settings.languageTitle": "语言",
    "settings.languageDescription": "切换界面语言，选择会立即保存。",
    "settings.typographyTitle": "主题字号",
    "settings.typographyDescription": "调整当前主题在预览和 DOCX 导出中的字号。",
    "settings.openTypography": "打开字号设置",
    "settings.updatesTitle": "更新",
    "settings.updatesDescription": "手动检查是否有可用的新版本。",
    "language.aria": "语言",
    "export.button": "导出 ▾",
    "export.html": "导出 HTML",
    "export.docx": "导出 DOCX",
    "export.print": "打印 / PDF",
    "empty.primary": "拖拽 Markdown 文件或目录到窗口打开",
    "empty.hint": "拖入目录后，可以从左侧列表选择文档阅读",
    "backToTop": "返回顶端",
    "common.close": "关闭",
    "context.tabMenu": "标签页菜单",
    "context.closeCurrent": "关闭当前标签页",
    "context.closeLeft": "关闭左侧标签页",
    "context.closeRight": "关闭右侧标签页",
    "context.closeAll": "关闭全部标签页",
    "context.fileMenu": "文件菜单",
    "context.reveal.default": "在文件管理器中显示",
    "context.reveal.mac": "在 Finder 中显示",
    "context.reveal.win": "在资源管理器中显示",
    "context.closeFolder": "关闭文件夹",
    "context.closeFile": "关闭文件",
    "context.imageMenu": "图片菜单",
    "context.copyImage": "复制图片",
    "update.title": "发现新版本",
    "update.ready": "准备下载",
    "update.defaultNotes": "此版本包含修复和改进。",
    "update.downloadStart": "开始下载更新",
    "update.downloading": "正在下载更新",
    "update.downloadingPercent": "下载中 {percent}%",
    "update.installing": "下载完成，正在安装",
    "update.relaunching": "安装完成，正在重启",
    "update.failed": "更新失败，请稍后重试。",
    "update.check": "检查更新",
    "update.checking": "正在检查更新...",
    "update.none": "当前已是最新版本。",
    "update.unavailable": "当前环境无法检查更新。",
    "update.checkFailed": "检查更新失败：{message}",
    "update.later": "稍后再说",
    "update.install": "立即更新",
    "unsaved.title": "保存更改",
    "unsaved.message": "这个文档有未保存的更改。",
    "unsaved.closeMessage": "这个文档有未保存的更改。关闭前可以保存，也可以放弃这些更改。",
    "unsaved.confirmDiscard": "文档有未保存的更改。关闭并放弃更改吗？",
    "unsaved.discard": "放弃更改",
    "unsaved.cancel": "取消",
    "unsaved.save": "保存",
    "confirm.externalModified": "\"{name}\" 已在外部修改。\n\n重新载入会丢弃当前未保存的编辑。要重新载入吗？",
    "alert.saveFailed": "保存失败：{message}",
    "alert.savePathAlreadyOpen": "\"{name}\" 已经打开，请先关闭对应标签页或选择其他保存位置。",
    "alert.copyImageFailed": "复制图片失败：{message}",
    "alert.openWorkspaceInNewWindowFailed": "无法在新窗口打开目录：{message}",
    "dialog.saveMarkdown": "保存 Markdown 文件",
    "dialog.chooseWorkspace": "选择 Markdown 目录",
    "filter.markdown": "Markdown 文件",
    "filter.wordDocument": "Word 文档",
    "mermaid.renderFailed": "Mermaid 图表渲染失败：{message}",
    "image.loadFailed": "图片无法加载，不能复制。",
    "image.noPixels": "图片没有可读取的像素数据。",
    "image.cannotProcess": "当前环境无法处理图片。",
    "image.encodeFailed": "图片无法编码为剪贴板格式。",
    "image.unsupportedClipboard": "当前环境不支持复制图片数据。",
    "error.tauriUnavailable": "当前环境不可使用 Tauri 运行时。",
    "error.unknown": "未知错误",
  },
  "en-US": {
    "app.name": "MD Viewer",
    "panel.aria": "Document information",
    "panel.title": "Explorer",
    "workspace.aria": "Markdown files",
    "workspace.title": "Files",
    "workspace.newMarkdown": "New Markdown",
    "workspace.open": "Open folder",
    "workspace.refresh": "Refresh folder",
    "workspace.untitled": "Untitled",
    "workspace.untitledNumbered": "Untitled {number}",
    "workspace.drop": "Drop a folder or Markdown file",
    "workspace.singleFiles": "Single Files",
    "workspace.defaultName": "Workspace",
    "workspace.noMarkdown": "No Markdown files found",
    "outline.resize": "Resize file browser and document outline",
    "outline.aria": "Document outline",
    "outline.title": "Document Outline",
    "outline.openFile": "Open a Markdown file",
    "outline.noHeadings": "No headings",
    "outline.heading": "Heading {number}",
    "sidebar.resize": "Resize sidebar",
    "viewMode.aria": "View mode",
    "viewMode.preview": "Preview",
    "viewMode.edit": "Edit",
    "viewMode.split": "Split",
    "editor.save": "Save",
    "editor.saveTitle": "Save Markdown (⌘S)",
    "editor.aria": "Markdown editor",
    "editor.status.saving": "Saving...",
    "editor.status.externalModified": "Changed externally",
    "editor.status.draft": "Not saved to a file",
    "editor.status.unsaved": "Unsaved",
    "editor.status.saved": "Saved",
    "theme.aria": "Theme",
    "typography.title": "Theme Typography",
    "typography.preview": "Preview",
    "typography.export": "DOCX",
    "typography.reset": "Reset",
    "typography.cancel": "Cancel",
    "typography.save": "Save",
    "typography.field.body": "Body",
    "typography.field.h1": "H1",
    "typography.field.h2": "H2",
    "typography.field.h3": "H3",
    "typography.field.h4": "H4",
    "typography.field.h5": "H5",
    "typography.field.h6": "H6",
    "typography.field.code": "Code",
    "settings.button": "Settings",
    "settings.title": "Settings",
    "settings.languageTitle": "Language",
    "settings.languageDescription": "Change the interface language. The choice is saved immediately.",
    "settings.typographyTitle": "Theme Typography",
    "settings.typographyDescription": "Adjust the current theme's font sizes for preview and DOCX export.",
    "settings.openTypography": "Open Typography Settings",
    "settings.updatesTitle": "Updates",
    "settings.updatesDescription": "Manually check whether a new version is available.",
    "language.aria": "Language",
    "export.button": "Export ▾",
    "export.html": "Export HTML",
    "export.docx": "Export DOCX",
    "export.print": "Print / PDF",
    "empty.primary": "Drop a Markdown file or folder to open it",
    "empty.hint": "After dropping a folder, choose documents from the list on the left",
    "backToTop": "Back to top",
    "common.close": "Close",
    "context.tabMenu": "Tab menu",
    "context.closeCurrent": "Close current tab",
    "context.closeLeft": "Close tabs to the left",
    "context.closeRight": "Close tabs to the right",
    "context.closeAll": "Close all tabs",
    "context.fileMenu": "File menu",
    "context.reveal.default": "Show in file manager",
    "context.reveal.mac": "Show in Finder",
    "context.reveal.win": "Show in File Explorer",
    "context.closeFolder": "Close folder",
    "context.closeFile": "Close file",
    "context.imageMenu": "Image menu",
    "context.copyImage": "Copy image",
    "update.title": "Update Available",
    "update.ready": "Ready to download",
    "update.defaultNotes": "This version includes fixes and improvements.",
    "update.downloadStart": "Starting update download",
    "update.downloading": "Downloading update",
    "update.downloadingPercent": "Downloading {percent}%",
    "update.installing": "Download complete, installing",
    "update.relaunching": "Install complete, restarting",
    "update.failed": "Update failed. Try again later.",
    "update.check": "Check for Updates",
    "update.checking": "Checking for updates...",
    "update.none": "You are on the latest version.",
    "update.unavailable": "Updates cannot be checked in this environment.",
    "update.checkFailed": "Update check failed: {message}",
    "update.later": "Later",
    "update.install": "Install Now",
    "unsaved.title": "Save Changes",
    "unsaved.message": "This document has unsaved changes.",
    "unsaved.closeMessage": "This document has unsaved changes. Save before closing, or discard the changes.",
    "unsaved.confirmDiscard": "This document has unsaved changes. Close and discard them?",
    "unsaved.discard": "Discard Changes",
    "unsaved.cancel": "Cancel",
    "unsaved.save": "Save",
    "confirm.externalModified": "\"{name}\" was changed outside the app.\n\nReloading will discard your unsaved edits. Reload now?",
    "alert.saveFailed": "Save failed: {message}",
    "alert.savePathAlreadyOpen": "\"{name}\" is already open. Close that tab first or choose a different save location.",
    "alert.copyImageFailed": "Failed to copy image: {message}",
    "alert.openWorkspaceInNewWindowFailed": "Could not open folder in a new window: {message}",
    "dialog.saveMarkdown": "Save Markdown File",
    "dialog.chooseWorkspace": "Choose Markdown Folder",
    "filter.markdown": "Markdown Files",
    "filter.wordDocument": "Word Document",
    "mermaid.renderFailed": "Mermaid diagram failed to render: {message}",
    "image.loadFailed": "The image could not be loaded for copying.",
    "image.noPixels": "The image has no readable pixel data.",
    "image.cannotProcess": "This environment cannot process the image.",
    "image.encodeFailed": "The image could not be encoded for the clipboard.",
    "image.unsupportedClipboard": "This environment does not support copying image data.",
    "error.tauriUnavailable": "The Tauri runtime is unavailable.",
    "error.unknown": "Unknown error",
  },
};

function canUseStorage() {
  return typeof localStorage !== "undefined";
}

function getBrowserLocale() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.map(normalizeLocale).find(Boolean) || DEFAULT_LOCALE;
}

export function normalizeLocale(locale) {
  const value = String(locale || "").toLowerCase();
  if (value === "zh-cn" || value.startsWith("zh")) return "zh-CN";
  if (value === "en-us" || value.startsWith("en")) return "en-US";
  return null;
}

function readStoredLocale() {
  if (!canUseStorage()) return null;
  return normalizeLocale(localStorage.getItem(STORAGE_KEY));
}

let currentLocale = readStoredLocale() || getBrowserLocale();

function formatMessage(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  ));
}

export function getAvailableLocales() {
  return [...LOCALES];
}

export function getLocale() {
  return currentLocale;
}

export function getHtmlLang() {
  return currentLocale;
}

export function isEnglishLocale(locale = currentLocale) {
  return normalizeLocale(locale) === "en-US";
}

export function setLocale(locale) {
  currentLocale = normalizeLocale(locale) || DEFAULT_LOCALE;
  if (canUseStorage()) {
    localStorage.setItem(STORAGE_KEY, currentLocale);
  }
  document.documentElement.lang = currentLocale;
  return currentLocale;
}

export function t(key, params = {}) {
  const template = messages[currentLocale]?.[key] ?? messages[DEFAULT_LOCALE]?.[key] ?? key;
  return formatMessage(template, params);
}

export function pickLocalized(record, baseKey = "name") {
  if (!record) return "";
  const localizedKey = isEnglishLocale() ? `${baseKey}_en` : baseKey;
  const fallbackKey = isEnglishLocale() ? baseKey : `${baseKey}_en`;
  return record[localizedKey] || record[fallbackKey] || "";
}

export function applyTranslations(root = document) {
  document.documentElement.lang = currentLocale;
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.title = t(element.dataset.i18nTitle);
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
}
