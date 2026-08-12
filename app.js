import "./styles.css";

const STORAGE_KEY = "yonhyakuji.document.v1";
const COOKIE_KEY = "yonhyakuji_backup";
const PAGE_SIZE = 400;
const VERTICAL_PUNCTUATION = new Set(["。", "、"]);

const els = {
  paper: document.querySelector("#paper"), input: document.querySelector("#input"),
  title: document.querySelector("#title"), saveStatus: document.querySelector("#saveStatus"),
  charCount: document.querySelector("#charCount"), sheetCount: document.querySelector("#sheetCount"),
  meterFill: document.querySelector("#meterFill"), pageLabel: document.querySelector("#pageLabel"),
  pageCount: document.querySelector("#pageCount"), prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"), toast: document.querySelector("#toast")
};

let documentState = { title: "無題の原稿", body: "", caret: 0, page: 0, updatedAt: null };
let page = 0;
let caret = 0;
let saveTimer;

function characters(text) { return Array.from(text.replace(/\r/g, "")); }
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
function getCookie(name) {
  const hit = document.cookie.split("; ").find(row => row.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : null;
}
function load() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || getCookie(COOKIE_KEY);
    if (saved) documentState = { ...documentState, ...JSON.parse(saved) };
  } catch { showToast("保存データを読み込めませんでした"); }
  els.title.value = documentState.title;
  els.input.value = documentState.body;
  const length = characters(documentState.body).length;
  caret = Math.max(0, Math.min(Number(documentState.caret) || 0, length));
  page = Math.max(0, Number(documentState.page) || Math.floor(caret / PAGE_SIZE));
}
function scheduleSave() {
  els.saveStatus.textContent = "保存中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 350);
}
function save() {
  documentState.caret = caret;
  documentState.page = page;
  documentState.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documentState));
    // Cookieは約4KBまでなので、全文の原本はlocalStorage、Cookieは復旧用抜粋とする。
    const backup = JSON.stringify({
      title: documentState.title.slice(0, 80),
      body: characters(documentState.body).slice(0, 250).join(""),
      caret: Math.min(caret, 250),
      page: 0,
      updatedAt: documentState.updatedAt,
      truncated: characters(documentState.body).length > 250
    });
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(backup)}; max-age=31536000; path=/; SameSite=Lax`;
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
    const index = entry?.index ?? layout.slotToIndex[absoluteSlot] ?? chars.length;
    cell.textContent = value;
    if (VERTICAL_PUNCTUATION.has(value)) cell.classList.add("punctuation");
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
    cell.dataset.index = index;
    fragment.appendChild(cell);
  }
  els.paper.appendChild(fragment);
  els.charCount.textContent = chars.filter(c => c !== "\n").length.toLocaleString("ja-JP");
  els.sheetCount.textContent = `${(layout.usedSlots / PAGE_SIZE).toFixed(1)} 枚 / 400字詰め`;
  els.meterFill.style.width = `${Math.min(100, (layout.usedSlots % PAGE_SIZE || (layout.usedSlots ? PAGE_SIZE : 0)) / PAGE_SIZE * 100)}%`;
  els.pageLabel.textContent = `${page + 1}枚目`;
  els.pageCount.textContent = `${page + 1} / ${pages}`;
  els.prevPage.disabled = page === 0;
  els.nextPage.disabled = page === pages - 1;
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

els.paper.addEventListener("click", event => {
  const cell = event.target.closest(".cell");
  focusAt(cell ? Number(cell.dataset.index) : caret);
});
els.paper.addEventListener("focus", () => focusAt(caret));
els.input.addEventListener("input", () => {
  documentState.body = els.input.value;
  caret = unitToPoint(documentState.body, els.input.selectionStart);
  page = Math.floor(layoutCharacters(characters(documentState.body)).caretSlots[caret] / PAGE_SIZE);
  scheduleSave(); render();
});
function syncCaretFromInput() {
  caret = unitToPoint(documentState.body, els.input.selectionStart);
  page = Math.floor(layoutCharacters(characters(documentState.body)).caretSlots[caret] / PAGE_SIZE);
  scheduleSave(); render();
}
els.input.addEventListener("keyup", syncCaretFromInput);
els.input.addEventListener("click", syncCaretFromInput);
els.input.addEventListener("blur", render);
els.title.addEventListener("input", () => { documentState.title = els.title.value; scheduleSave(); });
function moveToPage(targetPage) {
  const chars = characters(documentState.body);
  const layout = layoutCharacters(chars);
  const targetSlot = targetPage * PAGE_SIZE;
  page = targetPage;
  focusAt(layout.slotToIndex[targetSlot] ?? chars.length);
}
els.prevPage.addEventListener("click", () => moveToPage(page - 1));
els.nextPage.addEventListener("click", () => moveToPage(page + 1));
document.querySelector("#exportText").addEventListener("click", () => download(`${safeName()}.txt`, documentState.body, "text/plain;charset=utf-8"));
document.querySelector("#exportJson").addEventListener("click", () => download(`${safeName()}.json`, JSON.stringify(documentState, null, 2), "application/json"));
document.querySelector("#importJson").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (typeof imported.body !== "string") throw new Error();
    documentState = { title: String(imported.title || "無題の原稿"), body: imported.body, caret: 0, page: 0, updatedAt: imported.updatedAt || null };
    els.title.value = documentState.title; els.input.value = documentState.body; caret = 0; page = 0; save(); render(); showToast("原稿を読み込みました");
  } catch { showToast("このJSONは読み込めません"); }
  event.target.value = "";
});
document.querySelector("#printButton").addEventListener("click", () => window.print());
window.addEventListener("beforeunload", save);

load();
render();
