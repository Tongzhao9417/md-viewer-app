export function getDirName(path) {
  const value = String(path || "").replace(/[\\/]+$/, "");
  const index = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  if (index < 0) return "";
  if (index === 0) return value.slice(0, 1);
  if (index === 2 && /^[A-Za-z]:/.test(value)) return value.slice(0, 3);
  return value.slice(0, index);
}

export function isWindowsAbsolutePath(path) {
  return /^[A-Za-z]:(?:[\\/]|%5[cC]|%2[fF])/.test(String(path || ""));
}

export function isLocalAbsolutePath(path) {
  const value = String(path || "");
  return value.startsWith("/") || value.startsWith("\\\\") || isWindowsAbsolutePath(value);
}

export function usesWindowsPath(path) {
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

export function normalizeLocalPath(path, preferWindows = false) {
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

export function joinLocalPath(baseDir, relativePath) {
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

export function resolveLocalImagePath(src, documentPath) {
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

export function normalizeMarkdownContent(content) {
  return String(content ?? "").replace(/\r\n?/g, "\n");
}

export function detectLineEnding(content) {
  const match = String(content ?? "").match(/\r\n|\r|\n/);
  return match?.[0] || "\n";
}

export function applyLineEnding(content, lineEnding = "\n") {
  const normalized = normalizeMarkdownContent(content);
  if (lineEnding === "\n") return normalized;
  return normalized.replace(/\n/g, lineEnding);
}

export function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function getFileName(path) {
  return path ? path.split(/[\\/]/).pop() : "";
}

export function getBaseName(path) {
  if (!path) return "";
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function getPathParts(path) {
  return String(path || "").split(/[\\/]/).filter(Boolean);
}

export function normalizePathSeparators(path) {
  return String(path || "").replace(/\\/g, "/");
}

function normalizeComparablePath(path) {
  return normalizePathSeparators(path).replace(/\/+$/, "");
}

export function isSameLocalPath(a, b) {
  return normalizeComparablePath(a) === normalizeComparablePath(b);
}

export function joinPath(base, relative) {
  if (!relative) return base;
  const separator = String(base || "").includes("\\") ? "\\" : "/";
  const normalizedBase = String(base || "").replace(/[\\/]+$/, "");
  const normalizedRelative = String(relative || "").replace(/^[\\/]+/, "").replace(/[\\/]/g, separator);
  return `${normalizedBase}${separator}${normalizedRelative}`;
}

export function isPathInsideRoot(path, root) {
  const normalizedPath = normalizePathSeparators(path);
  const normalizedRoot = normalizePathSeparators(root).replace(/\/+$/, "");
  return Boolean(
    normalizedPath &&
      normalizedRoot &&
      (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)),
  );
}

export function getPathRelativeToRoot(path, root) {
  const normalizedPath = normalizePathSeparators(path);
  const normalizedRoot = normalizePathSeparators(root).replace(/\/+$/, "");
  return normalizedPath.startsWith(`${normalizedRoot}/`)
    ? normalizedPath.slice(normalizedRoot.length + 1)
    : getFileName(path);
}

export function clampSize(value, min, max) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

export function isMarkdownPath(path) {
  return /\.(md|markdown|mdx|mkd)$/i.test(path);
}
