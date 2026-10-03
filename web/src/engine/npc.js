/**
 * Deterministic NPC personality engine.
 * Pure functions, seeded RNG per NPC, plain JSON state under P.npcs.
 */

import { NAMES } from "../data/index.js";

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

const MEMORY_CAP = 20;
const RECENT_LINES_CAP = 10;

/* ---------- seeded RNG (mulberry32) ---------- */

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function rngPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------- fixed pools ---------- */

const FORMALITY = ["plain", "polite", "rough", "clipped"];
const VERBOSITY = ["terse", "normal", "wordy"];
const QUIRKS = [
  "calls you kid",
  "swears softly",
  "uses your full name",
  "asks rhetorical questions",
  "pauses mid-sentence",
  "mentions the weather",
  "quotes their mother",
  "counts on fingers"
];

const GOALS = ["get_rich", "protect_family", "climb_ranks", "revenge", "stay_safe", "be_liked"];

const ROLE_AGE = {
  parent: [28, 45],
  sibling: [0, 12],
  friend: [12, 40],
  rival: [14, 40],
  coworker: [22, 55],
  boss: [35, 60],
  cop: [25, 50],
  gang: [16, 45]
};

/** Grammar fragments: lineKey -> { band -> [variants...] } band = mood/bond tier */
const LINES = {
  talk_warm: {
    high: [
      "Good to see you. How have you been holding up?",
      "Hey — I was just thinking about you.",
      "Come on in. You look like you need a coffee.",
      "There you are. Sit down a minute.",
      "Always a bright spot. What's the news?",
      "I've missed these chats. Talk to me."
    ],
    mid: [
      "Oh, it's you. What's up?",
      "Hey. Didn't expect you today.",
      "Alright then. How's life treating you?",
      "You again. Fine — say what you need.",
      "Hmm. Go on.",
      "I'm listening."
    ],
    low: [
      "What do you want?",
      "Make it quick.",
      "I'm busy.",
      "This better be important.",
      "You've got a minute. Use it.",
      "Spit it out."
    ]
  },
  talk_cold: {
    high: [
      "I suppose we should talk.",
      "Fine. I'm here.",
      "Don't waste the goodwill.",
      "Say what you came to say.",
      "I'm not in the mood for small talk.",
      "Keep it civil."
    ],
    mid: [
      "What.",
      "Yeah?",
      "Talk.",
      "I'm waiting.",
      "Well?",
      "Get on with it."
    ],
    low: [
      "Leave me alone.",
      "Not interested.",
      "Go away.",
      "I've heard enough from you.",
      "Don't.",
      "No."
    ]
  },
  favor_yes: {
    high: [
      "For you? Of course.",
      "I can do that. You'd do the same.",
      "Alright — but you owe me one later.",
      "Consider it done.",
      "I've got your back on this.",
      "Say no more. I'll handle it."
    ],
    mid: [
      "Maybe. What's in it for me?",
      "I could… if you make it worth my while.",
      "Fine, this once.",
      "Don't make a habit of it.",
      "Alright, but carefully.",
      "I'll think about the details."
    ],
    low: [
      "Why would I?",
      "Not a chance.",
      "You must be joking.",
      "Earn that first.",
      "No favors. Not from me.",
      "Ask someone else."
    ]
  },
  gift_happy: {
    high: [
      "You didn't have to — but thank you.",
      "This means more than you know.",
      "You're too generous. I won't forget.",
      "Wow. Okay. I'm touched.",
      "Keep this up and I'll start expecting it.",
      "You know me well."
    ],
    mid: [
      "Huh. Thanks, I guess.",
      "Appreciated.",
      "Not bad.",
      "I'll take it.",
      "Alright then.",
      "Interesting choice."
    ],
    low: [
      "Trying to buy me off?",
      "Keep your trinkets.",
      "This changes nothing.",
      "Don't insult me.",
      "Put it away.",
      "Nice try."
    ]
  },
  argue_escalate: {
    high: [
      "You want a fight? Fine.",
      "I've had enough of your tone.",
      "Say that again.",
      "You're crossing a line.",
      "Don't push me.",
      "This is how people get hurt."
    ],
    mid: [
      "Watch yourself.",
      "We're done being polite.",
      "I disagree — strongly.",
      "That's rich, coming from you.",
      "Back off.",
      "You're wrong and you know it."
    ],
    low: [
      "Whatever.",
      "Not worth it.",
      "I'm walking away.",
      "Believe what you want.",
      "Fine. Have the last word.",
      "I'm tired of this."
    ]
  },
  threaten_fear: {
    high: [
      "You wouldn't dare.",
      "Try it and see what happens.",
      "I'm not afraid of you.",
      "Big talk.",
      "You've made an enemy today.",
      "Remember this moment."
    ],
    mid: [
      "Alright, alright — ease up.",
      "No need for that.",
      "I hear you. Loud and clear.",
      "Point taken.",
      "Don't make me regret listening.",
      "Fine. I'll be careful."
    ],
    low: [
      "Okay! Okay. I'll do what you want.",
      "Please — don't.",
      "I get it. I'll stay out of your way.",
      "You win. Just stop.",
      "I'm sorry. Truly.",
      "I'll disappear if that's what you need."
    ]
  },
  help_grateful: {
    high: [
      "You saved me. I won't forget.",
      "I owe you. Really.",
      "People like you are rare.",
      "Thank you. From the bottom.",
      "That meant everything.",
      "I'm in your debt."
    ],
    mid: [
      "Thanks. That helped.",
      "Appreciate it.",
      "You didn't have to, but thanks.",
      "Noted.",
      "Good looking out.",
      "I'll remember."
    ],
    low: [
      "Sure. Whatever.",
      "I could've managed.",
      "Don't expect a parade.",
      "Fine.",
      "Okay.",
      "Hmm."
    ]
  },
  betray_hurt: {
    high: [
      "After everything? You?",
      "I trusted you.",
      "We're done.",
      "I won't forget this.",
      "You chose this.",
      "Don't come back."
    ],
    mid: [
      "I should've seen it coming.",
      "Disappointing.",
      "So that's how it is.",
      "Noted for next time.",
      "You burned a bridge.",
      "Stay away for a while."
    ],
    low: [
      "Figures.",
      "Expected as much.",
      "Is that all?",
      "Cute.",
      "Try harder next time.",
      "I've had worse."
    ]
  },
  memory_callback: {
    high: [
      "You still owe me from {year}.",
      "I haven't forgotten {year}.",
      "Remember when you {deed}? I do.",
      "Back in {year} you stood by me.",
      "That thing in {year} still matters.",
      "I've carried {year} with me."
    ],
    mid: [
      "About {year}…",
      "We never settled {year}.",
      "{year} left a mark.",
      "I think about {year} sometimes.",
      "Since {year}, things changed.",
      "You know what happened in {year}."
    ],
    low: [
      "Don't bring up {year}.",
      "{year} is closed.",
      "I'm past {year}.",
      "Forget {year}.",
      "{year} meant nothing.",
      "Move on from {year}."
    ]
  },
  ignore_react: {
    high: [
      "Silence speaks volumes.",
      "Fine. Be that way.",
      "I noticed.",
      "Suit yourself.",
      "I'll remember the quiet.",
      "Distance it is."
    ],
    mid: [
      "Okay then.",
      "Busy, I guess.",
      "Another time.",
      "Right.",
      "Sure.",
      "Hmm."
    ],
    low: [
      "Good. Stay gone.",
      "Best for both of us.",
      "Finally.",
      "Peace.",
      "Don't start now.",
      "…"
    ]
  }
};

