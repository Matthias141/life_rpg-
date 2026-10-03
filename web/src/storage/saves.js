/**
 * Versioned multi-slot save system for Life RPG Simulator.
 * Keys:
 *   liferpg:v1:index          → { slots: [{id, label, name, age, job, updatedAt, completed}], lastPlayedId }
 *   liferpg:v1:slot:<id>      → full SlotRecord
 *   liferpg:v1:corrupt:<id>   → raw string of corrupted payload
 */

import { APP_VERSION, SAVE_VERSION, MAX_SLOTS } from "../data/index.js";

const INDEX_KEY = "liferpg:v1:index";
const slotKey = (id) => `liferpg:v1:slot:${id}`;
const corruptKey = (id) => `liferpg:v1:corrupt:${id}`;

/** Ordered migrations: index = saveVersion the migration upgrades FROM. */
export const MIGRATIONS = [
  // v0 → v1 example placeholder (no-op; real v0 never existed)
  // When SAVE_VERSION becomes 2, push a function that transforms state.
];

/* ---------- storage availability ---------- */

let _storageWarning = null; // set once when we detect problems

export function getStorageWarning() {
  return _storageWarning;
}

function ls() {
  try {
    const s = globalThis.localStorage;
    if (!s) throw new Error("localStorage unavailable");
    // probe
    const k = "__liferpg_probe__";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch (e) {
    _storageWarning = e.name === "QuotaExceededError"
      ? "Storage full — saves disabled. Use Export to keep your progress."
      : "Storage unavailable (private mode?) — saves disabled. Use Export to keep your progress.";
    return null;
  }
}

/* ---------- helpers ---------- */

function uid() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowISO() {
  return new Date().toISOString();
}

/** Deep-clone via JSON so state is always plain. */
export function serializeState(P) {
  return JSON.parse(JSON.stringify(P));
}

export function emptyIndex() {
  return { slots: [], lastPlayedId: null };
}

/* ---------- index ---------- */

export function readIndex() {
  const store = ls();
  if (!store) return emptyIndex();
  try {
    const raw = store.getItem(INDEX_KEY);
    if (!raw) return emptyIndex();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.slots)) return emptyIndex();
    return parsed;
  } catch {
    return emptyIndex();
  }
}

function writeIndex(index) {
  const store = ls();
  if (!store) return false;
  try {
    store.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      _storageWarning = "Storage full — could not save. Use Export.";
    }
    return false;
  }
}

/* ---------- migrations ---------- */

export function migrateState(state, fromVersion) {
  let v = fromVersion;
  let s = state;
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v]; // upgrades from v → v+1
    if (typeof fn === "function") {
      s = fn(s);
    }
    v += 1;
  }
  return s;
}

/* ---------- slot CRUD ---------- */

/**
 * Load a slot by id.
 * Returns { ok, slot?, error?, quarantined? }
 */
export function loadSlot(id) {
  const store = ls();
  if (!store) return { ok: false, error: "Storage unavailable" };

  const raw = store.getItem(slotKey(id));
  if (raw == null) return { ok: false, error: "Slot not found" };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // quarantine
    try { store.setItem(corruptKey(id), raw); store.removeItem(slotKey(id)); } catch { /* ignore */ }
    // remove from index
    const idx = readIndex();
    idx.slots = idx.slots.filter((s) => s.id !== id);
    if (idx.lastPlayedId === id) idx.lastPlayedId = idx.slots[0]?.id ?? null;
    writeIndex(idx);
    return { ok: false, error: `Slot "${id}" was corrupted and has been quarantined.`, quarantined: true };
  }

  // shape check
  if (!parsed || typeof parsed !== "object" || !parsed.state || typeof parsed.state !== "object") {
    return { ok: false, error: "Slot has invalid shape" };
  }

  if (typeof parsed.saveVersion !== "number") {
    return { ok: false, error: "Slot missing saveVersion" };
  }

  if (parsed.saveVersion > SAVE_VERSION) {
    return {
      ok: false,
      error: `This save was created with a newer version (save v${parsed.saveVersion}, app supports v${SAVE_VERSION}). Update the app to load it.`
    };
  }

  // migrate if needed
  if (parsed.saveVersion < SAVE_VERSION) {
    parsed.state = migrateState(parsed.state, parsed.saveVersion);
    parsed.saveVersion = SAVE_VERSION;
  }

  // ensure lineage exists
  if (!parsed.state.lineage) {
    parsed.state.lineage = {
      dynastyId: uid(),
      generation: 1,
      ancestors: []
    };
  }

  return { ok: true, slot: parsed };
}

/**
 * Save / overwrite a slot.
 * opts: { expectUpdatedAt } — if provided and storage has a newer value, refuse.
 * Returns { ok, error?, conflict? }
 */
