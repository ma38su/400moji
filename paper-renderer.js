import { PAPER } from "./app-config.js";
import { VERTICAL_PUNCTUATION } from "./editor-logic.js";

function createCell(layout, absoluteSlot, selectionStart, selectionEnd, caret, interactive, caretVisible) {
  const cell = document.createElement("span");
  cell.className = "cell";
  const entry = layout.slots[absoluteSlot];
  const value = entry?.value || "";
  cell.textContent = value;
  if (VERTICAL_PUNCTUATION.has(value)) cell.classList.add("punctuation");
  if (/^[A-Za-z]$/.test(value)) cell.classList.add("latin");
  if (entry?.trailing) {
    const compressedCharacters = [value, ...Array.from(entry.trailing)];
    cell.textContent = "";
    cell.classList.add("has-trailing");
    cell.style.setProperty("--compressed-count", String(compressedCharacters.length));
    compressedCharacters.forEach((character, index) => {
      const compressed = document.createElement("span");
      compressed.className = "compressed-character";
      compressed.textContent = character;
      compressed.style.gridRow = String(index + 1);
      cell.appendChild(compressed);
    });
  }

  const offset = absoluteSlot % PAPER.pageSize;
  const column = PAPER.columns - Math.floor(offset / PAPER.rows);
  cell.style.gridColumn = String(column > PAPER.bindingAfterColumn ? column + 1 : column);
  cell.style.gridRow = String(offset % PAPER.rows + 1);

  if (interactive) {
    const cellIndexes = [layout.slotToIndex[absoluteSlot], ...(entry?.trailingIndexes || [])];
    if (cellIndexes.some(index => index >= selectionStart && index < selectionEnd)) cell.classList.add("selected");
    const caretPosition = layout.caretPositions?.[caret] || { slot: layout.caretSlots[caret], trailingOffset: null };
    if (absoluteSlot === caretPosition.slot && caretVisible) {
      cell.classList.add("caret");
      if (caretPosition.trailingOffset !== null) {
        const trailingCount = entry?.trailingIndexes?.length || 1;
        cell.style.setProperty("--caret-position", String(100 * (caretPosition.trailingOffset + 1) / (trailingCount + 1)));
      }
    }
    if (absoluteSlot === caretPosition.slot) cell.classList.add("active");
    cell.dataset.slot = absoluteSlot;
  }
  return cell;
}

export function createPaperPage(layout, startSlot, options = {}) {
  const { className = "paper", selectionStart = 0, selectionEnd = 0, caret = -1, interactive = false, caretVisible = false } = options;
  const paper = document.createElement("div");
  paper.className = className;
  const fragment = document.createDocumentFragment();
  for (let offset = 0; offset < PAPER.pageSize; offset++) {
    fragment.appendChild(createCell(layout, startSlot + offset, selectionStart, selectionEnd, caret, interactive, caretVisible));
  }
  paper.appendChild(fragment);
  return paper;
}

export function pageCountForWriting(usedSlots) {
  return Math.max(1, Math.floor(usedSlots / PAPER.pageSize) + 1);
}

export function pageCountForPrint(usedSlots) {
  return Math.max(1, Math.ceil(usedSlots / PAPER.pageSize));
}