function bandFromScore(score) {
  if (score >= 40) return "high";
  if (score <= -20) return "low";
  return "mid";
}

function moodBand(mood) {
  if (mood >= 30) return "high";
  if (mood <= -30) return "low";
  return "mid";
}

/* ---------- generation ---------- */

export function generateNpc(role, context = {}, seed) {
  const rng = makeRng(seed >>> 0);
  const [ageLo, ageHi] = ROLE_AGE[role] || [20, 40];
  const age = context.age != null ? context.age : rngInt(rng, ageLo, ageHi);
  const name = context.name || rngPick(rng, NAMES);

  const traits = {
    openness: rngInt(rng, 15, 90),
    conscientiousness: rngInt(rng, 15, 90),
    extraversion: rngInt(rng, 15, 90),
    agreeableness: rngInt(rng, 15, 90),
    volatility: rngInt(rng, 10, 85)
  };
  // role biases
  if (role === "parent") {
    traits.agreeableness = clamp(traits.agreeableness + 10, 0, 100);
    traits.conscientiousness = clamp(traits.conscientiousness + 10, 0, 100);
  }
  if (role === "rival" || role === "gang") {
    traits.volatility = clamp(traits.volatility + 15, 0, 100);
    traits.agreeableness = clamp(traits.agreeableness - 10, 0, 100);
  }
  if (role === "boss") {
    traits.conscientiousness = clamp(traits.conscientiousness + 10, 0, 100);
  }
  if (role === "cop") {
    traits.conscientiousness = clamp(traits.conscientiousness + 15, 0, 100);
  }

  const values = {
    ambition: rngInt(rng, 10, 90),
    loyalty: rngInt(rng, 10, 90),
    greed: rngInt(rng, 5, 85),
    honesty: rngInt(rng, 10, 90)
  };
  if (role === "parent") values.loyalty = clamp(values.loyalty + 15, 0, 100);
  if (role === "gang") values.greed = clamp(values.greed + 10, 0, 100);

  const voice = {
    formality: rngPick(rng, FORMALITY),
    verbosity: rngPick(rng, VERBOSITY),
    quirks: [rngPick(rng, QUIRKS), rngPick(rng, QUIRKS)].filter((v, i, a) => a.indexOf(v) === i)
  };

  const baselineMood = Math.round((traits.extraversion + traits.agreeableness - traits.volatility) / 3 - 20);
  const mood = clamp(baselineMood + rngInt(rng, -15, 15), -100, 100);

  const bond = {
    trust: role === "parent" ? rngInt(rng, 40, 75) : rngInt(rng, 20, 50),
    affection: role === "parent" || role === "sibling" ? rngInt(rng, 35, 70) : rngInt(rng, 10, 40),
    respect: role === "boss" || role === "cop" ? rngInt(rng, 30, 60) : rngInt(rng, 15, 45),
    fear: role === "rival" || role === "gang" || role === "cop" ? rngInt(rng, 15, 50) : rngInt(rng, 0, 25),
    resentment: role === "rival" ? rngInt(rng, 20, 55) : rngInt(rng, 0, 20)
  };

  const goalPool = [...GOALS];
  const goals = [];
  goals.push(rngPick(rng, goalPool));
  if (rng() > 0.4) {
    const rest = goalPool.filter((g) => g !== goals[0]);
    goals.push(rngPick(rng, rest));
  }

  // capture remaining rng state as integer seed continuation
  const rngState = (Math.floor(rng() * 0xffffffff) >>> 0) || 1;

  return {
    id: context.id || `npc_${role}_${seed.toString(36)}`,
    name,
    age,
    role,
    traits,
    values,
    voice,
    mood,
    baselineMood,
    bond,
    memory: [],
    goals,
    recentLines: [],
    rngState,
    lineage: { parentIds: context.parentIds || [], childIds: context.childIds || [] }
  };
}

