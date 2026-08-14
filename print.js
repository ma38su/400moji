import { PAPER, normalizePrintPreset, printLayoutMetrics } from "./app-config.js";
import { characters, layoutCharacters } from "./editor-logic.js";
import { createPaperPage, pageCountForPrint } from "./paper-renderer.js";

export function applyPrintPreset(library, selectElement, root = document.documentElement) {
  const preset = normalizePrintPreset(library.printPreset);
  library.printPreset = preset;
  selectElement.value = preset;
  root.dataset.printPreset = preset;
  const metrics = printLayoutMetrics(preset);
  root.style.setProperty("--app-print-cell", `${metrics.cellMm}mm`);
  root.style.setProperty("--app-print-gap", `${metrics.correctionGapMm}mm`);
  root.style.setProperty("--app-print-binding", `${metrics.bindingMm}mm`);
  root.style.setProperty("--app-print-pad", `${metrics.paddingMm}mm`);
  return preset;
}

export function preparePrintPages(container, documentState) {
  const layout = layoutCharacters(characters(documentState.body));
  const pageTotal = pageCountForPrint(layout.usedSlots);
  const fragment = document.createDocumentFragment();
  for (let page = 0; page < pageTotal; page++) {
    const sheet = document.createElement("article");
    sheet.className = "print-sheet";
    const heading = document.createElement("header");
    heading.className = "print-heading";
    const title = document.createElement("span");
    title.textContent = documentState.title;
    const number = document.createElement("span");
    number.textContent = `${page + 1} / ${pageTotal}`;
    heading.append(title, number);
    sheet.append(heading, createPaperPage(layout, page * PAPER.pageSize, { className: "paper print-paper" }));
    fragment.appendChild(sheet);
  }
  container.replaceChildren(fragment);
}
