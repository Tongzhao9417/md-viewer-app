import { t } from "./i18n.js";

function getImageMimeType(pathOrUrl) {
  const cleanValue = String(pathOrUrl || "").split(/[?#]/)[0].toLowerCase();
  if (cleanValue.endsWith(".png")) return "image/png";
  if (cleanValue.endsWith(".jpg") || cleanValue.endsWith(".jpeg")) return "image/jpeg";
  if (cleanValue.endsWith(".gif")) return "image/gif";
  if (cleanValue.endsWith(".webp")) return "image/webp";
  if (cleanValue.endsWith(".svg")) return "image/svg+xml";
  if (cleanValue.endsWith(".bmp")) return "image/bmp";
  if (cleanValue.endsWith(".ico")) return "image/x-icon";
  if (cleanValue.endsWith(".avif")) return "image/avif";
  if (cleanValue.endsWith(".tif") || cleanValue.endsWith(".tiff")) return "image/tiff";
  return "";
}

async function readLocalImageBlob(image, { invoke, isTauriRuntime } = {}) {
  const path = image?.dataset?.mdResolvedPath;
  if (!isTauriRuntime || !path) return null;

  try {
    const bytes = await invoke("read_image_file", { path });
    return new Blob([new Uint8Array(bytes)], { type: getImageMimeType(path) });
  } catch (_) {
    return null;
  }
}

function loadImageElementFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(t("image.loadFailed")));
    };
    image.src = url;
  });
}

async function getDrawableImageFromBlob(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob);
    } catch (_) {
      // Some image formats, such as SVG, need to be loaded through an Image element.
    }
  }

  return loadImageElementFromBlob(blob);
}

async function getDrawableImageSource(image, runtimeOptions) {
  const localBlob = await readLocalImageBlob(image, runtimeOptions);
  if (localBlob) {
    return getDrawableImageFromBlob(localBlob);
  }

  const imageUrl = image.currentSrc || image.src;

  if (imageUrl) {
    try {
      const response = await fetch(imageUrl);
      if (response.ok) {
        const blob = await response.blob();
        return getDrawableImageFromBlob(blob);
      }
    } catch (_) {
      // Fall back to drawing the already-rendered image element.
    }
  }

  if (!image.complete) {
    await image.decode();
  }

  return image;
}

function imageToPngBlob(image, runtimeOptions) {
  return new Promise((resolve, reject) => {
    (async () => {
      const source = await getDrawableImageSource(image, runtimeOptions);
      const width = source.naturalWidth || source.width || image.naturalWidth;
      const height = source.naturalHeight || source.height || image.naturalHeight;

      if (!width || !height) {
        throw new Error(t("image.noPixels"));
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(t("image.cannotProcess"));

      try {
        ctx.drawImage(source, 0, 0, width, height);
      } finally {
        if (typeof source.close === "function") source.close();
      }

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(t("image.encodeFailed")));
      }, "image/png");
    })().catch(reject);
  });
}

export async function copyImageToClipboard(image, runtimeOptions = {}) {
  if (!image) return;
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error(t("image.unsupportedClipboard"));
  }

  const pngBlob = imageToPngBlob(image, runtimeOptions);
  let clipboardItem;
  try {
    clipboardItem = new ClipboardItem({ "image/png": pngBlob });
  } catch (_) {
    clipboardItem = new ClipboardItem({ "image/png": await pngBlob });
  }

  await navigator.clipboard.write([clipboardItem]);
}
