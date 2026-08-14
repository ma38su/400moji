import test from "node:test";
import assert from "node:assert/strict";
import { appShellFor, cacheVersionFor } from "../scripts/service-worker-build.js";

test("成果物一覧から安定したキャッシュ名を生成する", () => {
  const files = ["assets/app-abc.js:hash1", "index.html:hash2"];
  assert.equal(cacheVersionFor(files), cacheVersionFor([...files]));
  assert.notEqual(cacheVersionFor(files), cacheVersionFor(["assets/app-abc.js:hash1", "index.html:changed"]));
});

test("Service Worker自身とマスター画像を除いたアプリシェルを作る", () => {
  assert.deepEqual(appShellFor([
    "assets/app.js", "icons/icon-master.png", "icons/icon-192.png", "index.html", "sw.js"
  ]), ["./assets/app.js", "./icons/icon-192.png", "./"]);
});
