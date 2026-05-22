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
  margin: 0cm;
  font-size: 22.0pt;
}
h2.MsoHeading2 {
  margin: 0cm;
  font-size: 16.0pt;
}
h3.MsoHeading3 {
  margin: 0cm;
  font-size: 14.0pt;
}
h4.MsoHeading4,
h5.MsoHeading5,
h6.MsoHeading6 {
  margin: 0cm;
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

export function initCopyHandler({ contentEl, getTheme = () => document.body.getAttribute("data-theme") } = {}) {
  document.addEventListener("copy", (e) => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const theme = getTheme();
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
