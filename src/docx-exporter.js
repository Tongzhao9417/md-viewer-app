import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  LevelFormat,
  ExternalHyperlink,
  convertInchesToTwip,
  ShadingType,
} from "docx";
import { getCurrentThemeDefinition } from "./theme-engine.js";
import { getTypographyValuesForScope } from "./theme-settings.js";

const HEADING_MAP = {
  H1: HeadingLevel.HEADING_1,
  H2: HeadingLevel.HEADING_2,
  H3: HeadingLevel.HEADING_3,
  H4: HeadingLevel.HEADING_4,
  H5: HeadingLevel.HEADING_5,
  H6: HeadingLevel.HEADING_6,
};

const HEADING_LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"];

function stripHash(value, fallback = "000000") {
  return (value || fallback).replace(/^#/, "");
}

function parsePt(value, fallback = 0) {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ptToHalfPt(value, fallback = 12) {
  return Math.round(parsePt(value, fallback) * 2);
}

function ptToTwips(value, fallback = 0) {
  return Math.round(parsePt(value, fallback) * 20);
}

function spacingFromBlock(block = {}, lineSpacing = 240) {
  const beforePt = parsePt(block.spacingBefore, 0);
  const afterPt = parsePt(block.spacingAfter, 0);
  if (block.exactSpacing) {
    return {
      line: lineSpacing,
      before: ptToTwips(beforePt),
      after: ptToTwips(afterPt),
    };
  }

  const lineSpacingExtra = lineSpacing - 240;
  return {
    line: lineSpacing,
    before: Math.max(0, ptToTwips(beforePt) + Math.round(lineSpacingExtra / 2)),
    after: Math.max(0, ptToTwips(afterPt) - Math.round(lineSpacingExtra / 2)),
  };
}

function lengthToTwips(value, fontSizePt = 12, fallback = 0) {
  if (!value) return fallback;
  const text = String(value).trim();
  const amount = Number.parseFloat(text);
  if (!Number.isFinite(amount)) return fallback;
  if (text.endsWith("em")) return Math.round(amount * fontSizePt * 20);
  return ptToTwips(text, fallback);
}

function getExportLayoutScheme(themeId, layoutScheme) {
  if (themeId !== "academic") return layoutScheme;

  return {
    ...layoutScheme,
    body: {
      ...layoutScheme.body,
      lineHeight: 1.5,
    },
    headings: Object.fromEntries(
      HEADING_LEVELS.map((level) => [
        level,
        {
          ...layoutScheme.headings[level],
          spacingBefore: "0pt",
          spacingAfter: "0pt",
          lineHeight: 1.5,
          exactSpacing: true,
        },
      ]),
    ),
    code: {
      ...layoutScheme.code,
      lineHeight: 1.5,
    },
    blocks: {
      ...layoutScheme.blocks,
      paragraph: {
        ...layoutScheme.blocks.paragraph,
        spacingBefore: "0pt",
        spacingAfter: "0pt",
        textIndent: "2em",
        exactSpacing: true,
      },
      table: {
        ...layoutScheme.blocks.table,
        lineHeight: 1.5,
      },
    },
  };
}

function fontForDocx(fontName, fontConfig) {
  const docxFont = fontConfig.fonts[fontName]?.docx;
  if (!docxFont) return fontName;

  const ascii = docxFont.ascii || fontName;
  return {
    ascii,
    hAnsi: ascii,
    cs: docxFont.cs || ascii,
    eastAsia: docxFont.eastAsia || ascii,
  };
}

function toAlignment(alignment) {
  const map = {
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
    justified: AlignmentType.JUSTIFIED,
  };
  return map[alignment] || AlignmentType.LEFT;
}

function borderStyle(style) {
  const map = {
    none: BorderStyle.NONE,
    single: BorderStyle.SINGLE,
    solid: BorderStyle.SINGLE,
    dashed: BorderStyle.DASHED,
    dotted: BorderStyle.DOTTED,
    double: BorderStyle.DOUBLE,
  };
  return map[style] || BorderStyle.SINGLE;
}

function borderSize(width = "1pt") {
  if (width.endsWith("px")) return Math.max(1, Math.round(parsePt(width, 1) * 0.75 * 8));
  return Math.max(1, Math.round(parsePt(width, 1) * 8));
}

function makeBorder(border, color) {
  return {
    style: borderStyle(border?.style),
    size: borderSize(border?.width),
    color,
  };
}

function noBorder() {
  return { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
}

function buildTableBorders(tableStyle, colorScheme) {
  const borderColor = stripHash(colorScheme.table.border, "D0D7DE");
  const border = tableStyle.border || {};

  if (border.all) {
    const all = makeBorder(border.all, borderColor);
    return {
      top: all,
      bottom: all,
      left: all,
      right: all,
      insideHorizontal: all,
      insideVertical: all,
    };
  }

  const none = noBorder();
  return {
    top: border.headerTop ? makeBorder(border.headerTop, borderColor) : none,
    bottom: border.lastRowBottom ? makeBorder(border.lastRowBottom, borderColor) : none,
    left: none,
    right: none,
    insideVertical: none,
    insideHorizontal: border.rowBottom ? makeBorder(border.rowBottom, borderColor) : none,
  };
}

function buildThemeStyles() {
  const { id, theme, layoutScheme: currentLayoutScheme, colorScheme, tableStyle, codeTheme, fontConfig } =
    getCurrentThemeDefinition();
  const layoutScheme = getExportLayoutScheme(id, currentLayoutScheme);
  const typographyValues = getTypographyValuesForScope(id, "export");
  const fontSize = (key, fallback) => typographyValues[key] ?? fallback;
  const bodyLineSpacing = Math.round((layoutScheme.body.lineHeight || 1.5) * 240);
  const bodyFontSize = fontSize("body", layoutScheme.body.fontSize);
  const bodyFontSizePt = parsePt(bodyFontSize, parsePt(layoutScheme.body.fontSize, 12));
  const bodyFont = fontForDocx(theme.fontScheme.body.fontFamily, fontConfig);
  const codeFont = fontForDocx(theme.fontScheme.code.fontFamily, fontConfig);
  const paragraphSpacing = spacingFromBlock(layoutScheme.blocks.paragraph, bodyLineSpacing);
  const firstLineIndent = lengthToTwips(
    layoutScheme.blocks.paragraph?.textIndent,
    bodyFontSizePt,
  );
  const bodyParagraph = {
    spacing: paragraphSpacing,
    ...(firstLineIndent > 0 ? { indent: { firstLine: firstLineIndent } } : {}),
  };
  const headingStyles = {};

  HEADING_LEVELS.forEach((level, index) => {
    const headingConfig = theme.fontScheme.headings[level] || {};
    const layoutHeading = layoutScheme.headings[level];
    const fontName =
      headingConfig.fontFamily ||
      theme.fontScheme.headings.fontFamily ||
      theme.fontScheme.body.fontFamily;
    const fontWeight =
      headingConfig.fontWeight || theme.fontScheme.headings.fontWeight || "bold";
    const lineSpacing = Math.round((layoutHeading.lineHeight || 1.5) * 240);

    headingStyles[level.toUpperCase()] = {
      id: `Heading${index + 1}`,
      name: `Heading ${index + 1}`,
      basedOn: "Normal",
      next: "Normal",
      heading: Object.values(HEADING_MAP)[index],
      run: {
        size: ptToHalfPt(fontSize(level, layoutHeading.fontSize), 12),
        bold: fontWeight === "bold" || Number.parseInt(fontWeight, 10) >= 600,
        font: fontForDocx(fontName, fontConfig),
        color: stripHash(colorScheme.headings?.[level] || colorScheme.text.primary),
      },
      paragraph: {
        spacing: spacingFromBlock(layoutHeading, lineSpacing),
        alignment: toAlignment(layoutHeading.alignment),
      },
    };
  });

  const tablePadding = ptToTwips(tableStyle.cell.padding, 6);
  const codeLineSpacing = Math.round((layoutScheme.code.lineHeight || 1.15) * 240);
  const tableLineSpacing = Math.round(
    (layoutScheme.blocks.table?.lineHeight || 1) * 240,
  );

  return {
    pageBackground: stripHash(colorScheme.background.page, "FFFFFF"),
    default: {
      run: {
        font: bodyFont,
        size: ptToHalfPt(fontSize("body", layoutScheme.body.fontSize), 12),
        color: stripHash(colorScheme.text.primary),
      },
      paragraph: {
        spacing: paragraphSpacing,
      },
    },
    bodyParagraph,
    headings: headingStyles,
    linkColor: stripHash(colorScheme.accent.link, "0969DA"),
    code: {
      font: codeFont,
      size: ptToHalfPt(fontSize("code", layoutScheme.code.fontSize), 10),
      background: stripHash(colorScheme.background.code, "F6F8FA"),
      foreground: stripHash(codeTheme.foreground || colorScheme.text.primary),
      colors: codeTheme.colors || {},
      spacing: spacingFromBlock(layoutScheme.blocks.codeBlock, codeLineSpacing),
    },
    blockquote: {
      background: colorScheme.background.blockquote
        ? stripHash(colorScheme.background.blockquote)
        : undefined,
      borderColor: stripHash(colorScheme.blockquote.border, "CCCCCC"),
      spacing: spacingFromBlock(layoutScheme.blocks.blockquote, bodyLineSpacing),
      paddingHorizontal: ptToTwips(layoutScheme.blocks.blockquote?.paddingHorizontal, 10),
    },
    list: {
      spacing: spacingFromBlock(layoutScheme.blocks.listItem, bodyLineSpacing),
    },
    table: {
      spacing: spacingFromBlock(layoutScheme.blocks.table, tableLineSpacing),
      textSpacing: { before: 40, after: 40, line: tableLineSpacing },
      borders: buildTableBorders(tableStyle, colorScheme),
      cellMargins: {
        top: tablePadding,
        bottom: tablePadding,
        left: tablePadding,
        right: tablePadding,
      },
      header: {
        fill: stripHash(colorScheme.table.headerBackground, "F0F0F0"),
        color: stripHash(colorScheme.table.headerText, colorScheme.text.primary),
        bold: tableStyle.header.fontWeight === "bold",
      },
      zebra: tableStyle.zebra?.enabled
        ? {
            even: stripHash(colorScheme.table.zebraEven, "FAFAFA"),
            odd: stripHash(colorScheme.table.zebraOdd, "FFFFFF"),
          }
        : null,
    },
    horizontalRule: {
      spacing: spacingFromBlock(layoutScheme.blocks.horizontalRule, 120),
      color: stripHash(colorScheme.rule?.color || colorScheme.table.border, "D0D7DE"),
    },
  };
}

function makeTextRuns(text, style = {}) {
  const chunks = String(text).split("\n");
  const runs = [];

  chunks.forEach((chunk, index) => {
    if (index > 0) runs.push(new TextRun({ break: 1 }));
    if (chunk) runs.push(new TextRun({ text: chunk, ...style }));
  });

  return runs;
}

function getCodeTokenColor(el, themeStyles) {
  for (const className of el.classList || []) {
    if (!className.startsWith("hljs-")) continue;
    const token = className.slice(5);
    const color = themeStyles.code.colors[token];
    if (color) return stripHash(color);
  }
  return null;
}

function processCodeChildren(el, themeStyles, parentStyle = {}) {
  const runs = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      runs.push(...makeTextRuns(node.textContent, parentStyle));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName === "BR") {
        runs.push(new TextRun({ break: 1 }));
        continue;
      }
      const color = getCodeTokenColor(node, themeStyles);
      runs.push(
        ...processCodeChildren(node, themeStyles, {
          ...parentStyle,
          ...(color ? { color } : {}),
        }),
      );
    }
  }
  return runs;
}

