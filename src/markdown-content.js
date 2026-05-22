import markdownit from "markdown-it";
import hljs from "highlight.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentThemeDefinition } from "./theme-engine.js";
import { t } from "./i18n.js";
import { contentEl, documentWorkspaceEl, emptyEl } from "./dom.js";
import { escapeHTML, isLocalAbsolutePath, resolveLocalImagePath } from "./path-utils.js";

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
const defaultFenceRenderer = md.renderer.rules.fence;

let mermaidModulePromise = null;
let mermaidRenderCounter = 0;

md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const language = String(token.info || "").trim().split(/\s+/)[0].toLowerCase();

  if (language === "mermaid") {
    return `<div class="mermaid-diagram"><pre class="mermaid-source"><code>${escapeHTML(token.content)}</code></pre></div>`;
  }

  if (typeof defaultFenceRenderer === "function") {
    return defaultFenceRenderer(tokens, idx, options, env, self);
  }

  return `<pre><code>${escapeHTML(token.content)}</code></pre>`;
};

function getMermaidSource(diagram) {
  return diagram.querySelector(".mermaid-source code")?.textContent?.trim() || "";
}

function getMermaidConfig() {
  const themeDefinition = getCurrentThemeDefinition();
  const colors = themeDefinition.colorScheme;
  const contentStyle = window.getComputedStyle(contentEl());

  return {
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: themeDefinition.category === "dark" ? "dark" : "default",
    themeVariables: {
      fontFamily: contentStyle.fontFamily,
      background: colors.background.page,
      primaryColor: colors.background.surface || colors.background.page,
      primaryTextColor: colors.text.primary,
      primaryBorderColor: colors.table.border,
      lineColor: colors.table.border,
    },
  };
}

async function getMermaid() {
  mermaidModulePromise ||= import("mermaid").then((module) => module.default);
  return mermaidModulePromise;
}

function getErrorMessage(error) {
  if (typeof error === "string") return error;
  return error?.message || t("error.unknown");
}

function showMermaidError(diagram, source, error) {
  const message = document.createElement("div");
  message.className = "mermaid-error";
  message.textContent = t("mermaid.renderFailed", { message: getErrorMessage(error) });

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = source;
  pre.appendChild(code);

  diagram.replaceChildren(message, pre);
}

async function renderMermaidDiagrams() {
  const diagrams = Array.from(contentEl().querySelectorAll(".mermaid-diagram"));
  if (!diagrams.length) return;

  let mermaid;
  try {
    mermaid = await getMermaid();
    mermaid.initialize(getMermaidConfig());
  } catch (error) {
    diagrams.forEach((diagram) => {
      const source = getMermaidSource(diagram);
      diagram.classList.add("is-error");
      showMermaidError(diagram, source, error);
    });
    return;
  }

  await Promise.all(diagrams.map(async (diagram) => {
    const source = getMermaidSource(diagram);
    if (!source) return;

    const renderId = `mdv-mermaid-${++mermaidRenderCounter}`;
    diagram.classList.add("is-rendering");
    diagram.classList.remove("is-error", "is-rendered");

    try {
      const { svg, bindFunctions } = await mermaid.render(renderId, source);
      if (!diagram.isConnected) return;
      diagram.innerHTML = svg;
      diagram.classList.add("is-rendered");
      bindFunctions?.(diagram);
    } catch (error) {
      if (!diagram.isConnected) return;
      diagram.classList.add("is-error");
      showMermaidError(diagram, source, error);
    } finally {
      diagram.classList.remove("is-rendering");
    }
  }));
}

async function rewriteMarkdownImageSources(documentPath, { invoke, isTauriRuntime, workspaceRoot } = {}) {
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
        workspaceRoot: workspaceRoot || null,
      }) || imagePath;
    }

    img.dataset.mdOriginalSrc = originalSrc;
    img.dataset.mdResolvedPath = imagePath;
    img.src = `${convertFileSrc(imagePath)}${resolved.suffix}`;
  }));
}

export async function renderMarkdown(raw, {
  filePath,
  invoke,
  isTauriRuntime = false,
  workspaceRoot = null,
  afterRender,
} = {}) {
  const html = md.render(raw);
  contentEl().innerHTML = html;
  await rewriteMarkdownImageSources(filePath, { invoke, isTauriRuntime, workspaceRoot });
  await renderMermaidDiagrams();
  documentWorkspaceEl().hidden = false;
  emptyEl().style.display = "none";
  afterRender?.();
}

export function getPortableMarkdownHTML() {
  const clone = contentEl().cloneNode(true);
  clone.querySelectorAll("img[data-md-original-src]").forEach((img) => {
    img.setAttribute("src", img.dataset.mdOriginalSrc);
    img.removeAttribute("data-md-original-src");
    img.removeAttribute("data-md-resolved-path");
  });
  return clone.innerHTML;
}

export function getMarkdownHeadingSourceLines(raw) {
  return md.parse(raw || "", {})
    .filter((token) => token.type === "heading_open")
    .map((token) => token.map?.[0] ?? null);
}
