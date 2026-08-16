import "./styles.css";
import "./responsive.css";
import "./print.css";
import {
  characters, pointToUnit, unitToPoint,
  layoutCharacters, indexAtOrNearSlot, selectionPoints, movePaperSelection,
  textInSelection, replaceTextSelection
} from "./editor-logic.js";
import { PAPER } from "./app-config.js";
import {
  normalizeVerticalText, normalizeName, createDocument as createLibraryDocument,
  nameExists as libraryNameExists, uniqueName as uniqueLibraryName,
  loadLibrary, saveLibrary
} from "./document-library.js";
import { createHistoryStore } from "./history-store.js";
import { createPaperPage, pageCountForWriting } from "./paper-renderer.js";
import { applyPrintPreset as syncPrintPreset, preparePrintPages as renderPrintPages } from "./print.js";
import { setupPlatformFeatures } from "./platform.js";

const els = {
  paper: document.querySelector("#paper"), input: document.querySelector("#input"),
  title: document.querySelector("#title"), documentSelect: document.querySelector("#documentSelect"),
  saveStatus: document.querySelector("#saveStatus"),
  charCount: document.querySelector("#charCount"), sheetCount: document.querySelector("#sheetCount"),
  inputCharCount: document.querySelector("#inputCharCount"),
  meterFill: document.querySelector("#meterFill"),
  pageCount: document.querySelector("#pageCount"), prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"), toast: document.querySelector("#toast"),
  nameDialog: document.querySelector("#nameDialog"), nameForm: document.querySelector("#nameForm"),
  nameDialogTitle: document.querySelector("#nameDialogTitle"), documentName: document.querySelector("#documentName"),
  nameError: document.querySelector("#nameError"), paperWrap: document.querySelector(".paper-wrap"),
  paperViewButton: document.querySelector("#paperViewButton"), editViewButton: document.querySelector("#editViewButton"),
  viewHint: document.querySelector("#viewHint"), fullscreenButton: document.querySelector("#fullscreenButton"),
  undoButton: document.querySelector("#undoButton"), redoButton: document.querySelector("#redoButton"),
  printPages: document.querySelector("#printPages"), contextMenu: document.querySelector("#paperContextMenu"),
  printPreset: document.querySelector("#printPreset"),
  prohibitSmallKana: document.querySelector("#prohibitSmallKana")
};

let library = { activeId: "", documents: [] };
let documentState;
let page = 0;
let renderedPage = null;
let caret = 0;
let saveTimer;
let nameDialogMode = "new";
let viewMode = "paper";
let paperSelectionAnchor = null;
const historyStore = createHistoryStore();
const documentPositions = new Map();

function layoutOptions() {
  return { prohibitSmallKanaAtLineStart: library.prohibitSmallKanaAtLineStart === true };
}
function currentLayout(text = documentState.body) {
  return layoutCharacters(characters(text), layoutOptions());
}

function nameExists(name, exceptId = null) {
  return libraryNameExists(library, name, exceptId);
}
function uniqueName(baseName) {
  return uniqueLibraryName(library, baseName);
}
function createDocument(title, source = {}) {
  return createLibraryDocument(title, source);
}
function renderDocumentList() {
  const fragment = document.createDocumentFragment();
  library.documents.forEach(savedDocument => {
    const option = document.createElement("option");
    option.value = savedDocument.id;
    option.textContent = savedDocument.title;
    fragment.appendChild(option);
  });
  els.documentSelect.replaceChildren(fragment);
  els.documentSelect.value = library.activeId;
}
function applyActiveDocument() {
  documentState = library.documents.find(document => document.id === library.activeId) || library.documents[0];
  library.activeId = documentState.id;
  delete documentState.caret;
  els.title.value = documentState.title;
  documentState.body = normalizeVerticalText(documentState.body);
  els.input.value = documentState.body;
  const length = characters(documentState.body).length;
  caret = Math.max(0, Math.min(documentPositions.get(documentState.id) || 0, length));
  page = Math.max(0, Number(documentState.page) || 0);
  renderedPage = null;
  els.paper.classList.remove("page-turn-next", "page-turn-previous");
  renderDocumentList();
  ensureHistory();
  updateHistoryButtons();
}

function applyPrintPreset() {
  return syncPrintPreset(library, els.printPreset);
}

