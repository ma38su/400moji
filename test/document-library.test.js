import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from "../app-config.js";
import {
  createDocument, loadLibrary, nameExists, normalizeVerticalText,
  saveLibrary, uniqueName
} from "../document-library.js";

function memoryStorage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    value: key => data.get(key)
  };
}

test("縦書き入力を正規化する", () => {
  assert.equal(normalizeVerticalText("A\r\n(B)"), "A\n（B）");
});

test("旧形式の保存データを原稿ライブラリへ移行する", () => {
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify({ title: "旧原稿", body: "本文", page: 2 })
  });
  const loaded = loadLibrary(storage, () => "migrated-id");
  assert.equal(loaded.loadError, false);
  assert.deepEqual(loaded.library, {
    activeId: "migrated-id",
    documents: [{ id: "migrated-id", title: "旧原稿", body: "本文", page: 2, updatedAt: null }]
  });
});

test("破損した保存データから空の原稿を復旧する", () => {
  const loaded = loadLibrary(memoryStorage({ [STORAGE_KEY]: "{" }), () => "new-id");
  assert.equal(loaded.loadError, true);
  assert.equal(loaded.library.documents[0].id, "new-id");
});

test("重複しない原稿名を生成して保存できる", () => {
  const library = { activeId: "1", documents: [createDocument("原稿", {}, () => "1")] };
  assert.equal(nameExists(library, "原稿"), true);
  assert.equal(uniqueName(library, "原稿"), "原稿 2");
  const storage = memoryStorage();
  saveLibrary(storage, library);
  assert.deepEqual(JSON.parse(storage.value(STORAGE_KEY)), library);
});
