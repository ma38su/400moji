import "./styles.css";

const STORAGE_KEY = "yonhyakuji.library.v2";
const LEGACY_STORAGE_KEY = "yonhyakuji.document.v1";
const PAGE_SIZE = 400;
const VERTICAL_PUNCTUATION = new Set(["。", "、"]);
const HALF_WIDTH_REPLACEMENTS = { "(": "（", ")": "）" };
let installPrompt;

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
  printPages: document.querySelector("#printPages")
};

let library = { activeId: "", documents: [] };
let documentState;
let page = 0;
let caret = 0;
let saveTimer;
let nameDialogMode = "new";
let viewMode = "paper";
const histories = new Map();
const documentPositions = new Map();

function characters(text) { return Array.from(text.replace(/\r/g, "")); }
function normalizeVerticalText(text) {
  return String(text || "").replace(/[()]/g, character => HALF_WIDTH_REPLACEMENTS[character]);
}
function pointToUnit(text, point) { return characters(text).slice(0, point).join("").length; }
function unitToPoint(text, unit) { return characters(text.slice(0, unit)).length; }
function layoutCharacters(chars) {
  const slots = [];
  const caretSlots = new Array(chars.length + 1);
  const slotToIndex = [];
  let slot = 0;

  chars.forEach((value, index) => {
    caretSlots[index] = slot;
    if (value === "\n") {
      // 改行は文字として表示せず、次の縦列の先頭まで送る。
      const columnOffset = slot % 20;
      const startsBlankColumn = columnOffset === 0 && (index === 0 || chars[index - 1] === "\n");
      const remaining = columnOffset === 0 ? (startsBlankColumn ? 20 : 0) : 20 - columnOffset;
      for (let skipped = 0; skipped < remaining; skipped++) slotToIndex[slot + skipped] = index;
      slot += remaining;
      return;
    }
    if (VERTICAL_PUNCTUATION.has(value) && slot > 0 && slot % 20 === 0 && chars[index - 1] !== "\n" && slots[slot - 1]) {
      // 行頭へ句読点を送らず、行末の文字と同じマスへぶら下げる。
      slots[slot - 1].trailing = `${slots[slot - 1].trailing || ""}${value}`;
      return;
    }
    slots[slot] = { value, index };
    slotToIndex[slot] = index;
    slot++;
  });

  caretSlots[chars.length] = slot;
  return { slots, caretSlots, slotToIndex, usedSlots: slot };
}
function indexAtOrNearSlot(layout, targetSlot, direction) {
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
function newId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function normalizeName(name) { return String(name || "").trim(); }
function nameExists(name, exceptId = null) {
  const normalized = normalizeName(name);
  return library.documents.some(document => document.id !== exceptId && document.title === normalized);
}
function uniqueName(baseName) {
  const base = normalizeName(baseName) || "無題の原稿";
  if (!nameExists(base)) return base;
  let number = 2;
  while (nameExists(`${base} ${number}`)) number++;
  return `${base} ${number}`;
}
function createDocument(title, source = {}) {
  return {
    id: newId(), title: normalizeName(title), body: normalizeVerticalText(source.body),
    page: Number(source.page) || 0,
    updatedAt: source.updatedAt || null
  };
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
  renderDocumentList();
  ensureHistory();
  updateHistoryButtons();
}

function currentSnapshot() {
  return {
    body: documentState.body,
    selectionStart: els.input.selectionStart,
    selectionEnd: els.input.selectionEnd
  };
}
function ensureHistory() {
  if (!histories.has(documentState.id)) histories.set(documentState.id, { undo: [], redo: [], pending: null });
  return histories.get(documentState.id);
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
  page = Math.floor(layoutCharacters(characters(documentState.body)).caretSlots[caret] / PAGE_SIZE);
  scheduleSave();
  render();
}
function undo() {
  const history = ensureHistory();
  const snapshot = history.undo.pop();
  if (!snapshot) return;
  history.redo.push(currentSnapshot());
  restoreSnapshot(snapshot);
  updateHistoryButtons();
}
function redo() {
  const history = ensureHistory();
  const snapshot = history.redo.pop();
  if (!snapshot) return;
  history.undo.push(currentSnapshot());
  restoreSnapshot(snapshot);
  updateHistoryButtons();
}
function setViewMode(mode, focus = true) {
  viewMode = mode === "edit" ? "edit" : "paper";
  library.viewMode = viewMode;
  els.paperWrap.classList.toggle("edit-mode", viewMode === "edit");
  els.paperViewButton.setAttribute("aria-pressed", String(viewMode === "paper"));
  els.editViewButton.setAttribute("aria-pressed", String(viewMode === "edit"));
  els.viewHint.textContent = viewMode === "edit" ? "選択・コピー・貼り付けができます" : "用紙をクリックして入力";
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
  try {
    const savedLibrary = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (savedLibrary?.documents?.length) {
      library = savedLibrary;
    } else {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null") || {};
      const migrated = createDocument(uniqueName(legacy.title || "無題の原稿"), legacy);
      library = { activeId: migrated.id, documents: [migrated] };
    }
  } catch { showToast("保存データを読み込めませんでした"); }
  if (!library.documents.length) {
    const initial = createDocument("無題の原稿");
    library = { activeId: initial.id, documents: [initial] };
  }
  applyActiveDocument();
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    els.saveStatus.textContent = "保存済み";
  } catch { els.saveStatus.textContent = "保存できません"; }
}
function render() {
  const chars = characters(documentState.body);
  const layout = layoutCharacters(chars);
  // 400字ちょうど埋まったときは、続けて書ける空白の次ページも用意する。
  const pages = Math.max(1, Math.floor(layout.usedSlots / PAGE_SIZE) + 1);
  page = Math.min(page, pages - 1);
  const startSlot = page * PAGE_SIZE;
  const fragment = document.createDocumentFragment();
  els.paper.replaceChildren();
  for (let i = 0; i < PAGE_SIZE; i++) {
    const cell = document.createElement("span");
    cell.className = "cell";
    const absoluteSlot = startSlot + i;
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
    const column = 20 - Math.floor(i / 20);
    // 10列目と11列目の間に、原稿用紙の綴じ代用トラックを空ける。
    cell.style.gridColumn = String(column > 10 ? column + 1 : column);
    cell.style.gridRow = String(i % 20 + 1);
    if (absoluteSlot === layout.caretSlots[caret] && document.activeElement === els.input) cell.classList.add("caret");
    if (absoluteSlot === layout.caretSlots[caret]) cell.classList.add("active");
    cell.dataset.slot = absoluteSlot;
    fragment.appendChild(cell);
  }
  els.paper.appendChild(fragment);
  const inputCharCount = chars.filter(c => c !== "\n").length;
  els.charCount.textContent = layout.usedSlots.toLocaleString("ja-JP");
  if (layout.usedSlots === 0) {
    els.sheetCount.textContent = "1枚目・未入力";
  } else {
    const lastUsedSlot = layout.usedSlots - 1;
    const usedSheet = Math.floor(lastUsedSlot / PAGE_SIZE) + 1;
    const slotOnSheet = lastUsedSlot % PAGE_SIZE;
    const usedColumn = Math.floor(slotOnSheet / 20) + 1;
    const usedRow = slotOnSheet % 20 + 1;
    els.sheetCount.textContent = `${usedSheet}枚目・${usedColumn}行目の${usedRow}マス目まで`;
  }
  els.inputCharCount.textContent = `入力文字数: ${inputCharCount.toLocaleString("ja-JP")}文字`;
  els.meterFill.style.width = `${Math.min(100, (layout.usedSlots % PAGE_SIZE || (layout.usedSlots ? PAGE_SIZE : 0)) / PAGE_SIZE * 100)}%`;
  els.pageCount.textContent = `${page + 1} / ${pages}`;
  els.prevPage.disabled = page === 0;
  els.nextPage.disabled = page === pages - 1;
}

