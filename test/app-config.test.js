import test from "node:test";
import assert from "node:assert/strict";
import { PAPER, normalizePrintPreset, printLayoutMetrics } from "../app-config.js";

test("原稿用紙の行列とページ容量が一致する", () => {
  assert.equal(PAPER.rows * PAPER.columns, PAPER.pageSize);
});

test("未知の印刷設定はJIS寸法へ戻す", () => {
  assert.equal(normalizePrintPreset("unknown"), "jis-a4");
});

test("JIS寸法と学校向け寸法がA4横向きへ収まる", () => {
  const jis = printLayoutMetrics("jis-a4");
  const school = printLayoutMetrics("school-a4");
  assert.deepEqual([jis.cellMm, jis.correctionGapMm], [8.5, 3.5]);
  assert.deepEqual([school.cellMm, school.correctionGapMm], [9, 3]);
  for (const layout of [jis, school]) {
    assert.ok(layout.paperWidthMm <= 277);
    assert.ok(layout.paperHeightMm <= 189);
  }
});