/* ---------- dialogue ---------- */

function pickLine(npc, lineKey, band, params = {}) {
  const table = LINES[lineKey];
  if (!table) return "…";
  const variants = table[band] || table.mid || Object.values(table)[0];
  if (!variants || !variants.length) return "…";

  const rng = makeRng(npc.rngState ^ hashSeed(lineKey + band + (npc.recentLines?.length || 0)));
  // avoid recent repeats
  const recent = new Set(npc.recentLines || []);
  let choices = variants.filter((v) => !recent.has(v));
  if (!choices.length) choices = variants;
  let line = rngPick(rng, choices);

  // apply params
  line = line.replace(/\{year\}/g, String(params.year ?? "?"));
  line = line.replace(/\{deed\}/g, params.deed || "helped me");

  // voice quirks (light touch)
  if (npc.voice?.formality === "rough" && rng() > 0.7) line = line.replace(/\.$/, ".");
  if (npc.voice?.verbosity === "terse") {
    const parts = line.split(/[.!?]/);
    if (parts[0] && parts[0].length > 8) line = parts[0].trim() + ".";
  }

  // update recent buffer (caller should persist)
  const recentLines = [...(npc.recentLines || []), line].slice(-RECENT_LINES_CAP);
  return { line, recentLines, nextRng: (Math.floor(rng() * 0xffffffff) >>> 0) || 1 };
}