function processInlineChildren(el, themeStyles, parentStyle = {}) {
  const runs = [];

  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) runs.push(new TextRun({ text: node.textContent, ...parentStyle }));
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = node.tagName;
    if (tag === "STRONG" || tag === "B") {
      runs.push(...processInlineChildren(node, themeStyles, { ...parentStyle, bold: true }));
    } else if (tag === "EM" || tag === "I") {
      runs.push(...processInlineChildren(node, themeStyles, { ...parentStyle, italics: true }));
    } else if (tag === "CODE") {
      runs.push(
        new TextRun({
          text: node.textContent,
          font: themeStyles.code.font,
          size: Math.max(1, Math.round((parentStyle.size || themeStyles.default.run.size) * 0.92)),
          color: parentStyle.color || themeStyles.default.run.color,
          shading: { type: ShadingType.CLEAR, fill: themeStyles.code.background },
        }),
      );
    } else if (tag === "A") {
      const href = node.getAttribute("href") || "";
      const linkRuns = processInlineChildren(node, themeStyles, {
        ...parentStyle,
        color: themeStyles.linkColor,
        style: "Hyperlink",
      });
      if (href) {
        runs.push(new ExternalHyperlink({ link: href, children: linkRuns }));
      } else {
        runs.push(...linkRuns);
      }
    } else if (tag === "BR") {
      runs.push(new TextRun({ break: 1 }));
    } else if (tag === "DEL" || tag === "S") {
      runs.push(...processInlineChildren(node, themeStyles, { ...parentStyle, strike: true }));
    } else {
      runs.push(...processInlineChildren(node, themeStyles, parentStyle));
    }
  }

  return runs;
}