function createPaperPage(layout, startSlot, className = "paper") {
  const paper = document.createElement("div");
  paper.className = className;
  for (let i = 0; i < PAGE_SIZE; i++) {
    const cell = document.createElement("span");
    cell.className = "cell";
    const entry = layout.slots[startSlot + i];
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
    const column = 20 - Math.floor(i / 20);
    cell.style.gridColumn = String(column > 10 ? column + 1 : column);
    cell.style.gridRow = String(i % 20 + 1);
    paper.appendChild(cell);
  }
  return paper;
}

function preparePrintPages() {
  const layout = layoutCharacters(characters(documentState.body));
  const pageTotal = Math.max(1, Math.ceil(layout.usedSlots / PAGE_SIZE));
  const fragment = document.createDocumentFragment();
  for (let printPage = 0; printPage < pageTotal; printPage++) {
    const sheet = document.createElement("article");
    sheet.className = "print-sheet";
    const heading = document.createElement("header");
    heading.className = "print-heading";
    const title = document.createElement("span");
    title.textContent = documentState.title;
    const number = document.createElement("span");
    number.textContent = `${printPage + 1} / ${pageTotal}`;
    heading.append(title, number);
    sheet.append(heading, createPaperPage(layout, printPage * PAGE_SIZE, "paper print-paper"));
    fragment.appendChild(sheet);
  }
  els.printPages.replaceChildren(fragment);
}
function focusAt(index) {
  caret = Math.max(0, Math.min(index, characters(documentState.body).length));
  els.input.focus({ preventScroll: true });
  const unit = pointToUnit(documentState.body, caret);
  els.input.setSelectionRange(unit, unit);
  scheduleSave();
  render();
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
  const chars = characters(documentState.body);
  const layout = layoutCharacters(chars);
  const slot = Number(cell.dataset.slot);
  const rect = cell.getBoundingClientRect();
  const clickedAfterCharacter = event.clientY >= rect.top + rect.height / 2;
  const targetSlot = clickedAfterCharacter ? slot + 1 : slot;
  focusAt(indexAtOrNearSlot(layout, targetSlot, clickedAfterCharacter ? 1 : -1));
});
els.paper.addEventListener("focus", () => focusAt(caret));
els.input.addEventListener("beforeinput", () => {
  ensureHistory().pending = currentSnapshot();
});
els.input.addEventListener("input", () => {
  const history = ensureHistory();
  const previous = history.pending;
  history.pending = null;
  const normalized = normalizeVerticalText(els.input.value);
  if (normalized !== els.input.value) {
    const selectionStart = els.input.selectionStart;
    const selectionEnd = els.input.selectionEnd;
    els.input.value = normalized;
    els.input.setSelectionRange(selectionStart, selectionEnd);
  }
  documentState.body = normalized;
  if (previous && previous.body !== documentState.body) {
    history.undo.push(previous);
    history.redo.length = 0;
  }
  caret = unitToPoint(documentState.body, els.input.selectionStart);
  page = Math.floor(layoutCharacters(characters(documentState.body)).caretSlots[caret] / PAGE_SIZE);
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
  if (event.isComposing || event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
  const characterMovement = { ArrowUp: -1, ArrowDown: 1 }[event.key];
  if (characterMovement) {
    const targetIndex = caret + characterMovement;
    if (targetIndex < 0 || targetIndex > characters(documentState.body).length) return;
    event.preventDefault();
    focusAt(targetIndex);
    return;
  }

  const movement = { ArrowLeft: 20, ArrowRight: -20 }[event.key];
  if (!movement) return;

  const chars = characters(documentState.body);
  const layout = layoutCharacters(chars);
  const currentSlot = layout.caretSlots[caret];
  const targetSlot = currentSlot + movement;
  if (targetSlot < 0 || targetSlot > layout.usedSlots) return;

  event.preventDefault();
  focusAt(indexAtOrNearSlot(layout, targetSlot, Math.sign(movement)));
});
function syncCaretFromInput() {
  caret = unitToPoint(documentState.body, els.input.selectionStart);
  page = Math.floor(layoutCharacters(characters(documentState.body)).caretSlots[caret] / PAGE_SIZE);
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
  const layout = layoutCharacters(chars);
  const targetSlot = targetPage * PAGE_SIZE;
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
  preparePrintPages();
  window.print();
});
window.addEventListener("beforeprint", preparePrintPages);
window.addEventListener("beforeunload", save);

function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement; }
function updateFullscreenButton() {
  const active = Boolean(fullscreenElement());
  els.fullscreenButton.textContent = active ? "全画面を終了" : "全画面";
  els.fullscreenButton.setAttribute("aria-pressed", String(active));
}
els.fullscreenButton.addEventListener("click", async () => {
  try {
    if (fullscreenElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      await exit.call(document);
    } else {
      const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      if (!request) {
        showToast("Safariの共有メニューからホーム画面に追加すると全画面で使えます");
        return;
      }
      await request.call(document.documentElement);
    }
  } catch { showToast("全画面表示に切り替えられませんでした"); }
});
document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

const installButton = document.querySelector("#installApp");
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installButton.hidden = true;
  await installPrompt.prompt();
  installPrompt = null;
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton.hidden = true;
  showToast("400mojiをインストールしました");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      console.warn("オフライン機能を有効にできませんでした");
    });
  });
}

load();
render();