function currentSnapshot() {
  return {
    body: documentState.body,
    selectionStart: els.input.selectionStart,
    selectionEnd: els.input.selectionEnd
  };
}
function ensureHistory() {
  return historyStore.ensure(documentState.id);
}
function updateHistoryButtons() {
  const history = ensureHistory();
  els.undoButton.disabled = history.undo.length === 0;
  els.redoButton.disabled = history.redo.length === 0;
}
function restoreSnapshot(snapshot) {
  documentState.body = snapshot.body;
  els.input.value = snapshot.body;
  els.input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  caret = unitToPoint(documentState.body, snapshot.selectionStart);
  page = Math.floor(currentLayout().caretSlots[caret] / PAPER.pageSize);
  scheduleSave();
  render();
}
function undo() {
  const snapshot = historyStore.undo(documentState.id, currentSnapshot());
  if (!snapshot) return;
  restoreSnapshot(snapshot);
  updateHistoryButtons();
}
function redo() {
  const snapshot = historyStore.redo(documentState.id, currentSnapshot());
  if (!snapshot) return;
  restoreSnapshot(snapshot);
  updateHistoryButtons();
}
function setViewMode(mode, focus = true) {
  viewMode = mode === "edit" ? "edit" : "paper";
  library.viewMode = viewMode;
  els.paperWrap.classList.toggle("edit-mode", viewMode === "edit");
  els.paperViewButton.setAttribute("aria-pressed", String(viewMode === "paper"));
  els.editViewButton.setAttribute("aria-pressed", String(viewMode === "edit"));
  els.viewHint.textContent = viewMode === "edit" ? "選択・コピー・貼り付けができます" : "ドラッグで選択・クリックして入力";
  if (!focus) return;
  if (viewMode === "edit") {
    els.input.focus({ preventScroll: true });
    const unit = pointToUnit(documentState.body, caret);
    els.input.setSelectionRange(unit, unit);
  } else {
    render();
    focusAt(caret);
  }
  scheduleSave();
}
function load() {
  const loaded = loadLibrary(localStorage);
  library = loaded.library;
  if (loaded.loadError) showToast("保存データを読み込めませんでした");
  applyActiveDocument();
  applyPrintPreset();
  els.prohibitSmallKana.checked = library.prohibitSmallKanaAtLineStart === true;
  setViewMode(library.viewMode || "paper", false);
}
function scheduleSave() {
  els.saveStatus.textContent = "保存中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 350);
}
function save() {
  documentPositions.set(documentState.id, caret);
  documentState.page = page;
  documentState.updatedAt = new Date().toISOString();
  library.documents.forEach(savedDocument => delete savedDocument.caret);
  try {
    saveLibrary(localStorage, library);
    els.saveStatus.textContent = "保存済み";
  } catch { els.saveStatus.textContent = "保存できません"; }
}
function render() {
  const chars = characters(documentState.body);
  const layout = layoutCharacters(chars, layoutOptions());
  // 400字ちょうど埋まったときは、続けて書ける空白の次ページも用意する。
  const pages = pageCountForWriting(layout.usedSlots);
  const previousPage = renderedPage;
  page = Math.min(page, pages - 1);
  renderedPage = page;
  const startSlot = page * PAPER.pageSize;
  const selectionStart = unitToPoint(documentState.body, els.input.selectionStart);
  const selectionEnd = unitToPoint(documentState.body, els.input.selectionEnd);
  const renderedPaper = createPaperPage(layout, startSlot, {
    selectionStart, selectionEnd, caret, interactive: true,
    caretVisible: document.activeElement === els.input
  });
  els.paper.replaceChildren(...renderedPaper.childNodes);
  if (previousPage !== null && previousPage !== page && viewMode === "paper") {
    animatePageTurn(page > previousPage ? "next" : "previous");
  }
  const inputCharCount = chars.filter(c => c !== "\n").length;
  els.charCount.textContent = layout.usedSlots.toLocaleString("ja-JP");
  if (layout.usedSlots === 0) {
    els.sheetCount.textContent = "1枚目・未入力";
  } else {
    const lastUsedSlot = layout.usedSlots - 1;
    const usedSheet = Math.floor(lastUsedSlot / PAPER.pageSize) + 1;
    const slotOnSheet = lastUsedSlot % PAPER.pageSize;
    const usedColumn = Math.floor(slotOnSheet / PAPER.rows) + 1;
    const usedRow = slotOnSheet % PAPER.rows + 1;
    els.sheetCount.textContent = `${usedSheet}枚目・${usedColumn}行目の${usedRow}マス目まで`;
  }
  els.inputCharCount.textContent = `入力文字数: ${inputCharCount.toLocaleString("ja-JP")}文字`;
  els.meterFill.style.width = `${Math.min(100, (layout.usedSlots % PAPER.pageSize || (layout.usedSlots ? PAPER.pageSize : 0)) / PAPER.pageSize * 100)}%`;
  els.pageCount.textContent = `${page + 1} / ${pages}`;
  els.prevPage.disabled = page === 0;
  els.nextPage.disabled = page === pages - 1;
}