function processBlockElement(el, themeStyles, listLevel = -1) {
  const tag = el.tagName;
  const results = [];

  if (HEADING_MAP[tag]) {
    const heading = themeStyles.headings[tag];
    results.push(
      new Paragraph({
        heading: heading.heading,
        ...heading.paragraph,
        children: processInlineChildren(el, themeStyles, heading.run),
      }),
    );
  } else if (tag === "P") {
    results.push(
      new Paragraph({
        ...themeStyles.bodyParagraph,
        children: processInlineChildren(el, themeStyles),
      }),
    );
  } else if (tag === "UL" || tag === "OL") {
    for (const li of el.querySelectorAll(":scope > li")) {
      results.push(...processListItem(li, themeStyles, tag === "OL", listLevel + 1));
    }
  } else if (tag === "PRE") {
    const code = el.querySelector("code");
    const codeRuns = processCodeChildren(code || el, themeStyles, {
      font: themeStyles.code.font,
      size: themeStyles.code.size,
      color: themeStyles.code.foreground,
    });
    results.push(
      new Paragraph({
        children: codeRuns.length ? codeRuns : [new TextRun({ text: " " })],
        style: "CodeBlock",
        wordWrap: true,
        shading: { type: ShadingType.CLEAR, fill: themeStyles.code.background },
        border: {
          top: { style: BorderStyle.SINGLE, size: 6, color: themeStyles.code.background, space: 8 },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: themeStyles.code.background, space: 8 },
          left: { style: BorderStyle.SINGLE, size: 6, color: themeStyles.code.background, space: 8 },
          right: { style: BorderStyle.SINGLE, size: 6, color: themeStyles.code.background, space: 8 },
        },
      }),
    );
  } else if (tag === "BLOCKQUOTE") {
    results.push(...processBlockquote(el, themeStyles));
  } else if (tag === "TABLE") {
    results.push(processTable(el, themeStyles));
  } else if (tag === "HR") {
    results.push(
      new Paragraph({
        style: "HorizontalRule",
        children: [],
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 8, color: themeStyles.horizontalRule.color },
        },
      }),
    );
  } else if (tag === "DIV" || tag === "SECTION" || tag === "ARTICLE") {
    for (const child of el.children) {
      results.push(...processBlockElement(child, themeStyles, listLevel));
    }
  } else {
    results.push(
      new Paragraph({
        ...themeStyles.bodyParagraph,
        children: processInlineChildren(el, themeStyles),
      }),
    );
  }

  return results;
}

