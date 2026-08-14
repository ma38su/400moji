import { LEGACY_STORAGE_KEY, STORAGE_KEY } from "./app-config.js";

const HALF_WIDTH_REPLACEMENTS = { "(": "（", ")": "）" };

export function normalizeVerticalText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[()]/g, character => HALF_WIDTH_REPLACEMENTS[character]);
}

export function normalizeName(name) {
  return String(name || "").trim();
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDocument(title, source = {}, idFactory = createId) {
  return {
    id: idFactory(),
    title: normalizeName(title),
    body: normalizeVerticalText(source.body),
    page: Number(source.page) || 0,
    updatedAt: source.updatedAt || null
  };
}

export function nameExists(library, name, exceptId = null) {
  const normalized = normalizeName(name);
  return library.documents.some(document => document.id !== exceptId && document.title === normalized);
}

export function uniqueName(library, baseName) {
  const base = normalizeName(baseName) || "無題の原稿";
  if (!nameExists(library, base)) return base;
  let number = 2;
  while (nameExists(library, `${base} ${number}`)) number++;
  return `${base} ${number}`;
}

export function loadLibrary(storage, idFactory = createId) {
  let loadError = false;
  let library = { activeId: "", documents: [] };
  try {
    const savedLibrary = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
    if (savedLibrary?.documents?.length) {
      library = savedLibrary;
    } else {
      const legacy = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) || "null") || {};
      const migrated = createDocument(legacy.title || "無題の原稿", legacy, idFactory);
      library = { activeId: migrated.id, documents: [migrated] };
    }
  } catch {
    loadError = true;
  }

  if (!library.documents.length) {
    const initial = createDocument("無題の原稿", {}, idFactory);
    library = { activeId: initial.id, documents: [initial] };
  }
  return { library, loadError };
}

export function saveLibrary(storage, library) {
  storage.setItem(STORAGE_KEY, JSON.stringify(library));
}