/* ---------- memory ---------- */

export function addMemory(npc, entry) {
  const mem = [...(npc.memory || []), entry];
  // prune if over cap: lowest weight first
  while (mem.length > MEMORY_CAP) {
    let minI = 0;
    for (let i = 1; i < mem.length; i++) {
      if (mem[i].weight < mem[minI].weight) minI = i;
    }
    mem.splice(minI, 1);
  }
  return mem;
}

export function decayMemories(npc) {
  const loyaltyBonus = (npc.values?.loyalty || 50) / 200; // slower decay if loyal
  return (npc.memory || [])
    .map((m) => ({
      ...m,
      weight: Math.max(0, m.weight * (0.85 + loyaltyBonus * 0.1))
    }))
    .filter((m) => m.weight >= 0.15);
}

/* ---------- core reaction ---------- */

/**
 * react(npc, action, ctx) -> { outcome, bondDelta, moodDelta, memoryEntry, line, npcPatch }
 * Actions: talk | ask_favor | gift | argue | threaten | help | betray | ignore
 */
export function react(npc, action, ctx = {}) {
  const t = npc.traits;
  const v = npc.values;
  const b = npc.bond;
  const year = ctx.year ?? 0;
  const money = ctx.moneyGift ?? 0;

  const bondDelta = { trust: 0, affection: 0, respect: 0, fear: 0, resentment: 0 };
  let moodDelta = 0;
  let outcome = "neutral";
  let lineKey = "talk_warm";
  let lineParams = {};
  let valence = 0;
  let weight = 1;

  const avgBond = (b.trust + b.affection + b.respect - b.fear - b.resentment) / 5;
  const escalateChance = (t.volatility + b.resentment - t.agreeableness) / 2;
  const forgiveFactor = t.agreeableness / 100;

  // memory influence
  const badMem = (npc.memory || []).filter((m) => m.valence < 0).reduce((s, m) => s + m.weight, 0);
  const goodMem = (npc.memory || []).filter((m) => m.valence > 0).reduce((s, m) => s + m.weight, 0);

  if (action === "talk") {
    lineKey = avgBond + npc.mood / 50 > 0 ? "talk_warm" : "talk_cold";
    moodDelta = t.extraversion > 60 ? 4 : 1;
    bondDelta.affection += t.agreeableness > 50 ? 2 : 0;
    outcome = "chat";
    valence = 1;
    weight = 0.5;
  } else if (action === "ask_favor") {
    const willing =
      b.trust * 0.4 +
      b.affection * 0.3 +
      v.loyalty * 0.2 -
      b.resentment * 0.4 -
      badMem * 5 +
      (npc.goals.includes("be_liked") ? 10 : 0);
    if (willing > 45) {
      lineKey = "favor_yes";
      outcome = "favor_granted";
      bondDelta.trust += 2;
      bondDelta.respect += 1;
      moodDelta = 3;
      valence = 2;
      weight = 1.5;
    } else {
      lineKey = "favor_yes"; // uses low band
      outcome = "favor_refused";
      bondDelta.resentment += t.volatility > 50 ? 3 : 1;
      moodDelta = -5;
      valence = -1;
      weight = 1;
    }
  } else if (action === "gift") {
    const greedBoost = v.greed / 100;
    const liked = money > 500 ? 15 + greedBoost * 20 : 5 + greedBoost * 10;
    if (b.resentment > 60 && t.agreeableness < 40) {
      lineKey = "gift_happy";
      outcome = "gift_rejected";
      bondDelta.resentment += 2;
      moodDelta = -3;
      valence = -1;
      weight = 1;
    } else {
      lineKey = "gift_happy";
      outcome = "gift_accepted";
      bondDelta.affection += 3 + Math.floor(liked / 10);
      bondDelta.trust += 1;
      bondDelta.resentment = Math.max(-5, -Math.floor(forgiveFactor * 4));
      moodDelta = 5 + Math.floor(liked / 5);
      valence = 2;
      weight = 1.2 + greedBoost;
    }
  } else if (action === "argue") {
    const escalates = escalateChance + badMem * 3 > 40;
    lineKey = "argue_escalate";
    if (escalates) {
      outcome = "argument_escalated";
      bondDelta.resentment += 5 + Math.floor(t.volatility / 25);
      bondDelta.affection -= 4;
      bondDelta.trust -= 3;
      moodDelta = -12;
      valence = -3;
      weight = 2;
    } else {
      outcome = "argument_cooled";
      bondDelta.resentment += 1;
      bondDelta.respect += t.agreeableness > 60 ? 1 : 0;
      moodDelta = -4;
      valence = -1;
      weight = 1;
    }
  } else if (action === "threaten") {
    lineKey = "threaten_fear";
    const intimidated = b.fear + t.volatility * 0.3 - t.agreeableness * 0.2;
    if (intimidated > 40) {
      outcome = "intimidated";
      bondDelta.fear += 8;
      bondDelta.respect -= 2;
      bondDelta.trust -= 5;
      moodDelta = -15;
      valence = -3;
      weight = 2.5;
    } else {
      outcome = "defiant";
      bondDelta.resentment += 6 + Math.floor(t.volatility / 20);
      bondDelta.fear += 2;
      bondDelta.trust -= 4;
      moodDelta = -8;
      valence = -2;
      weight = 2;
    }
  } else if (action === "help") {
    lineKey = "help_grateful";
    const loyaltyWeight = 1 + v.loyalty / 100;
    outcome = "helped";
    bondDelta.trust += 4;
    bondDelta.affection += 3;
    bondDelta.respect += 2;
    bondDelta.resentment = -Math.floor(forgiveFactor * 5);
    moodDelta = 10;
    valence = 3;
    weight = 2 * loyaltyWeight;
    if (npc.goals.includes("protect_family")) weight += 0.5;
  } else if (action === "betray") {
    lineKey = "betray_hurt";
    outcome = "betrayed";
    bondDelta.trust -= 15;
    bondDelta.affection -= 12;
    bondDelta.resentment += 15 + Math.floor(v.loyalty / 10);
    bondDelta.respect -= 8;
    moodDelta = -25;
    valence = -5;
    weight = 3 + v.loyalty / 50;
  } else if (action === "ignore") {
    lineKey = "ignore_react";
    outcome = "ignored";
    bondDelta.affection -= t.extraversion > 50 ? 3 : 1;
    moodDelta = -2;
    valence = -1;
    weight = 0.6;
  }

  // memory callback chance
  const strongMem = (npc.memory || []).filter((m) => m.weight > 1.2).sort((a, c) => c.weight - a.weight)[0];
  if (strongMem && (action === "talk" || action === "ask_favor") && (npc.rngState % 100) < 35) {
    lineKey = "memory_callback";
    lineParams = { year: strongMem.year, deed: strongMem.type };
  }

  // apply deltas with clamps later
  const newBond = { ...b };
  for (const k of Object.keys(bondDelta)) {
    newBond[k] = clamp((newBond[k] || 0) + bondDelta[k], 0, 100);
  }
  const newMood = clamp(npc.mood + moodDelta, -100, 100);

  const scoreForBand =
    action === "threaten"
      ? -(newBond.fear - 40)
      : action === "argue"
        ? escalateChance
        : avgBond + newMood / 40;
  const band = bandFromScore(scoreForBand);

  const picked = pickLine({ ...npc, recentLines: npc.recentLines }, lineKey, band, lineParams);

  const memoryEntry = {
    year,
    type: action,
    valence,
    weight
  };

  const memory = addMemory({ ...npc, memory: npc.memory }, memoryEntry);

  return {
    outcome,
    bondDelta,
    moodDelta,
    memoryEntry,
    line: picked.line,
    lineKey,
    lineParams,
    npcPatch: {
      bond: newBond,
      mood: newMood,
      memory,
      recentLines: picked.recentLines,
      rngState: picked.nextRng
    }
  };
}