function animatePageTurn(direction) {
  const className = direction === "next" ? "page-turn-next" : "page-turn-previous";
  els.paper.classList.remove("page-turn-next", "page-turn-previous");
  // 同じ方向へ連続して移動した場合もアニメーションを最初から再生する。
  void els.paper.offsetWidth;
  els.paper.classList.add(className);
}

function focusAt(index) {
  caret = Math.max(0, Math.min(index, characters(documentState.body).length));
  els.input.focus({ preventScroll: true });
  const unit = pointToUnit(documentState.body, caret);
  els.input.setSelectionRange(unit, unit);
  scheduleSave();
  render();
}
function paperIndexFromPointer(event, cell) {
  const chars = characters(documentState.body);
  const layout = layoutCharacters(chars, layoutOptions());
  const slot = Number(cell.dataset.slot);
  const rect = cell.getBoundingClientRect();
  const after = event.clientY >= rect.top + rect.height / 2;
  return indexAtOrNearSlot(layout, after ? slot + 1 : slot, after ? 1 : -1);
}
function selectOnPaper(anchor, focus) {
  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);
  const direction = focus < anchor ? "backward" : "forward";
  els.input.focus({ preventScroll: true });
  els.input.setSelectionRange(
    pointToUnit(documentState.body, start),
    pointToUnit(documentState.body, end),
    direction
  );
  caret = focus;
  const layout = currentLayout();
  page = Math.floor(layout.caretSlots[caret] / PAPER.pageSize);
  scheduleSave();
  render();
}
function paperSelectionPoints() {
  return selectionPoints(
    documentState.body,
    els.input.selectionStart,
    els.input.selectionEnd,
    els.input.selectionDirection
  );
}
function selectedText() {
  return textInSelection(documentState.body, els.input.selectionStart, els.input.selectionEnd);
}
function replaceSelection(text) {
  historyStore.begin(documentState.id, currentSnapshot());
  els.input.focus({ preventScroll: true });
  const replacement = replaceTextSelection(
    els.input.value,
    els.input.selectionStart,
    els.input.selectionEnd,
    normalizeVerticalText(text)
  );
  els.input.value = replacement.text;
  els.input.setSelectionRange(replacement.caret, replacement.caret);
  els.input.dispatchEvent(new Event("input", { bubbles: true }));
}
function closePaperContextMenu() {
  els.contextMenu.hidden = true;
}
function openPaperContextMenu(x, y) {
  const hasSelection = els.input.selectionStart !== els.input.selectionEnd;
  for (const action of ["copy", "cut", "delete"]) {
    els.contextMenu.querySelector(`[data-edit-action="${action}"]`).disabled = !hasSelection;
  }
  els.contextMenu.hidden = false;
  const rect = els.contextMenu.getBoundingClientRect();
  els.contextMenu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
  els.contextMenu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
  els.contextMenu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
}
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  setTimeout(() => els.toast.classList.remove("show"), 2200);
}
function download(name, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
}
function safeName() { return (documentState.title.trim() || "無題の原稿").replace(/[\\/:*?"<>|]/g, "_"); }

function activateDocument(id) {
  clearTimeout(saveTimer);
  save();
  library.activeId = id;
  applyActiveDocument();
  render();
}
function addAndActivate(document) {
  clearTimeout(saveTimer);
  save();
  library.documents.push(document);
  library.activeId = document.id;
  applyActiveDocument();
  save();
  render();
  focusAt(0);
}
function openNameDialog(mode) {
  nameDialogMode = mode;
  els.nameDialogTitle.textContent = mode === "duplicate" ? "ファイルを複製" : "新しいファイル";
  els.documentName.value = mode === "duplicate" ? uniqueName(`${documentState.title} のコピー`) : uniqueName("無題の原稿");
  els.nameError.textContent = "";
  els.nameDialog.showModal();
  els.documentName.select();
}

els.paper.addEventListener("pointerdown", event => {
  if (event.button !== 0) return;
  const cell = event.target.closest(".cell");
  if (!cell) {
    focusAt(caret);
    return;
  }

  event.preventDefault();
  const index = paperIndexFromPointer(event, cell);
  paperSelectionAnchor = event.shiftKey
    ? unitToPoint(documentState.body, els.input.selectionStart)
    : index;
  els.paper.setPointerCapture(event.pointerId);
  selectOnPaper(paperSelectionAnchor, index);
});
els.paper.addEventListener("pointermove", event => {
  if (paperSelectionAnchor === null || !els.paper.hasPointerCapture(event.pointerId)) return;
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest(".cell");
  if (!cell || !els.paper.contains(cell)) return;
  event.preventDefault();
  selectOnPaper(paperSelectionAnchor, paperIndexFromPointer(event, cell));
});
function finishPaperSelection(event) {
  if (paperSelectionAnchor === null) return;
  if (els.paper.hasPointerCapture(event.pointerId)) els.paper.releasePointerCapture(event.pointerId);
  paperSelectionAnchor = null;
}
els.paper.addEventListener("pointerup", finishPaperSelection);
els.paper.addEventListener("pointercancel", finishPaperSelection);
els.paper.addEventListener("animationend", event => {
  if (event.target !== els.paper || !event.animationName.startsWith("page-turn-")) return;
  els.paper.classList.remove("page-turn-next", "page-turn-previous");
});
els.paper.addEventListener("contextmenu", event => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  const index = paperIndexFromPointer(event, cell);
  const start = unitToPoint(documentState.body, els.input.selectionStart);
  const end = unitToPoint(documentState.body, els.input.selectionEnd);
  if (start === end || index < start || index > end) selectOnPaper(index, index);
  openPaperContextMenu(event.clientX, event.clientY);
});
els.contextMenu.addEventListener("click", async event => {
  const action = event.target.closest("[data-edit-action]")?.dataset.editAction;
  if (!action) return;
  closePaperContextMenu();
  try {
    if (action === "copy" || action === "cut") {
      const text = selectedText();
      if (!text) return;
      await navigator.clipboard.writeText(text);
      if (action === "cut") replaceSelection("");
      else els.input.focus({ preventScroll: true });
    } else if (action === "paste") {
      replaceSelection(await navigator.clipboard.readText());
    } else if (action === "delete") {
      replaceSelection("");
    } else if (action === "select-all") {
      selectOnPaper(0, characters(documentState.body).length);
    }
  } catch {
    showToast("クリップボードへのアクセスを許可してください");
    els.input.focus({ preventScroll: true });
  }
});
document.addEventListener("pointerdown", event => {
  if (!els.contextMenu.hidden && !els.contextMenu.contains(event.target)) closePaperContextMenu();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closePaperContextMenu();
});
window.addEventListener("blur", closePaperContextMenu);
window.addEventListener("resize", closePaperContextMenu);
window.addEventListener("scroll", closePaperContextMenu, true);
els.paper.addEventListener("focus", () => focusAt(caret));
els.input.addEventListener("beforeinput", () => {
  historyStore.begin(documentState.id, currentSnapshot());
});
els.input.addEventListener("input", () => {
  const normalized = normalizeVerticalText(els.input.value);
  if (normalized !== els.input.value) {
    const selectionStart = els.input.selectionStart;
    const selectionEnd = els.input.selectionEnd;
    els.input.value = normalized;
    els.input.setSelectionRange(selectionStart, selectionEnd);
  }
  documentState.body = normalized;
  historyStore.commit(documentState.id, documentState.body);
  caret = unitToPoint(documentState.body, els.input.selectionStart);
  page = Math.floor(currentLayout().caretSlots[caret] / PAPER.pageSize);
  scheduleSave(); render(); updateHistoryButtons();
});
els.input.addEventListener("keydown", event => {
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && !event.altKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
    return;
  }
  if (modifier && !event.altKey && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }
  if (viewMode === "edit") return;
  if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey) return;
  const selection = paperSelectionPoints();
  const moved = movePaperSelection(documentState.body, selection, event.key, event.shiftKey, layoutOptions());
  if (!moved) return;
  event.preventDefault();
  if (event.shiftKey) selectOnPaper(moved.anchor, moved.focus);
  else focusAt(moved.focus);
});
function syncCaretFromInput() {
  caret = paperSelectionPoints().focus;
  page = Math.floor(currentLayout().caretSlots[caret] / PAPER.pageSize);
  scheduleSave(); render();
}
els.input.addEventListener("keyup", syncCaretFromInput);
els.input.addEventListener("click", syncCaretFromInput);
els.input.addEventListener("blur", render);
els.documentSelect.addEventListener("change", () => activateDocument(els.documentSelect.value));
els.paperViewButton.addEventListener("click", () => setViewMode("paper"));
els.editViewButton.addEventListener("click", () => setViewMode("edit"));
els.undoButton.addEventListener("click", undo);
els.redoButton.addEventListener("click", redo);
els.printPreset.addEventListener("change", () => {
  library.printPreset = els.printPreset.value;
  applyPrintPreset();
  scheduleSave();
  showToast(els.printPreset.value === "jis-a4" ? "JIS寸法で印刷します" : "学校向け9mmマスで印刷します");
});
els.prohibitSmallKana.addEventListener("change", () => {
  library.prohibitSmallKanaAtLineStart = els.prohibitSmallKana.checked;
  page = Math.floor(currentLayout().caretSlots[caret] / PAPER.pageSize);
  scheduleSave();
  render();
});
function commitDocumentName() {
  const nextName = normalizeName(els.title.value);
  if (!nextName) {
    els.title.value = documentState.title;
    showToast("ファイル名を入力してください");
    return;
  }
  if (nameExists(nextName, documentState.id)) {
    els.title.value = documentState.title;
    showToast("同じ名前のファイルがあります");
    return;
  }
  documentState.title = nextName;
  renderDocumentList();
  scheduleSave();
}
els.title.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  els.title.blur();
});
els.title.addEventListener("blur", commitDocumentName);
function moveToPage(targetPage) {
  const chars = characters(documentState.body);
  const layout = layoutCharacters(chars, layoutOptions());
  const targetSlot = targetPage * PAPER.pageSize;
  page = targetPage;
  focusAt(layout.slotToIndex[targetSlot] ?? chars.length);
}
els.prevPage.addEventListener("click", () => moveToPage(page - 1));
els.nextPage.addEventListener("click", () => moveToPage(page + 1));
document.querySelector("#newDocument").addEventListener("click", () => {
  document.querySelector(".menu").removeAttribute("open");
  openNameDialog("new");
});
document.querySelector("#duplicateDocument").addEventListener("click", () => {
  document.querySelector(".menu").removeAttribute("open");
  openNameDialog("duplicate");
});
document.querySelector("#importClipboard").addEventListener("click", async () => {
  document.querySelector(".menu").removeAttribute("open");
  try {
    const text = await navigator.clipboard.readText();
    if (!text) { showToast("クリップボードにテキストがありません"); return; }
    addAndActivate(createDocument(uniqueName("クリップボードからの原稿"), { body: text }));
    showToast("クリップボードから新しい原稿を作成しました");
  } catch {
    showToast("クリップボードの読み取りを許可してください");
  }
});
document.querySelector("#cancelName").addEventListener("click", () => els.nameDialog.close());
els.nameForm.addEventListener("submit", event => {
  event.preventDefault();
  const name = normalizeName(els.documentName.value);
  if (!name) { els.nameError.textContent = "ファイル名を入力してください"; return; }
  if (nameExists(name)) { els.nameError.textContent = "同じ名前のファイルがあります"; return; }
  const source = nameDialogMode === "duplicate" ? { ...documentState, page: 0 } : {};
  els.nameDialog.close();
  addAndActivate(createDocument(name, source));
});
document.querySelector("#exportText").addEventListener("click", () => download(`${safeName()}.txt`, documentState.body, "text/plain;charset=utf-8"));
document.querySelector("#exportJson").addEventListener("click", () => download(`${safeName()}.json`, JSON.stringify(documentState, null, 2), "application/json"));
document.querySelector("#importText").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  document.querySelector(".menu").removeAttribute("open");
  try {
    const name = normalizeName(file.name.replace(/\.txt$/i, "") || "読み込んだ原稿");
    if (nameExists(name)) {
      showToast("同じ名前のファイルがあります");
      return;
    }
    addAndActivate(createDocument(name, { body: await file.text() }));
    showToast("TXTから原稿を読み込みました");
  } catch {
    showToast("このTXTは読み込めません");
  } finally {
    event.target.value = "";
  }
});
document.querySelector("#importJson").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (typeof imported.body !== "string") throw new Error();
    const name = normalizeName(imported.title || file.name.replace(/\.json$/i, "") || "読み込んだ原稿");
    if (nameExists(name)) { showToast("同じ名前のファイルがあります"); return; }
    addAndActivate(createDocument(name, { ...imported, page: 0 }));
    showToast("原稿を読み込みました");
  } catch { showToast("このJSONは読み込めません"); }
  event.target.value = "";
});
document.querySelector("#printButton").addEventListener("click", () => {
  renderPrintPages(els.printPages, documentState, layoutOptions());
  window.print();
});
window.addEventListener("beforeprint", () => renderPrintPages(els.printPages, documentState, layoutOptions()));
window.addEventListener("beforeunload", save);

setupPlatformFeatures({
  fullscreenButton: els.fullscreenButton,
  installButton: document.querySelector("#installApp"),
  showToast,
  enableServiceWorker: import.meta.env.PROD
});

load();
render();
