import test from "node:test";
import assert from "node:assert/strict";
import {
  characters, pointToUnit, unitToPoint, layoutCharacters,
  selectionPoints, movePaperSelection, textInSelection, replaceTextSelection
} from "../editor-logic.js";

test("UTF-16の選択位置と原稿用紙上の文字位置を相互変換する", () => {
  const text = "あ😀い";
  assert.equal(pointToUnit(text, 2), 3);
  assert.equal(unitToPoint(text, 3), 2);
});

test("前向き・後ろ向きの選択から起点と操作端を復元する", () => {
  assert.deepEqual(selectionPoints("あいうえお", 1, 4, "forward"), {
    start: 1, end: 4, anchor: 1, focus: 4
  });
  assert.deepEqual(selectionPoints("あいうえお", 1, 4, "backward"), {
    start: 1, end: 4, anchor: 4, focus: 1
  });
});

test("Shift＋上下で選択範囲を拡張・縮小し、起点を越えて反転できる", () => {
  const text = "あいうえお";
  let selection = { start: 2, end: 2, anchor: 2, focus: 2 };
  let moved = movePaperSelection(text, selection, "ArrowDown", true);
  assert.deepEqual(moved, { anchor: 2, focus: 3 });

  selection = { start: 2, end: 3, ...moved };
  moved = movePaperSelection(text, selection, "ArrowUp", true);
  assert.deepEqual(moved, { anchor: 2, focus: 2 });

  selection = { start: 2, end: 2, ...moved };
  assert.deepEqual(movePaperSelection(text, selection, "ArrowUp", true), { anchor: 2, focus: 1 });
});

test("Shift＋左右で20マス先の縦列へ選択端を移動する", () => {
  const text = characters("あ".repeat(60)).join("");
  const selection = { start: 5, end: 5, anchor: 5, focus: 5 };
  assert.deepEqual(movePaperSelection(text, selection, "ArrowLeft", true), { anchor: 5, focus: 25 });
  assert.deepEqual(movePaperSelection(text, selection, "ArrowRight", true), { anchor: 5, focus: 5 });
});

test("通常の矢印は選択範囲を移動方向側の端へ畳む", () => {
  const selection = { start: 5, end: 25, anchor: 5, focus: 25 };
  assert.deepEqual(movePaperSelection("あ".repeat(40), selection, "ArrowLeft", false), { anchor: 25, focus: 25 });
  assert.deepEqual(movePaperSelection("あ".repeat(40), selection, "ArrowRight", false), { anchor: 5, focus: 5 });
});

test("文頭・文末では選択端を範囲外へ移動しない", () => {
  const start = { start: 0, end: 0, anchor: 0, focus: 0 };
  const end = { start: 3, end: 3, anchor: 3, focus: 3 };
  assert.deepEqual(movePaperSelection("あいう", start, "ArrowUp", true), { anchor: 0, focus: 0 });
  assert.deepEqual(movePaperSelection("あいう", end, "ArrowDown", true), { anchor: 3, focus: 3 });
});

test("改行をまたぐ左右移動はレイアウト上の隣の縦列を使う", () => {
  const text = "あいう\nかきく";
  const layout = layoutCharacters(characters(text));
  assert.equal(layout.caretSlots[4], 20);
  const selection = { start: 1, end: 1, anchor: 1, focus: 1 };
  assert.deepEqual(movePaperSelection(text, selection, "ArrowLeft", true), { anchor: 1, focus: 5 });
});

test("矢印以外のキーは原稿用紙の選択処理で扱わない", () => {
  const selection = { start: 0, end: 0, anchor: 0, focus: 0 };
  assert.equal(movePaperSelection("本文", selection, "Enter", true), null);
});

test("選択範囲からコピー・カット対象の文字列を取得する", () => {
  const text = "あ😀いう";
  assert.equal(textInSelection(text, 1, 4), "😀い");
});

test("選択範囲を削除し、削除位置へカーソルを置く", () => {
  assert.deepEqual(replaceTextSelection("あいうえお", 1, 4, ""), {
    text: "あお", caret: 1
  });
});

test("選択範囲へペーストし、挿入文字列の直後へカーソルを置く", () => {
  assert.deepEqual(replaceTextSelection("あいう", 1, 2, "文章😀"), {
    text: "あ文章😀う", caret: 5
  });
});

test("20マス目の句読点を行末文字と同じマスへ配置する", () => {
  const layout = layoutCharacters(characters(`${"あ".repeat(20)}。`));
  assert.equal(layout.usedSlots, 20);
  assert.equal(layout.slots[19].trailing, "。");
  assert.deepEqual(layout.slots[19].trailingIndexes, [20]);
});

test("連続改行は空の縦列を確保する", () => {
  const layout = layoutCharacters(characters("あ\n\nい"));
  assert.equal(layout.caretSlots[3], 40);
  assert.equal(layout.slots[40].value, "い");
});
