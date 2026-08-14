export const STORAGE_KEY = "yonhyakuji.library.v2";
export const LEGACY_STORAGE_KEY = "yonhyakuji.document.v1";

export const PAPER = Object.freeze({
  rows: 20,
  columns: 20,
  bindingAfterColumn: 10,
  pageSize: 400
});

export const PRINT_PRESETS = Object.freeze({
  "jis-a4": Object.freeze({ label: "JIS寸法", cellMm: 8.5, correctionGapMm: 3.5, bindingMm: 14, paddingMm: 5 }),
  "school-a4": Object.freeze({ label: "学校向け", cellMm: 9, correctionGapMm: 3, bindingMm: 14, paddingMm: 2 })
});

export function normalizePrintPreset(value) {
  return Object.hasOwn(PRINT_PRESETS, value) ? value : "jis-a4";
}

export function printLayoutMetrics(value) {
  const preset = PRINT_PRESETS[normalizePrintPreset(value)];
  return {
    ...preset,
    paperWidthMm: preset.cellMm * PAPER.columns + preset.correctionGapMm * PAPER.columns + preset.bindingMm + preset.paddingMm * 2,
    paperHeightMm: preset.cellMm * PAPER.rows + preset.paddingMm * 2
  };
}
