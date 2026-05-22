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

function createEditorActions({ getEditorElement, applyEditorEdit }) {
  function replaceSelectedLines(transformLine) {
    const editor = getEditorElement();
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
    const editor = getEditorElement();
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
    const editor = getEditorElement();
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
    const editor = getEditorElement();
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

  return {
    handleMarkdownEnter,
    handleMarkdownBackspace,
    handleEditorShortcut,
    handlePairCompletion,
    adjustMarkdownIndent,
  };
}

export function handleEditorKeyDown(event, context) {
  if (event.isComposing) return;

  const actions = createEditorActions(context);

  if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (actions.handleMarkdownEnter(event)) return;
  }

  if (event.key === "Backspace" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    if (actions.handleMarkdownBackspace(event)) return;
  }

  if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    actions.adjustMarkdownIndent(event.shiftKey);
    return;
  }

  if (actions.handleEditorShortcut(event)) return;
  actions.handlePairCompletion(event);
}
