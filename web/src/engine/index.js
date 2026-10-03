/**
 * Pure game engine — no DOM. All functions take/return state or use a mutable P reference
 * that the UI layer owns.
 */

import { BACKGROUNDS, TRAITS, JOBS, CRIMES, NAMES } from "../data/index.js";
import { ensureFamilyNpcs, tickYear, hashSeed } from "./npc.js";

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
export function chance(pct) { return Math.random() * 100 < pct; }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export function roll(stat, difficulty = 50, bonus = 0) {
  const ch = clamp(35 + (stat - 10) * 3 + bonus, 5, 95);
  const r = rand(1, 100);
  if (r <= Math.max(3, ch / 8)) return { ok: true, deg: 2, chance: ch };
  if (r <= ch) return { ok: true, deg: 1, chance: ch };
  if (r >= 97) return { ok: false, deg: -1, chance: ch };
  return { ok: false, deg: 0, chance: ch };
}

function uid() {
  return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createPlayer(name, gender, bg, trait) {
  const p = {
    name, gender, background: bg, age: 0, alive: true, cause: null,
    strength: 8, intelligence: 8, charisma: 8, agility: 8, luck: 8, willpower: 8,
    health: 100, happiness: 65, stress: 0, money: 0,
    education: 0, eduLevel: "None",
    reputation: 50, street: 0, corp: 0, heat: 0,
    crime: 0, work: 0, combat: 0,
    job: "Unemployed", jobLevel: 0,
    inPrison: false, prisonYears: 0, prisonFaction: null,
    gang: null, military: false, retired: false,
    partner: null, children: 0, friends: [],
    inventory: [], vehicle: null, property: null, business: false,
    addiction: null, addictionLevel: 0, injury: null,
    traits: [trait], flags: {},
    lineage: { dynastyId: uid(), generation: 1, ancestors: [] },
    npcs: {}
  };
  const b = BACKGROUNDS[bg] || {};
  for (const k in b) {
    if (k === "crime") p.crime += b[k];
    else if (k === "street") p.street += b[k];
    else if (k === "heat") p.heat += b[k];
    else if (p[k] !== undefined) p[k] += b[k];
  }
  const t = TRAITS[trait] || {};
  for (const k in t) {
    if (k === "crime") p.crime += t[k];
    else if (k === "work") p.work += t[k];
    else if (p[k] !== undefined) p[k] += t[k];
  }
  p.health = clamp(p.health, 0, 100);
  p.happiness = clamp(p.happiness, 0, 100);
  p.npcs = ensureFamilyNpcs(p, hashSeed(name + bg + trait));
  return p;
}

/**
 * Mutate P[stat] by amount. Returns a log line or null.
 * Does not touch DOM.
 */
export function mod(P, stat, amount, reason) {
  if (P[stat] === undefined) return null;
  const old = P[stat];
  if (["health", "happiness", "stress"].includes(stat)) P[stat] = clamp(old + amount, 0, 100);
  else if (["heat", "street", "corp", "reputation"].includes(stat)) P[stat] = clamp(old + amount, 0, 100);
  else if (stat === "money") P[stat] = Math.max(0, old + amount);
  else P[stat] = Math.max(0, old + amount);
  if (amount !== 0 && reason) {
    const sign = amount > 0 ? "+" : "";
    return { msg: `${stat}: ${sign}${amount} (${reason})`, cls: amount > 0 ? "good" : "bad" };
  }
  return null;
}

/**
 * Apply passive year effects and death checks.
 * Returns { died: boolean }
 */
export function advanceYear(P) {
  P.age++;
  if (P.age > 40 && P.age % 5 === 0) mod(P, "health", -2, "aging");
  if (P.age > 65) mod(P, "health", -2, "old age");
  if (P.happiness < 25) { mod(P, "stress", 6, "misery"); mod(P, "health", -2, "depression"); }
  if (P.stress > 75) {
    mod(P, "happiness", -4, "high stress");
    if (chance(12)) mod(P, "health", -6, "stress illness");
  }
  if (P.heat > 0 && !P.inPrison) {
    mod(P, "heat", -(3 + (P.inventory.includes("Fake ID") ? 2 : 0)));
  }
  if (P.addiction) {
    mod(P, "money", -rand(200, 900), P.addiction + " costs");
    mod(P, "health", -rand(1, 4), "addiction");
    P.addictionLevel = Math.min(10, P.addictionLevel + (chance(40) ? 1 : 0));
    if (P.addictionLevel >= 8 && chance(12)) mod(P, "health", -18, "severe episode");
  }
  if (P.property === "Apartment") P.money = Math.max(0, P.money - 1200);

  // NPC yearly ticks
  if (P.npcs) {
    const next = {};
    for (const id of Object.keys(P.npcs)) {
      next[id] = tickYear(P.npcs[id]);
    }
    P.npcs = next;
  }

  if (P.health <= 0) {
    P.alive = false;
    P.cause = P.injury || "poor health";
    return { died: true };
  }
  if (P.age >= 98 && chance(30 + (P.age - 98) * 8)) {
    P.alive = false;
    P.cause = "old age";
    return { died: true };
  }
  return { died: false };
}

export { BACKGROUNDS, TRAITS, JOBS, CRIMES, NAMES };