function processBlockquote(el, themeStyles) {
  const results = [];
  const common = {
    style: "BlockquoteText",
    indent: { left: themeStyles.blockquote.paddingHorizontal },
    border: {
      left: {
        style: BorderStyle.SINGLE,
        size: 6,
        color: themeStyles.blockquote.borderColor,
        space: 8,
      },
    },
    ...(themeStyles.blockquote.background
      ? { shading: { type: ShadingType.CLEAR, fill: themeStyles.blockquote.background } }
      : {}),
  };

  if (!el.children.length && el.textContent.trim()) {
    return [
      new Paragraph({
        ...common,
        children: [new TextRun({ text: el.textContent.trim() })],
      }),
    ];
  }

  for (const child of el.children) {
    if (child.tagName === "P") {
      results.push(
        new Paragraph({
          ...common,
          children: processInlineChildren(child, themeStyles),
        }),
      );
    } else if (HEADING_MAP[child.tagName]) {
      const heading = themeStyles.headings[child.tagName];
      results.push(
        new Paragraph({
          ...common,
          children: processInlineChildren(child, themeStyles, heading.run),
        }),
      );
    } else {
      const nested = processBlockElement(child, themeStyles);
      results.push(...nested);
    }
  }

  return results;
}

function processListItem(li, themeStyles, ordered, level) {
  const results = [];
  let hasDirectText = false;

  for (const node of li.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      hasDirectText = true;
      break;
    }
    if (node.nodeType === Node.ELEMENT_NODE && !["UL", "OL", "P"].includes(node.tagName)) {
      hasDirectText = true;
      break;
    }
  }

  if (hasDirectText) {
    const inlineNodes = Array.from(li.childNodes).filter(
      (node) =>
        node.nodeType === Node.TEXT_NODE ||
        (node.nodeType === Node.ELEMENT_NODE && !["UL", "OL"].includes(node.tagName)),
    );
    const tempEl = document.createElement("span");
    for (const node of inlineNodes) tempEl.appendChild(node.cloneNode(true));

    results.push(
      new Paragraph({
        children: processInlineChildren(tempEl, themeStyles),
        numbering: { reference: ordered ? "ordered-list" : "bullet-list", level: Math.min(level, 5) },
        style: "ListParagraph",
      }),
    );
  }

  for (const child of li.children) {
    if (child.tagName === "P") {
      results.push(
        new Paragraph({
          children: processInlineChildren(child, themeStyles),
          numbering: { reference: ordered ? "ordered-list" : "bullet-list", level: Math.min(level, 5) },
          style: "ListParagraph",
        }),
      );
    } else if (child.tagName === "UL" || child.tagName === "OL") {
      for (const subLi of child.querySelectorAll(":scope > li")) {
        results.push(...processListItem(subLi, themeStyles, child.tagName === "OL", level + 1));
      }
    }
  }

  return results;
}

