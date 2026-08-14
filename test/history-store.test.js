import test from "node:test";
import assert from "node:assert/strict";
import { createHistoryStore } from "../history-store.js";

test("変更をUndo・Redoできる", () => {
  const store = createHistoryStore();
  const before = { body: "前", selectionStart: 1, selectionEnd: 1 };
  const after = { body: "後", selectionStart: 1, selectionEnd: 1 };
  store.begin("doc", before);
  store.commit("doc", after.body);
  assert.deepEqual(store.undo("doc", after), before);
  assert.deepEqual(store.redo("doc", before), after);
});

test("本文が変わらない操作は履歴へ積まない", () => {
  const store = createHistoryStore();
  const snapshot = { body: "同じ", selectionStart: 0, selectionEnd: 0 };
  store.begin("doc", snapshot);
  store.commit("doc", snapshot.body);
  assert.equal(store.undo("doc", snapshot), null);
});
