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
    const trailing = document.createElement("span");
    trailing.className = "line-end-punctuation";
    trailing.textContent = entry.trailing;
    cell.appendChild(trailing);
  }

  const offset = absoluteSlot % PAPER.pageSize;
  const column = PAPER.columns - Math.floor(offset / PAPER.rows);
  cell.style.gridColumn = String(column > PAPER.bindingAfterColumn ? column + 1 : column);
  cell.style.gridRow = String(offset % PAPER.rows + 1);

  if (interactive) {
    const cellIndexes = [layout.slotToIndex[absoluteSlot], ...(entry?.trailingIndexes || [])];
    if (cellIndexes.some(index => index >= selectionStart && index < selectionEnd)) cell.classList.add("selected");
    if (absoluteSlot === layout.caretSlots[caret] && caretVisible) cell.classList.add("caret");
    if (absoluteSlot === layout.caretSlots[caret]) cell.classList.add("active");
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