function processTable(tableEl, themeStyles) {
  const rows = [];
  const tableRows = Array.from(tableEl.querySelectorAll("tr"));

  tableRows.forEach((tr, rowIndex) => {
    const cells = [];
    for (const td of tr.querySelectorAll("th, td")) {
      const isHeader = td.tagName === "TH";
      const zebraFill = !isHeader && themeStyles.table.zebra
        ? rowIndex % 2 === 0
          ? themeStyles.table.zebra.odd
          : themeStyles.table.zebra.even
        : undefined;
      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: processInlineChildren(td, themeStyles, isHeader
                ? {
                    bold: themeStyles.table.header.bold,
                    color: themeStyles.table.header.color,
                  }
                : {}),
              style: isHeader ? "TableHeader" : "TableText",
            }),
          ],
          width: { size: 0, type: WidthType.AUTO },
          margins: themeStyles.table.cellMargins,
          shading: isHeader
            ? { type: ShadingType.CLEAR, fill: themeStyles.table.header.fill }
            : zebraFill
              ? { type: ShadingType.CLEAR, fill: zebraFill }
              : undefined,
        }),
      );
    }
    if (cells.length > 0) rows.push(new TableRow({ children: cells }));
  });

  if (rows.length === 0) {
    rows.push(
      new TableRow({
        children: [new TableCell({ children: [new Paragraph({ children: [] })] })],
      }),
    );
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    borders: themeStyles.table.borders,
  });
}