/* ---------- yearly tick ---------- */

export function tickYear(npc) {
  const age = (npc.age || 0) + 1;
  let memory = decayMemories(npc);
  // drift mood toward baseline
  const baseline = npc.baselineMood ?? 0;
  const mood = clamp(npc.mood + Math.sign(baseline - npc.mood) * 3, -100, 100);
  // slight bond drift toward neutral-ish
  const bond = { ...npc.bond };
  for (const k of ["trust", "affection", "respect", "fear", "resentment"]) {
    const target = k === "fear" || k === "resentment" ? 15 : 40;
    bond[k] = clamp(bond[k] + Math.sign(target - bond[k]) * 1, 0, 100);
  }
  // goal shift rare
  let goals = [...(npc.goals || [])];
  const rng = makeRng(npc.rngState);
  if (rng() < 0.08 && GOALS.length) {
    goals = [rngPick(rng, GOALS)];
    if (rng() > 0.5) goals.push(rngPick(rng, GOALS.filter((g) => g !== goals[0])));
  }
  const rngState = (Math.floor(rng() * 0xffffffff) >>> 0) || 1;
  return {
    ...npc,
    age,
    memory,
    mood,
    bond,
    goals,
    rngState
  };
}

/* ---------- helpers for player integration ---------- */

export function moodSummary(npc) {
  const m = npc.mood;
  if (m >= 40) return "in good spirits";
  if (m >= 10) return "content";
  if (m >= -10) return "even-tempered";
  if (m >= -40) return "on edge";
  return "hostile";
}

export function ensureFamilyNpcs(P, seedBase) {
  const npcs = { ...(P.npcs || {}) };
  if (!Object.values(npcs).some((n) => n.role === "parent")) {
    const s1 = hashSeed((seedBase || P.name || "x") + ":parent0");
    const s2 = hashSeed((seedBase || P.name || "x") + ":parent1");
    const p0 = generateNpc("parent", { id: "parent_0", age: 30 + (s1 % 12) }, s1);
    const p1 = generateNpc("parent", { id: "parent_1", age: 28 + (s2 % 14) }, s2);
    npcs[p0.id] = p0;
    npcs[p1.id] = p1;
  }
  return npcs;
}

export function applyNpcPatch(npcs, id, patch) {
  const n = npcs[id];
  if (!n) return npcs;
  return { ...npcs, [id]: { ...n, ...patch } };
}

export { LINES, MEMORY_CAP, RECENT_LINES_CAP, GOALS };
