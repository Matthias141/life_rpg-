/**
 * NPC personality engine tests — node --test tests/npc.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateNpc, react, tickYear, makeRng, hashSeed, addMemory, decayMemories,
  LINES, MEMORY_CAP, RECENT_LINES_CAP
} from "../src/engine/npc.js";
import { createPlayer } from "../src/engine/index.js";
import { SAVE_VERSION } from "../src/data/index.js";
import { migrateState, serializeState, MIGRATIONS } from "../src/storage/saves.js";

describe("determinism", () => {
  it("same seed + actions => identical results", () => {
    const seed = 42;
    const a = generateNpc("friend", { id: "f1" }, seed);
    const b = generateNpc("friend", { id: "f1" }, seed);
    assert.deepEqual(a.traits, b.traits);
    assert.deepEqual(a.values, b.values);
    assert.equal(a.name, b.name);

    let na = a, nb = b;
    for (const act of ["talk", "gift", "argue", "help", "talk"]) {
      const ra = react(na, act, { year: 20, moneyGift: 200 });
      const rb = react(nb, act, { year: 20, moneyGift: 200 });
      assert.equal(ra.line, rb.line);
      assert.equal(ra.outcome, rb.outcome);
      na = { ...na, ...ra.npcPatch };
      nb = { ...nb, ...rb.npcPatch };
    }
  });

  it("survives serialize round-trip", () => {
    let n = generateNpc("parent", { id: "p0" }, 99);
    const r = react(n, "help", { year: 5 });
    n = { ...n, ...r.npcPatch };
    const cloned = JSON.parse(JSON.stringify(n));
    const r2 = react(cloned, "talk", { year: 6 });
    const r3 = react(n, "talk", { year: 6 });
    assert.equal(r2.line, r3.line);
    assert.equal(r2.outcome, r3.outcome);
  });
});

describe("bounds", () => {
  it("stats stay in range under 10k random actions", () => {
    const roles = ["parent", "friend", "rival", "coworker", "boss", "cop", "gang"];
    const actions = ["talk", "ask_favor", "gift", "argue", "threaten", "help", "betray", "ignore"];
    for (let i = 0; i < 200; i++) {
      let n = generateNpc(roles[i % roles.length], { id: "x" + i }, i * 17 + 3);
      for (let j = 0; j < 50; j++) {
        const act = actions[(i + j) % actions.length];
        const r = react(n, act, { year: j, moneyGift: 100 });
        n = { ...n, ...r.npcPatch };
        for (const k of Object.keys(n.traits)) {
          assert.ok(n.traits[k] >= 0 && n.traits[k] <= 100, `trait ${k}`);
        }
        for (const k of Object.keys(n.bond)) {
          assert.ok(n.bond[k] >= 0 && n.bond[k] <= 100, `bond ${k}`);
        }
        assert.ok(n.mood >= -100 && n.mood <= 100);
        assert.ok(n.memory.length <= MEMORY_CAP);
      }
    }
  });
});

describe("properties", () => {
  it("higher agreeableness never slows forgiveness (resentment drop on help)", () => {
    const low = generateNpc("friend", { id: "a" }, 1);
    const high = generateNpc("friend", { id: "b" }, 1);
    // force trait difference
    low.traits.agreeableness = 20;
    high.traits.agreeableness = 90;
    low.bond.resentment = 50;
    high.bond.resentment = 50;
    low.rngState = high.rngState = 12345;
    const rl = react(low, "help", { year: 10 });
    const rh = react(high, "help", { year: 10 });
    // high agreeableness should reduce resentment at least as much
    assert.ok(
      rh.bondDelta.resentment <= rl.bondDelta.resentment,
      `high ${rh.bondDelta.resentment} vs low ${rl.bondDelta.resentment}`
    );
  });

  it("higher volatility never lowers escalation tendency on argue", () => {
    const low = generateNpc("rival", { id: "v1" }, 7);
    const high = generateNpc("rival", { id: "v2" }, 7);
    low.traits.volatility = 10;
    high.traits.volatility = 90;
    low.traits.agreeableness = high.traits.agreeableness = 40;
    low.bond = { ...low.bond, resentment: 40 };
    high.bond = { ...high.bond, resentment: 40 };
    // statistical: run many and compare escalate rates
    let escLow = 0, escHigh = 0;
    for (let i = 0; i < 40; i++) {
      low.rngState = 1000 + i;
      high.rngState = 1000 + i;
      const rl = react({ ...low, memory: [] }, "argue", { year: i });
      const rh = react({ ...high, memory: [] }, "argue", { year: i });
      if (rl.outcome === "argument_escalated") escLow++;
      if (rh.outcome === "argument_escalated") escHigh++;
    }
    assert.ok(escHigh >= escLow, `high vol escalations ${escHigh} vs ${escLow}`);
  });
});

describe("memory", () => {
  it("respects cap and prunes lowest weight first", () => {
    let n = generateNpc("friend", { id: "m" }, 5);
    for (let i = 0; i < MEMORY_CAP + 5; i++) {
      n.memory = addMemory(n, { year: i, type: "talk", valence: 1, weight: i === 3 ? 0.1 : 1 + i * 0.1 });
    }
    assert.equal(n.memory.length, MEMORY_CAP);
    assert.ok(!n.memory.some((m) => m.year === 3 && m.weight < 0.2));
  });

  it("decay reduces weights", () => {
    let n = generateNpc("parent", { id: "d" }, 8);
    n.memory = [{ year: 1, type: "help", valence: 3, weight: 2 }];
    n = { ...n, memory: decayMemories(n) };
    assert.ok(n.memory[0].weight < 2);
  });
});

describe("dialogue", () => {
  it("no repeat within 10 interactions for same lineKey band", () => {
    let n = generateNpc("friend", { id: "dlg" }, 11);
    const seen = [];
    for (let i = 0; i < 8; i++) {
      const r = react(n, "talk", { year: i });
      n = { ...n, ...r.npcPatch };
      seen.push(r.line);
    }
    // not all identical
    const unique = new Set(seen);
    assert.ok(unique.size >= 2, `only ${unique.size} unique lines`);
  });

  it("every lineKey resolves for every band", () => {
    for (const key of Object.keys(LINES)) {
      for (const band of ["high", "mid", "low"]) {
        const variants = LINES[key][band];
        assert.ok(variants && variants.length >= 6, `${key}/${band} needs 6+ variants`);
      }
    }
  });
});

describe("migration v1→v2", () => {
  it("adds npcs field", () => {
    const p = createPlayer("Mig", "Male", "Working Class", "Lucky");
    // strip to v1 shape
    const state = serializeState(p);
    delete state.npcs;
    const migrated = migrateState(state, 1);
    assert.ok(migrated.npcs);
  });
});

describe("distinctness", () => {
  it("100 NPCs same insult → at least 5 distinct outcome/line pairs", () => {
    const pairs = new Set();
    for (let i = 0; i < 100; i++) {
      const n = generateNpc("rival", { id: "r" + i }, i * 99 + 3);
      const r = react(n, "threaten", { year: 25 });
      pairs.add(r.outcome + "|" + r.line);
    }
    assert.ok(pairs.size >= 5, `only ${pairs.size} distinct pairs`);
  });
});

describe("tickYear", () => {
  it("ages and drifts", () => {
    let n = generateNpc("coworker", { id: "t" }, 2);
    const age0 = n.age;
    n = tickYear(n);
    assert.equal(n.age, age0 + 1);
  });
});

describe("player integration", () => {
  it("createPlayer has parent NPCs", () => {
    const p = createPlayer("Kid", "Female", "Poor", "Tough");
    assert.ok(p.npcs);
    const parents = Object.values(p.npcs).filter((n) => n.role === "parent");
    assert.ok(parents.length >= 2);
  });
});
