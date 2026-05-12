const themeData = import.meta.glob("./theme-data/**/*.json", {
  eager: true,
  import: "default",
});

const getJson = (path) => {
  const data = themeData[path];
  if (!data) {
    throw new Error(`Missing theme data: ${path}`);
  }
  return data;
};

const registry = getJson("./theme-data/registry.json");
const fontConfig = getJson("./theme-data/font-config.json");

const LEGACY_THEME_MAP = {
  github: "default",
  academic: "academic",
  newsprint: "newspaper",
  minimal: "minimal",
  dark: "midnight",
};

const orderedThemeEntries = [...registry.themes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const themeIds = new Set(orderedThemeEntries.map((theme) => theme.id));

function ptToPx(ptSize) {
  const pt = parseFloat(ptSize);
  return `${(pt * 4) / 3}px`;
}

function buildFontFamily(fontName) {
  return fontConfig.fonts[fontName]?.webFallback || fontName;
}

function cssColor(value, fallback) {
  return value || fallback;
}

function convertBorderWidth(width) {
  if (width.endsWith("pt")) {
    return width.replace("pt", "px");
  }
  return width;
}

function convertBorderStyle(style) {
  const styleMap = {
    single: "solid",
    double: "double",
    dashed: "dashed",
    dotted: "dotted",
    solid: "solid",
  };
  return styleMap[style] || "solid";
}

function calculateCssBorderWidth(width, style) {
  const convertedWidth = convertBorderWidth(width);
  if (style === "double") {
    const match = convertedWidth.match(/^(\d+\.?\d*)(.*)$/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      return `${value * 3}${unit}`;
    }
  }
  return convertedWidth;
}

function generateAppShellCSS(theme, colorScheme) {
  const page = cssColor(colorScheme.background.page, "#ffffff");
  const surface = cssColor(colorScheme.background.surface, page);
  const border = cssColor(colorScheme.table.border, "#d0d7de");
  const secondaryText = cssColor(colorScheme.text.secondary, colorScheme.text.primary);
  const category = registry.themes.find((entry) => entry.id === theme.id)?.category;

  return `body[data-theme="${theme.id}"] {
  --bg: ${page};
  --text: ${colorScheme.text.primary};
  --border: ${border};
  --toolbar-bg: ${surface};
  --toolbar-border: ${border};
  --toolbar-text: ${secondaryText};
  --link: ${colorScheme.accent.link};
  --page-bg: ${page};
  --surface-bg: ${surface};
}

html {
  color-scheme: ${category === "dark" ? "dark" : "light"};
}`;
}

function generateFontAndLayoutCSS(fontScheme, layoutScheme, colorScheme) {
  const css = [];
  const bodyFontFamily = buildFontFamily(fontScheme.body.fontFamily);
  const bodyFontSize = ptToPx(layoutScheme.body.fontSize);
  const bodyLineHeight = layoutScheme.body.lineHeight;

  css.push(`#markdown-content {
  font-family: ${bodyFontFamily};
  font-size: ${bodyFontSize};
  line-height: ${bodyLineHeight};
  color: ${colorScheme.text.primary};${colorScheme.background.page ? `
  background-color: ${colorScheme.background.page};` : ""}
}`);

  if (colorScheme.background.page || colorScheme.background.surface) {
    const vars = [];
    if (colorScheme.background.page) vars.push(`  --md-page-bg: ${colorScheme.background.page};`);
    if (colorScheme.background.surface) vars.push(`  --md-surface: ${colorScheme.background.surface};`);
    css.push(`#markdown-content {
${vars.join("\n")}
}`);
  }

  if (colorScheme.background.blockquote) {
    css.push(`#markdown-content blockquote {
  background-color: ${colorScheme.background.blockquote};
}`);
  }

  css.push(`#markdown-content a {
  color: ${colorScheme.accent.link};
}`);

  css.push(`#markdown-content a:hover {
  color: ${colorScheme.accent.linkHover};
}`);

  css.push(`.katex {
  font-size: ${bodyFontSize};
}`);

  ["h1", "h2", "h3", "h4", "h5", "h6"].forEach((level) => {
    const fontHeading = fontScheme.headings[level];
    const layoutHeading = layoutScheme.headings[level];
    const fontFamily = buildFontFamily(
      fontHeading?.fontFamily ||
        fontScheme.headings.fontFamily ||
        fontScheme.body.fontFamily
    );
    const fontSize = ptToPx(layoutHeading.fontSize);
    const fontWeight = fontHeading?.fontWeight || fontScheme.headings.fontWeight || "bold";
    const headingColor = colorScheme.headings?.[level] || colorScheme.text.primary;
    const styles = [
      `  font-family: ${fontFamily};`,
      `  font-size: ${fontSize};`,
      `  font-weight: ${fontWeight};`,
      `  color: ${headingColor};`,
    ];

    if (layoutHeading.lineHeight !== undefined) {
      styles.push(`  line-height: ${layoutHeading.lineHeight};`);
    }

    if (layoutHeading.alignment && layoutHeading.alignment !== "left") {
      styles.push(`  text-align: ${layoutHeading.alignment};`);
    }

    if (layoutHeading.spacingBefore && layoutHeading.spacingBefore !== "0pt") {
      styles.push(`  margin-top: ${ptToPx(layoutHeading.spacingBefore)};`);
    }

    if (layoutHeading.spacingAfter && layoutHeading.spacingAfter !== "0pt") {
      styles.push(`  margin-bottom: ${ptToPx(layoutHeading.spacingAfter)};`);
    }

    if (layoutHeading.borderBottom) {
      const border = layoutHeading.borderBottom;
      const borderColor = colorScheme.headings?.border || colorScheme.table.border;
      const borderStyle = border.style || "solid";
      styles.push(`  border-bottom: ${border.width} ${borderStyle} ${borderColor};`);
      if (border.paddingBottom) {
        styles.push(`  padding-bottom: ${border.paddingBottom};`);
      }
    }

    css.push(`#markdown-content ${level} {
${styles.join("\n")}
}`);
  });

  return css.join("\n\n");
}

function generateTableCSS(tableStyle, colorScheme) {
  const css = [];

  css.push(`#markdown-content table {
  border-collapse: collapse;
  margin: 13px auto;
  overflow: auto;
}

#markdown-content.table-layout-left table {
  width: auto;
  margin-left: 0;
  margin-right: auto;
}

#markdown-content.table-layout-center table {
  width: auto;
}

#markdown-content.table-layout-center-full-width table {
  width: 100%;
  margin-left: auto;
  margin-right: auto;
}`);

  const border = tableStyle.border || {};
  const borderColor = colorScheme.table.border;

  css.push(`#markdown-content table th,
#markdown-content table td {
  padding: ${tableStyle.cell.padding};
}`);

  if (border.all) {
    const borderWidth = calculateCssBorderWidth(border.all.width, border.all.style);
    const borderStyle = convertBorderStyle(border.all.style);
    const borderValue = `${borderWidth} ${borderStyle} ${borderColor}`;
    css.push(`#markdown-content table th,
#markdown-content table td {
  border: ${borderValue};
}`);
  } else {
    css.push(`#markdown-content table th,
#markdown-content table td {
  border: none;
}`);

    if (border.headerTop) {
      const width = calculateCssBorderWidth(border.headerTop.width, border.headerTop.style);
      const style = convertBorderStyle(border.headerTop.style);
      css.push(`#markdown-content table th {
  border-top: ${width} ${style} ${borderColor};
}`);
    }

    if (border.headerBottom) {
      const width = calculateCssBorderWidth(border.headerBottom.width, border.headerBottom.style);
      const style = convertBorderStyle(border.headerBottom.style);
      css.push(`#markdown-content table th {
  border-bottom: ${width} ${style} ${borderColor};
}`);
    }

    if (border.rowBottom) {
      const width = calculateCssBorderWidth(border.rowBottom.width, border.rowBottom.style);
      const style = convertBorderStyle(border.rowBottom.style);
      css.push(`#markdown-content table td {
  border-bottom: ${width} ${style} ${borderColor};
}`);
    }

    if (border.lastRowBottom) {
      const width = calculateCssBorderWidth(border.lastRowBottom.width, border.lastRowBottom.style);
      const style = convertBorderStyle(border.lastRowBottom.style);
      css.push(`#markdown-content table tr:last-child td,
#markdown-content table td.merged-to-last {
  border-bottom: ${width} ${style} ${borderColor};
}`);
    }
  }

  const headerStyles = [
    `  background-color: ${colorScheme.table.headerBackground};`,
    `  color: ${colorScheme.table.headerText};`,
  ];

  if (tableStyle.header.fontWeight) {
    const fontWeight = tableStyle.header.fontWeight === "bold" ? "bold" : tableStyle.header.fontWeight;
    headerStyles.push(`  font-weight: ${fontWeight};`);
  }

  if (tableStyle.header.fontSize) {
    headerStyles.push(`  font-size: ${tableStyle.header.fontSize};`);
  }

  css.push(`#markdown-content table th {
${headerStyles.join("\n")}
}`);

  if (tableStyle.zebra?.enabled) {
    css.push(`#markdown-content table tr:nth-child(even) {
  background-color: ${colorScheme.table.zebraEven};
}`);

    css.push(`#markdown-content table tr:nth-child(odd) {
  background-color: ${colorScheme.table.zebraOdd};
}`);
  }

  return css.join("\n\n");
}

function generateCodeCSS(codeConfig, codeTheme, codeLayout, bodyFontSize, colorScheme) {
  const css = [];
  const codeFontFamily = buildFontFamily(codeConfig.fontFamily);
  const codeFontSize = ptToPx(codeLayout.fontSize);
  const bodyFontSizePt = parseFloat(bodyFontSize);
  const codeFontSizePt = parseFloat(codeLayout.fontSize);
  const inlineCodeScale = bodyFontSizePt > 0
    ? Number((codeFontSizePt / bodyFontSizePt).toFixed(4))
    : 1;
  const codeBackground = colorScheme.background.code;

  css.push(`#markdown-content code {
  font-family: ${codeFontFamily};
  font-size: ${inlineCodeScale}em;
  background-color: ${codeBackground};
}`);

  css.push(`#markdown-content pre {
  background-color: ${codeBackground};
}`);

  css.push(`#markdown-content pre code {
  font-family: ${codeFontFamily};
  font-size: ${codeFontSize};
  background-color: transparent;
}`);

  css.push(`#markdown-content .hljs {
  background: ${codeBackground} !important;
  color: ${codeTheme.foreground};
}`);

  Object.keys(codeTheme.colors).forEach((token) => {
    const color = codeTheme.colors[token];
    const colorValue = color.startsWith("#") ? color.slice(1) : color;
    css.push(`#markdown-content .hljs-${token} {
  color: #${colorValue};
}`);
  });

  return css.join("\n\n");
}

function generateBlockSpacingCSS(layoutScheme, colorScheme) {
  const css = [];
  const blocks = layoutScheme.blocks;
  const toPx = (pt) => (!pt || pt === "0pt" ? "0" : ptToPx(pt));

  if (blocks.paragraph) {
    const marginBefore = toPx(blocks.paragraph.spacingBefore);
    const marginAfter = toPx(blocks.paragraph.spacingAfter);
    css.push(`#markdown-content p {
  margin: ${marginBefore} 0 ${marginAfter} 0;
}`);
  }

  if (blocks.list) {
    const marginBefore = toPx(blocks.list.spacingBefore);
    const marginAfter = toPx(blocks.list.spacingAfter);
    css.push(`#markdown-content ul,
#markdown-content ol {
  margin: ${marginBefore} 0 ${marginAfter} 0;
}`);
  }

  if (blocks.listItem) {
    const marginBefore = toPx(blocks.listItem.spacingBefore);
    const marginAfter = toPx(blocks.listItem.spacingAfter);
    css.push(`#markdown-content li {
  margin: ${marginBefore} 0 ${marginAfter} 0;
}`);
  }

  if (blocks.blockquote) {
    const blockquote = blocks.blockquote;
    const marginBefore = toPx(blockquote.spacingBefore);
    const marginAfter = toPx(blockquote.spacingAfter);
    const paddingVertical = toPx(blockquote.paddingVertical);
    const paddingHorizontal = toPx(blockquote.paddingHorizontal);
    css.push(`#markdown-content blockquote {
  margin: ${marginBefore} 0 ${marginAfter} 0;
  padding: ${paddingVertical} ${paddingHorizontal};
  border-left-color: ${colorScheme.blockquote.border};
}`);
  }

  if (blocks.codeBlock) {
    const marginBefore = toPx(blocks.codeBlock.spacingBefore);
    const marginAfter = toPx(blocks.codeBlock.spacingAfter);
    css.push(`#markdown-content pre {
  margin: ${marginBefore} 0 ${marginAfter} 0;
}`);
  }

  if (blocks.table) {
    const marginBefore = toPx(blocks.table.spacingBefore);
    const marginAfter = toPx(blocks.table.spacingAfter);
    css.push(`#markdown-content table {
  margin: ${marginBefore} auto ${marginAfter} auto;
}`);
  }

  if (blocks.horizontalRule) {
    const horizontalRule = blocks.horizontalRule;
    const marginBefore = toPx(horizontalRule.spacingBefore);
    const marginAfter = toPx(horizontalRule.spacingAfter);
    const hrStyles = [
      `  margin: ${marginBefore} 0 ${marginAfter} 0;`,
    ];

    if (horizontalRule.borderWidth !== undefined || colorScheme.rule?.color !== undefined) {
      const width = horizontalRule.borderWidth ?? "1px";
      const hrColor = colorScheme.rule?.color;
      hrStyles.push("  background-color: transparent;");
      hrStyles.push("  border: 0;");
      hrStyles.push("  height: 0;");
      hrStyles.push(`  border-top: ${width} solid ${hrColor || "currentColor"};`);
    }

    css.push(`#markdown-content hr {
${hrStyles.join("\n")}
}`);
  }

  return css.join("\n\n");
}

function themeToCSS(theme, layoutScheme, colorScheme, tableStyle, codeTheme) {
  return [
    generateAppShellCSS(theme, colorScheme),
    generateFontAndLayoutCSS(theme.fontScheme, layoutScheme, colorScheme),
    generateTableCSS(tableStyle, colorScheme),
    generateCodeCSS(theme.fontScheme.code, codeTheme, layoutScheme.code, layoutScheme.body.fontSize, colorScheme),
    generateBlockSpacingCSS(layoutScheme, colorScheme),
  ].join("\n\n");
}

export function normalizeThemeId(themeId) {
  const mapped = LEGACY_THEME_MAP[themeId] || themeId || "default";
  return themeIds.has(mapped) ? mapped : "default";
}

export function getAvailableThemes() {
  return orderedThemeEntries.map((entry) => {
    const theme = getJson(`./theme-data/presets/${entry.file}`);
    return {
      ...entry,
      name: theme.name,
      name_en: theme.name_en,
      description: theme.description,
      description_en: theme.description_en,
    };
  });
}

export function getThemeCategories() {
  return registry.categories;
}

export function getThemeCount() {
  return orderedThemeEntries.length;
}

export function getThemeDefinition(themeId) {
  const normalizedThemeId = normalizeThemeId(themeId);
  const theme = getJson(`./theme-data/presets/${normalizedThemeId}.json`);
  const layoutScheme = getJson(`./theme-data/layout-schemes/${theme.layoutScheme}.json`);
  const colorScheme = getJson(`./theme-data/color-schemes/${theme.colorScheme}.json`);
  const tableStyle = getJson(`./theme-data/table-styles/${theme.tableStyle}.json`);
  const codeTheme = getJson(`./theme-data/code-themes/${theme.codeTheme}.json`);
  const category = registry.themes.find((entry) => entry.id === normalizedThemeId)?.category;

  return {
    id: normalizedThemeId,
    category,
    theme,
    layoutScheme,
    colorScheme,
    tableStyle,
    codeTheme,
    fontConfig,
  };
}

export function getCurrentThemeDefinition() {
  return getThemeDefinition(document.body.getAttribute("data-theme") || "default");
}

export function getCurrentThemeCSS() {
  const el = document.getElementById("theme-dynamic-style");
  return el ? el.textContent : "";
}

export function applyMarkdownTheme(themeId) {
  const {
    id: normalizedThemeId,
    category,
    theme,
    layoutScheme,
    colorScheme,
    tableStyle,
    codeTheme,
  } = getThemeDefinition(themeId);
  const css = themeToCSS(theme, layoutScheme, colorScheme, tableStyle, codeTheme);
  let styleElement = document.getElementById("theme-dynamic-style");

  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "theme-dynamic-style";
    document.head.appendChild(styleElement);
  }

  styleElement.textContent = css;
  document.body.setAttribute("data-theme", normalizedThemeId);
  document.documentElement.classList.toggle("dark", category === "dark");
  document.documentElement.classList.toggle("light", category !== "dark");
  return normalizedThemeId;
}
