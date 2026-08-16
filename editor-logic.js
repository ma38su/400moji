import { PAPER } from "./app-config.js";

export const VERTICAL_PUNCTUATION = new Set(["。", "、"]);
export const LINE_START_PROHIBITED = new Set([
  "、", "。", "・", "ー", "！", "？", "」", "』", "）", "】", "］", "〉", "》", "〕",
  "々", "ゝ", "ゞ", "ヽ", "ヾ"
]);
export const SMALL_KANA = new Set([
  "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "っ", "ゃ", "ゅ", "ょ", "ゎ", "ゕ", "ゖ",
  "ァ", "ィ", "ゥ", "ェ", "ォ", "ッ", "ャ", "ュ", "ョ", "ヮ", "ヵ", "ヶ"
]);

export function characters(text) {
  return Array.from(String(text).replace(/\r/g, ""));
}

export function pointToUnit(text, point) {
  return characters(text).slice(0, point).join("").length;
}

export function unitToPoint(text, unit) {
  return characters(String(text).slice(0, unit)).length;
}

export function layoutCharacters(chars, options = {}) {
  const { prohibitSmallKanaAtLineStart = false } = options;
  const slots = [];
  const caretSlots = new Array(chars.length + 1);
  const caretPositions = new Array(chars.length + 1);
  const slotToIndex = [];
  let slot = 0;

  chars.forEach((value, index) => {
    caretSlots[index] = slot;
    caretPositions[index] ||= { slot, trailingOffset: null };
    if (value === "\n") {
      const columnOffset = slot % PAPER.rows;
      const startsBlankColumn = columnOffset === 0 && (index === 0 || chars[index - 1] === "\n");
      const remaining = columnOffset === 0 ? (startsBlankColumn ? PAPER.rows : 0) : PAPER.rows - columnOffset;
      for (let skipped = 0; skipped < remaining; skipped++) slotToIndex[slot + skipped] = index;
      slot += remaining;
      return;
    }
    const prohibitedAtLineStart = LINE_START_PROHIBITED.has(value)
      || (prohibitSmallKanaAtLineStart && SMALL_KANA.has(value));
    if (prohibitedAtLineStart && slot > 0 && slot % PAPER.rows === 0 && chars[index - 1] !== "\n" && slots[slot - 1]) {
      const trailingOffset = slots[slot - 1].trailingIndexes?.length || 0;
      slots[slot - 1].trailing = `${slots[slot - 1].trailing || ""}${value}`;
      (slots[slot - 1].trailingIndexes ||= []).push(index);
      caretPositions[index] = { slot: slot - 1, trailingOffset };
      caretPositions[index + 1] = { slot: slot - 1, trailingOffset: trailingOffset + 1 };
      return;
    }
    slots[slot] = { value, index };
    slotToIndex[slot] = index;
    slot++;
  });

  caretSlots[chars.length] = slot;
  caretPositions[chars.length] ||= { slot, trailingOffset: null };
  return { slots, caretSlots, caretPositions, slotToIndex, usedSlots: slot };
}

export function caretSlotAtIndex(layout, index) {
  return layout.caretPositions?.[index]?.slot ?? layout.caretSlots[index];
}

export function indexAtCellPosition(layout, targetSlot, relativePosition) {
  const entry = layout.slots[targetSlot];
  if (!entry) {
    const after = relativePosition >= .5;
    return indexAtOrNearSlot(layout, after ? targetSlot + 1 : targetSlot, after ? 1 : -1);
  }
  const characterIndexes = [entry.index, ...(entry.trailingIndexes || [])];
  const trailingCount = characterIndexes.length - 1;
  const caretStops = trailingCount
    ? [0, ...Array.from({ length: trailingCount + 1 }, (_, offset) => .5 + .5 * offset / trailingCount)]
    : [0, 1];
  let boundary = 0;
  for (let index = 1; index < caretStops.length; index++) {
    if (Math.abs(caretStops[index] - relativePosition) < Math.abs(caretStops[boundary] - relativePosition)) boundary = index;
  }
  return boundary === characterIndexes.length ? characterIndexes.at(-1) + 1 : characterIndexes[boundary];
}

export function indexAtOrNearSlot(layout, targetSlot, direction) {
  const exactIndex = layout.caretSlots.findIndex(slot => slot === targetSlot);
  if (exactIndex !== -1) return exactIndex;

  if (direction > 0) {
    for (let index = 0; index < layout.caretSlots.length; index++) {
      if (layout.caretSlots[index] > targetSlot) return index;
    }
    return layout.caretSlots.length - 1;
  }

  for (let index = layout.caretSlots.length - 1; index >= 0; index--) {
    if (layout.caretSlots[index] < targetSlot) return index;
  }
  return 0;
}

export function selectionPoints(text, selectionStart, selectionEnd, selectionDirection = "forward") {
  const start = unitToPoint(text, selectionStart);
  const end = unitToPoint(text, selectionEnd);
  const backward = selectionDirection === "backward";
  return { start, end, anchor: backward ? end : start, focus: backward ? start : end };
}

export function textInSelection(text, selectionStart, selectionEnd) {
  return String(text).slice(selectionStart, selectionEnd);
}

export function replaceTextSelection(text, selectionStart, selectionEnd, replacement) {
  const inserted = String(replacement);
  return {
    text: String(text).slice(0, selectionStart) + inserted + String(text).slice(selectionEnd),
    caret: selectionStart + inserted.length
  };
}

export function movePaperSelection(text, selection, key, extend, layoutOptions = {}) {
  const characterMovement = { ArrowUp: -1, ArrowDown: 1 }[key];
  const columnMovement = { ArrowLeft: PAPER.rows, ArrowRight: -PAPER.rows }[key];
  const movement = characterMovement || columnMovement;
  if (!movement) return null;

  if (!extend && selection.start !== selection.end) {
    const focus = movement < 0 ? selection.start : selection.end;
    return { anchor: focus, focus };
  }

  let focus = selection.focus;
  if (characterMovement) {
    focus = Math.max(0, Math.min(focus + characterMovement, characters(text).length));
  } else {
    const layout = layoutCharacters(characters(text), layoutOptions);
    const targetSlot = layout.caretSlots[focus] + columnMovement;
    if (targetSlot >= 0 && targetSlot <= layout.usedSlots) {
      focus = indexAtOrNearSlot(layout, targetSlot, Math.sign(columnMovement));
    }
  }

  return { anchor: extend ? selection.anchor : focus, focus };
}
