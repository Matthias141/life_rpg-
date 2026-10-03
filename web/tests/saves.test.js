/**
 * Save system tests — run with: node --test tests/saves.test.js
 * Uses a mock localStorage (no browser required).
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createSlotFromState, saveSlot, loadSlot, deleteSlot, listSlots,
  readIndex, autosave, serializeState, migrateState, MIGRATIONS,
  prepareImport, commitImport, exportSlotToJSON,
  _resetStorageForTests, getStorageWarning, emptyIndex
} from "../src/storage/saves.js";
import { createPlayer } from "../src/engine/index.js";
import { SAVE_VERSION, MAX_SLOTS } from "../src/data/index.js";

function mockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (mockStorage._quotaFail) {
        const e = new Error("quota");
        e.name = "QuotaExceededError";
        throw e;
      }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    _map: map
  };
}
mockStorage._quotaFail = false;

function freshPlayer(overrides = {}) {
  const p = createPlayer("Test", "Male", "Working Class", "Lucky");
  Object.assign(p, overrides);
  return p;
}

beforeEach(() => {
  mockStorage._quotaFail = false;
  _resetStorageForTests(mockStorage());
});

describe("serializeState", () => {
  it("produces plain JSON-safe object", () => {
    const p = freshPlayer();
    const s = serializeState(p);
    assert.equal(typeof s, "object");
    assert.equal(s.name, "Test");
    // round-trip
    const again = JSON.parse(JSON.stringify(s));
    assert.deepEqual(again, s);
  });

  it("includes lineage", () => {
    const p = freshPlayer();
    assert.ok(p.lineage);
    assert.equal(p.lineage.generation, 1);
    assert.ok(Array.isArray(p.lineage.ancestors));
  });
});

describe("round-trip save/load", () => {
  it("equals original state", () => {
    const p = freshPlayer({ age: 23, money: 12000, job: "Technician", jobLevel: 2 });
    const slot = createSlotFromState(p, "Test life");
    const saved = saveSlot(slot);
    assert.equal(saved.ok, true);

    const loaded = loadSlot(slot.id);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.slot.state.name, "Test");
    assert.equal(loaded.slot.state.age, 23);
    assert.equal(loaded.slot.state.money, 12000);
    assert.equal(loaded.slot.state.job, "Technician");
    assert.equal(loaded.slot.saveVersion, SAVE_VERSION);
    assert.deepEqual(loaded.slot.state.lineage, p.lineage);
  });
});

describe("autosave", () => {
  it("fires and updates state", () => {
    const p = freshPlayer({ age: 10 });
    const slot = createSlotFromState(p);
    saveSlot(slot);

    p.age = 11;
    p.money = 999;
    const result = autosave(slot.id, p, slot.updatedAt);
    assert.equal(result.ok, true);

    const loaded = loadSlot(slot.id);
    assert.equal(loaded.slot.state.age, 11);
    assert.equal(loaded.slot.state.money, 999);
  });

  it("marks completed on death", () => {
    const p = freshPlayer({ age: 80, alive: false, cause: "old age" });
    const slot = createSlotFromState(p);
    saveSlot(slot);
    autosave(slot.id, p, slot.updatedAt);
    const meta = listSlots().find((s) => s.id === slot.id);
    assert.equal(meta.completed, true);
  });
});

describe("migrations", () => {
  it("migrateState is identity when versions match", () => {
    const p = freshPlayer();
    const out = migrateState(serializeState(p), SAVE_VERSION);
    assert.equal(out.name, "Test");
  });

  it("loads a hypothetical older save (v0) without crashing", () => {
    // Manually write a v0-shaped slot
    const store = globalThis.localStorage;
    const p = freshPlayer({ age: 5 });
    // strip lineage to simulate older format
    const state = serializeState(p);
    delete state.lineage;
    const oldSlot = {
      id: "old1",
      label: "Old",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      saveVersion: 0,
      appVersion: "0.9.0",
      state
    };
    store.setItem("liferpg:v1:slot:old1", JSON.stringify(oldSlot));
    // add to index
    const idx = emptyIndex();
    idx.slots.push({ id: "old1", label: "Old", name: "Test", age: 5, job: "Unemployed", updatedAt: oldSlot.updatedAt, completed: false });
    store.setItem("liferpg:v1:index", JSON.stringify(idx));

    const loaded = loadSlot("old1");
    assert.equal(loaded.ok, true);
    assert.equal(loaded.slot.saveVersion, SAVE_VERSION);
    assert.ok(loaded.slot.state.lineage, "lineage backfilled");
  });
});

describe("corruption & validation", () => {
  it("quarantines corrupted JSON", () => {
    const store = globalThis.localStorage;
    store.setItem("liferpg:v1:slot:bad", "{not json");
    const idx = emptyIndex();
    idx.slots.push({ id: "bad", label: "Bad", name: "X", age: 1, job: "Unemployed", updatedAt: new Date().toISOString(), completed: false });
    store.setItem("liferpg:v1:index", JSON.stringify(idx));

    const result = loadSlot("bad");
    assert.equal(result.ok, false);
    assert.equal(result.quarantined, true);
    assert.ok(store.getItem("liferpg:v1:corrupt:bad"));
    assert.equal(listSlots().find((s) => s.id === "bad"), undefined);
  });

  it("rejects missing state", () => {
    const store = globalThis.localStorage;
    store.setItem("liferpg:v1:slot:nostate", JSON.stringify({ id: "nostate", saveVersion: 1 }));
    const result = loadSlot("nostate");
    assert.equal(result.ok, false);
  });

  it("rejects newer-than-app version", () => {
    const store = globalThis.localStorage;
    const p = freshPlayer();
    const slot = {
      id: "future",
      label: "Future",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      saveVersion: SAVE_VERSION + 5,
      appVersion: "9.9.9",
      state: serializeState(p)
    };
    store.setItem("liferpg:v1:slot:future", JSON.stringify(slot));
    const result = loadSlot("future");
    assert.equal(result.ok, false);
    assert.match(result.error, /newer version/i);
  });
});

describe("import / export", () => {
  it("export produces valid JSON that import accepts", () => {
    const p = freshPlayer({ age: 30, money: 5000 });
    const slot = createSlotFromState(p);
    saveSlot(slot);
    const exp = exportSlotToJSON(slot.id);
    assert.equal(exp.ok, true);

    // clear storage and re-import
    _resetStorageForTests(mockStorage());
    const prepared = prepareImport(exp.json);
    assert.equal(prepared.ok, true);
    const committed = commitImport(prepared.slot);
    assert.equal(committed.ok, true);
    assert.equal(listSlots().length, 1);
  });

  it("import rejects malformed files", () => {
    assert.equal(prepareImport("not json").ok, false);
    assert.equal(prepareImport("{}").ok, false);
    assert.equal(prepareImport(JSON.stringify({ state: {}, saveVersion: "x" })).ok, false);
  });

  it("import does not overwrite without confirmation path", () => {
    const p = freshPlayer();
    const slot = createSlotFromState(p);
    saveSlot(slot);
    const exp = exportSlotToJSON(slot.id);
    // re-import same id without overwrite → gets new id or requires existingId flag
    const prepared = prepareImport(exp.json);
    assert.equal(prepared.ok, true);
    // existingId should be set because same id is in list
    assert.equal(prepared.existingId, slot.id);
    // commit without overwrite creates duplicate with new id if we force
    // (commitImport without overwriteId still uses same id unless collision handled)
    // Our commitImport with no overwriteId will keep id if unique after check —
    // force a second slot by clearing existingId path:
    prepared.slot.id = "brand-new-id";
    const r = commitImport(prepared.slot);
    assert.equal(r.ok, true);
    assert.equal(listSlots().length, 2);
  });
});

describe("quota and unavailable storage", () => {
  it("reports quota exceeded", () => {
    mockStorage._quotaFail = true;
    _resetStorageForTests(mockStorage());
    // first probe may also fail
    const p = freshPlayer();
    const slot = createSlotFromState(p);
    const result = saveSlot(slot);
    // either unavailable from probe or quota on write
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  it("handles missing localStorage", () => {
    _resetStorageForTests(null);
    // redefine localStorage to throw
    Object.defineProperty(globalThis, "localStorage", {
      get() { throw new Error("denied"); },
      configurable: true
    });
    // re-import module behavior: getStorageWarning after a call
    const p = freshPlayer();
    const slot = createSlotFromState(p);
    const result = saveSlot(slot);
    assert.equal(result.ok, false);
  });
});

describe("slot cap", () => {
  it("refuses more than MAX_SLOTS", () => {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const p = freshPlayer({ name: "P" + i });
      const slot = createSlotFromState(p);
      // force unique ids
      slot.id = "cap" + i;
      const r = saveSlot(slot);
      assert.equal(r.ok, true, `slot ${i} should save`);
    }
    const p = freshPlayer({ name: "Overflow" });
    const slot = createSlotFromState(p);
    slot.id = "overflow";
    const r = saveSlot(slot);
    assert.equal(r.ok, false);
    assert.match(r.error, /Maximum/);
  });
});

describe("conflict detection", () => {
  it("warns when expectUpdatedAt is older than stored", () => {
    const p = freshPlayer();
    const slot = createSlotFromState(p);
    saveSlot(slot);
    // simulate another tab saving later
    const later = { ...slot, updatedAt: new Date(Date.now() + 60000).toISOString(), state: serializeState({ ...p, money: 1 }) };
    saveSlot(later);

    // try to save with old timestamp
    p.money = 999;
    const result = autosave(slot.id, p, slot.updatedAt);
    assert.equal(result.ok, false);
    assert.equal(result.conflict, true);
  });
});
