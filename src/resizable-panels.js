import { clampSize } from "./path-utils.js";

const SIDEBAR_WIDTH_KEY = "md-viewer-sidebar-width-v2";
const OUTLINE_HEIGHT_KEY = "md-viewer-outline-height";
const DEFAULT_SIDEBAR_WIDTH = 288;
const SIDEBAR_MIN_WIDTH = 248;
const SIDEBAR_MAX_WIDTH = 560;
const READER_MIN_WIDTH = 420;
const WORKSPACE_MIN_HEIGHT = 132;
const OUTLINE_MIN_HEIGHT = 96;
const RESIZE_KEYBOARD_STEP = 18;

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

export function applyDefaultSidebarWidth() {
  const shell = document.getElementById("app-shell");
  shell?.style.setProperty("--side-panel-width", `${DEFAULT_SIDEBAR_WIDTH}px`);
}

export function initResizablePanels() {
  const sidebarResizer = document.getElementById("sidebar-resizer");
  const outlineResizer = document.getElementById("outline-resizer");

  const savedSidebarWidth = Number.parseFloat(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (Number.isFinite(savedSidebarWidth)) {
    setSidebarWidth(savedSidebarWidth, { persist: false });
  } else {
    setSidebarWidth(DEFAULT_SIDEBAR_WIDTH, { persist: false });
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