export function saveSlot(slotRecord, opts = {}) {
  const store = ls();
  if (!store) return { ok: false, error: getStorageWarning() || "Storage unavailable" };

  // conflict detection (two tabs)
  if (opts.expectUpdatedAt) {
    try {
      const existingRaw = store.getItem(slotKey(slotRecord.id));
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        if (existing.updatedAt && existing.updatedAt > opts.expectUpdatedAt) {
          return {
            ok: false,
            conflict: true,
            error: "This life was saved more recently in another tab. Reload to avoid overwriting."
          };
        }
      }
    } catch { /* ignore parse errors for conflict check */ }
  }

  const index = readIndex();
  const meta = {
    id: slotRecord.id,
    label: slotRecord.label,
    name: slotRecord.state?.name ?? "?",
    age: slotRecord.state?.age ?? 0,
    job: slotRecord.state?.job ?? "Unemployed",
    updatedAt: slotRecord.updatedAt,
    completed: slotRecord.state?.alive === false
  };

  const existingIdx = index.slots.findIndex((s) => s.id === slotRecord.id);
  if (existingIdx >= 0) {
    index.slots[existingIdx] = meta;
  } else {
    if (index.slots.length >= MAX_SLOTS) {
      return { ok: false, error: `Maximum of ${MAX_SLOTS} lives reached. Delete one before saving a new life.` };
    }
    index.slots.unshift(meta);
  }
  index.lastPlayedId = slotRecord.id;

  try {
    store.setItem(slotKey(slotRecord.id), JSON.stringify(slotRecord));
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      _storageWarning = "Storage full — could not save. Use Export.";
      return { ok: false, error: _storageWarning };
    }
    return { ok: false, error: String(e.message || e) };
  }

  writeIndex(index);
  return { ok: true };
}

/**
 * Create a new slot from a player state.
 */
export function createSlotFromState(P, label) {
  const id = uid();
  const ts = nowISO();
  return {
    id,
    label: label || `${P.name}'s life`,
    createdAt: ts,
    updatedAt: ts,
    saveVersion: SAVE_VERSION,
    appVersion: APP_VERSION,
    state: serializeState(P)
  };
}

/**
 * Autosave helper — updates updatedAt and writes.
 * Returns same shape as saveSlot.
 */
export function autosave(slotId, P, expectUpdatedAt) {
  if (!slotId) return { ok: false, error: "No active slot" };
  const loaded = loadSlot(slotId);
  // Even if load fails for migration reasons, build a fresh record
  const base = loaded.ok ? loaded.slot : {
    id: slotId,
    label: `${P.name}'s life`,
    createdAt: nowISO(),
    saveVersion: SAVE_VERSION,
    appVersion: APP_VERSION
  };
  base.updatedAt = nowISO();
  base.state = serializeState(P);
  base.saveVersion = SAVE_VERSION;
  base.appVersion = APP_VERSION;
  if (!P.alive) {
    base.label = `${P.name} (completed, age ${P.age})`;
  }
  return saveSlot(base, { expectUpdatedAt });
}

export function deleteSlot(id) {
  const store = ls();
  if (!store) return { ok: false, error: "Storage unavailable" };
  store.removeItem(slotKey(id));
  const index = readIndex();
  index.slots = index.slots.filter((s) => s.id !== id);
  if (index.lastPlayedId === id) index.lastPlayedId = index.slots[0]?.id ?? null;
  writeIndex(index);
  return { ok: true };
}

export function listSlots() {
  return readIndex().slots;
}

export function getMostRecentSlotId() {
  return readIndex().lastPlayedId;
}

/* ---------- export / import ---------- */

export function exportSlotToJSON(id) {
  const result = loadSlot(id);
  if (!result.ok) return result;
  return {
    ok: true,
    filename: `liferpg-${result.slot.state.name || "save"}-${result.slot.id}.json`,
    json: JSON.stringify(result.slot, null, 2)
  };
}

/**
 * Validate and prepare an imported payload.
 * Does NOT write. Caller must confirm overwrite.
 * Returns { ok, slot?, error?, existingId? }
 */
export function prepareImport(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "File is not valid JSON" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Invalid save file shape" };
  }
  if (!parsed.state || typeof parsed.state !== "object") {
    return { ok: false, error: "Save file missing state" };
  }
  if (typeof parsed.saveVersion !== "number") {
    return { ok: false, error: "Save file missing saveVersion" };
  }
  if (parsed.saveVersion > SAVE_VERSION) {
    return {
      ok: false,
      error: `Save is from a newer version (v${parsed.saveVersion}). This app supports up to v${SAVE_VERSION}.`
    };
  }

  // migrate
  if (parsed.saveVersion < SAVE_VERSION) {
    parsed.state = migrateState(parsed.state, parsed.saveVersion);
    parsed.saveVersion = SAVE_VERSION;
  }
  if (!parsed.state.lineage) {
    parsed.state.lineage = { dynastyId: uid(), generation: 1, ancestors: [] };
  }

  // assign new id unless caller wants to overwrite a specific one
  const existingId = parsed.id && listSlots().some((s) => s.id === parsed.id) ? parsed.id : null;

  return {
    ok: true,
    slot: {
      ...parsed,
      id: parsed.id || uid(),
      updatedAt: nowISO(),
      appVersion: APP_VERSION,
      saveVersion: SAVE_VERSION
    },
    existingId
  };
}

/**
 * Commit an import. If overwriteId is set, replaces that slot; otherwise creates new.
 */
export function commitImport(slot, { overwriteId = null } = {}) {
  if (overwriteId) {
    slot.id = overwriteId;
  } else {
    // ensure unique id
    if (listSlots().some((s) => s.id === slot.id)) {
      slot.id = uid();
    }
  }
  slot.updatedAt = nowISO();
  return saveSlot(slot);
}

/* ---------- test helpers (node) ---------- */

export function _resetStorageForTests(mockStore) {
  // Allow tests to inject a mock by replacing globalThis.localStorage
  if (mockStore !== undefined) {
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStore,
      configurable: true,
      writable: true
    });
  }
  _storageWarning = null;
}
