export const TYPOGRAPHY_FIELDS = [
  { key: "body", label: "正文" },
  { key: "h1", label: "H1" },
  { key: "h2", label: "H2" },
  { key: "h3", label: "H3" },
  { key: "h4", label: "H4" },
  { key: "h5", label: "H5" },
  { key: "h6", label: "H6" },
  { key: "code", label: "代码" },
];

const STORAGE_KEY = "md-viewer-theme-typography-v1";
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 72;

function canUseStorage() {
  return typeof localStorage !== "undefined";
}

function readAllSettings() {
  if (!canUseStorage()) return {};

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (_) {
    return {};
  }
}

function writeAllSettings(settings) {
  if (!canUseStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function coerceTypographyValue(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < MIN_FONT_SIZE || parsed > MAX_FONT_SIZE) return null;
  return Math.round(parsed * 10) / 10;
}

function normalizeSettings(settings = {}) {
  const values = {};

  for (const field of TYPOGRAPHY_FIELDS) {
    const value = coerceTypographyValue(settings.values?.[field.key]);
    if (value !== null) values[field.key] = value;
  }

  return {
    previewEnabled: settings.previewEnabled !== false,
    exportEnabled: settings.exportEnabled !== false,
    values,
  };
}

export function getThemeTypographySettings(themeId) {
  const allSettings = readAllSettings();
  const settings = allSettings[themeId];
  return settings ? normalizeSettings(settings) : null;
}

export function saveThemeTypographySettings(themeId, settings) {
  const allSettings = readAllSettings();
  allSettings[themeId] = normalizeSettings(settings);
  writeAllSettings(allSettings);
}

export function clearThemeTypographySettings(themeId) {
  const allSettings = readAllSettings();
  delete allSettings[themeId];
  writeAllSettings(allSettings);
}

export function getTypographyValuesForScope(themeId, scope) {
  const settings = getThemeTypographySettings(themeId);
  if (!settings) return {};
  if (scope === "preview" && !settings.previewEnabled) return {};
  if (scope === "export" && !settings.exportEnabled) return {};
  return settings.values;
}