function paragraphStyles(themeStyles) {
  return [
    ...HEADING_LEVELS.map((level) => {
      const style = themeStyles.headings[level.toUpperCase()];
      return {
        id: style.id,
        name: style.name,
        basedOn: style.basedOn,
        next: style.next,
        run: style.run,
        paragraph: style.paragraph,
      };
    }),
    {
      id: "ListParagraph",
      name: "List Paragraph",
      basedOn: "Normal",
      next: "Normal",
      paragraph: { spacing: themeStyles.list.spacing },
    },
    {
      id: "CodeBlock",
      name: "Code Block",
      basedOn: "Normal",
      next: "Normal",
      run: {
        font: themeStyles.code.font,
        size: themeStyles.code.size,
        color: themeStyles.code.foreground,
      },
      paragraph: { spacing: themeStyles.code.spacing },
    },
    {
      id: "BlockquoteText",
      name: "Blockquote Text",
      basedOn: "Normal",
      next: "Normal",
      paragraph: { spacing: themeStyles.blockquote.spacing },
    },
    {
      id: "TableText",
      name: "Table Text",
      basedOn: "Normal",
      next: "Normal",
      run: { size: Math.max(1, themeStyles.default.run.size - 2) },
      paragraph: { spacing: themeStyles.table.textSpacing },
    },
    {
      id: "TableHeader",
      name: "Table Header",
      basedOn: "TableText",
      next: "TableText",
      run: { bold: true, color: themeStyles.table.header.color },
      paragraph: { spacing: themeStyles.table.textSpacing, alignment: AlignmentType.CENTER },
    },
    {
      id: "HorizontalRule",
      name: "Horizontal Rule",
      basedOn: "Normal",
      next: "Normal",
      paragraph: { spacing: themeStyles.horizontalRule.spacing },
    },
  ];
}

function numberingLevel(level, format, text, leftInches) {
  return {
    level,
    format,
    text,
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: {
          left: convertInchesToTwip(leftInches),
          hanging: convertInchesToTwip(0.25),
        },
      },
    },
  };
}

export async function exportDOCX(container) {
  const themeStyles = buildThemeStyles();
  const elements = [];

  for (const child of container.children) {
    elements.push(...processBlockElement(child, themeStyles));
  }

  const doc = new Document({
    creator: "MD Viewer",
    lastModifiedBy: "MD Viewer",
    background: { color: themeStyles.pageBackground },
    styles: {
      default: {
        document: themeStyles.default,
      },
      paragraphStyles: paragraphStyles(themeStyles),
    },
    numbering: {
      config: [
        {
          reference: "bullet-list",
          levels: [
            numberingLevel(0, LevelFormat.BULLET, "•", 0.5),
            numberingLevel(1, LevelFormat.BULLET, "◦", 1.0),
            numberingLevel(2, LevelFormat.BULLET, "▪", 1.5),
            numberingLevel(3, LevelFormat.BULLET, "•", 2.0),
            numberingLevel(4, LevelFormat.BULLET, "◦", 2.5),
            numberingLevel(5, LevelFormat.BULLET, "▪", 3.0),
          ],
        },
        {
          reference: "ordered-list",
          levels: [
            numberingLevel(0, LevelFormat.DECIMAL, "%1.", 0.5),
            numberingLevel(1, LevelFormat.LOWER_LETTER, "%2.", 1.0),
            numberingLevel(2, LevelFormat.LOWER_ROMAN, "%3.", 1.5),
            numberingLevel(3, LevelFormat.DECIMAL, "%4.", 2.0),
            numberingLevel(4, LevelFormat.LOWER_LETTER, "%5.", 2.5),
            numberingLevel(5, LevelFormat.LOWER_ROMAN, "%6.", 3.0),
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        children: elements.length ? elements : [new Paragraph({ text: "" })],
      },
    ],
  });

  return Packer.toBlob(doc);
}
