/**
 * Game UI layer — owns the mutable P reference and DOM updates for the play screens.
 */

import {
  createPlayer, mod as engineMod, advanceYear, roll, rand, chance, pick,
  JOBS, CRIMES, NAMES
} from "../engine/index.js";
import {
  createSlotFromState, autosave, saveSlot, getStorageWarning
} from "../storage/saves.js";

let P = null;
let activeSlotId = null;
let lastKnownUpdatedAt = null;
let logLines = [];
let onDeathCallback = null;
let onAutosaveFail = null;

export function getPlayer() { return P; }
export function getActiveSlotId() { return activeSlotId; }

export function setCallbacks({ onDeath, onAutosaveFail: onFail } = {}) {
  onDeathCallback = onDeath || null;
  onAutosaveFail = onFail || null;
}

function mod(stat, amount, reason) {
  const entry = engineMod(P, stat, amount, reason);
  if (entry) addLog(entry.msg, entry.cls);
}

function addLog(msg, cls = "") {
  logLines.unshift(`Age ${P.age}: ${msg}`);
  if (logLines.length > 40) logLines.pop();
  const el = document.getElementById("log");
  if (el) el.innerHTML = logLines.map((l) => `<div class="${cls}">${l}</div>`).join("");
}

function show(id) {
  ["screen-title", "screen-create", "screen-game", "screen-end"].forEach((s) => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle("hidden", s !== id);
  });
}

function updateStatus() {
  if (!P) return;
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  set("st-name", P.name);
  set("st-age", `Age ${P.age}`);
  set("st-job", P.job + (P.jobLevel ? ` Lv${P.jobLevel}` : ""));
  set("st-health", P.health);
  set("st-happy", P.happiness);
  set("st-stress", P.stress);
  set("st-heat", P.heat);
  const bh = document.getElementById("bar-health"); if (bh) bh.style.width = P.health + "%";
  const by = document.getElementById("bar-happy"); if (by) by.style.width = P.happiness + "%";
  const bs = document.getElementById("bar-stress"); if (bs) bs.style.width = P.stress + "%";
  const bt = document.getElementById("bar-heat"); if (bt) bt.style.width = P.heat + "%";
  set("st-money", "$" + P.money.toLocaleString());
  set("st-str", P.strength); set("st-int", P.intelligence); set("st-cha", P.charisma);
  set("st-agi", P.agility); set("st-lck", P.luck); set("st-wil", P.willpower);
  set("st-crime", P.crime); set("st-work", P.work); set("st-combat", P.combat);
  set("st-street", P.street); set("st-corp", P.corp); set("st-edu", P.eduLevel);

  let tags = "";
  P.traits.forEach((t) => { tags += `<span class="tag trait">${t}</span>`; });
  if (P.gang) tags += `<span class="tag danger">${P.gang}</span>`;
  if (P.inPrison) tags += `<span class="tag danger">PRISON (${P.prisonYears}y)</span>`;
  if (P.addiction) tags += `<span class="tag danger">${P.addiction}</span>`;
  if (P.injury) tags += `<span class="tag danger">${P.injury}</span>`;
  if (P.partner) tags += `<span class="tag">${P.partner}</span>`;
  if (P.vehicle) tags += `<span class="tag">${P.vehicle}</span>`;
  const tagsEl = document.getElementById("st-tags");
  if (tagsEl) tagsEl.innerHTML = tags;

  let extra = "";
  if (P.property) extra += ` · Home: ${P.property}`;
  if (P.children) extra += ` · Kids: ${P.children}`;
  set("st-extra", extra);
}

function setStory(text) {
  const el = document.getElementById("story-text");
  if (el) el.innerHTML = text;
}

function setChoices(arr) {
  const el = document.getElementById("choices");
  if (!el) return;
  el.innerHTML = "";
  arr.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = c.label;
    if (c.primary) btn.classList.add("primary");
    if (c.danger) btn.classList.add("danger");
    btn.onclick = () => c.action();
    el.appendChild(btn);
  });
}

function doAutosave() {
  if (!activeSlotId || !P) return;
  const result = autosave(activeSlotId, P, lastKnownUpdatedAt);
  if (result.ok) {
    lastKnownUpdatedAt = new Date().toISOString();
  } else if (result.conflict) {
    if (onAutosaveFail) onAutosaveFail(result.error);
    else alert(result.error);
  } else if (result.error && onAutosaveFail) {
    onAutosaveFail(result.error);
  }
}

/* ---------- public entry points ---------- */

export function startNewLife(name, gender, bg, trait) {
  P = createPlayer(name, gender, bg, trait);
  logLines = [];
  const slot = createSlotFromState(P, `${name}'s life`);
  activeSlotId = slot.id;
  lastKnownUpdatedAt = slot.updatedAt;
  // persist immediately
  const result = saveSlot(slot);
  if (!result.ok && onAutosaveFail) onAutosaveFail(result.error);
  addLog(`Born into a ${bg} family. Trait: ${trait}`);
  show("screen-game");
  nextYear();
  window.scrollTo(0, 0);
}

export function resumeFromSlot(slot) {
  P = slot.state;
  activeSlotId = slot.id;
  lastKnownUpdatedAt = slot.updatedAt;
  logLines = [];
  addLog(`Resumed ${P.name} at age ${P.age}`);
  if (!P.alive) {
    endGame();
    return;
  }
  show("screen-game");
  updateStatus();
  // present current year choices again
  if (P.inPrison) prisonPhase();
  else if (P.age <= 5) childhoodPhase();
  else if (P.age <= 17) schoolPhase();
  else if (P.retired) retiredPhase();
  else adultPhase();
  window.scrollTo(0, 0);
}

export function beginLifeFromForm() {
  try {
    const name = document.getElementById("inp-name").value.trim() || "Alex";
    const gender = document.getElementById("inp-gender").value;
    const bg = document.getElementById("inp-bg").value;
    const trait = document.getElementById("inp-trait").value;
    startNewLife(name, gender, bg, trait);
  } catch (err) {
    alert("Error starting game: " + err.message + "\n\nTry refreshing the page.");
    console.error(err);
  }
}

function nextYear() {
  if (!P.alive) return endGame();
  const { died } = advanceYear(P);
  if (died) {
    doAutosave();
    return endGame();
  }
  updateStatus();
  doAutosave();

  if (P.inPrison) return prisonPhase();
  if (P.age <= 5) return childhoodPhase();
  if (P.age <= 17) return schoolPhase();
  if (P.retired) return retiredPhase();
  return adultPhase();
}

function childhoodPhase() {
  const events = [
    ["You took your first steps.", { agility: 1 }],
    ["You said your first words.", { intelligence: 1 }],
    ["You made a friend at the park.", { charisma: 1, happiness: 6 }],
    ["You got quite sick.", { health: -10, happiness: -6 }],
    ["Your parents gave you lots of attention.", { happiness: 10, willpower: 1 }],
    ["A pet joined the family.", { happiness: 9 }],
    ["Family arguments this year.", { happiness: -8, stress: 6 }]
  ];
  const [txt, eff] = pick(events);
  setStory(`<strong>Age ${P.age}</strong><br>${txt}`);
  for (const k in eff) mod(k, eff[k]);
  addLog(txt);
  setChoices([{ label: "Continue →", primary: true, action: nextYear }]);
}

function schoolPhase() {
  setStory(`<strong>Age ${P.age} — School Years</strong><br>What do you focus on this year?`);
  const choices = [
    { label: "📚 Study hard", action: () => schoolAct("study") },
    { label: "🏃 Sports & training", action: () => schoolAct("sports") },
    { label: "👥 Socialize & friends", action: () => schoolAct("social") },
    { label: "😈 Cause trouble", action: () => schoolAct("trouble") },
    { label: "🎨 Creative pursuits", action: () => schoolAct("creative") },
    { label: "😴 Coast / do minimum", action: () => schoolAct("coast") }
  ];
  if (P.age >= 15) choices.splice(4, 0, { label: "💼 Part-time job", action: () => schoolAct("job") });
  setChoices(choices);
}

function schoolAct(type) {
  if (type === "study") {
    const r = roll(P.intelligence, 40);
    if (r.ok) {
      mod("intelligence", r.deg === 2 ? 2 : 1, "studying");
      mod("education", r.deg === 2 ? 10 : 7, "studying");
      mod("happiness", -4); mod("stress", 5);
      setStory(r.deg === 2 ? "You crushed your classes this year." : "Solid academic year.");
      addLog("Focused on studies", "good");
    } else {
      mod("education", 3); mod("happiness", -6); mod("stress", 8);
      setStory("You studied but struggled.");
      addLog("Academic struggles", "bad");
    }
  } else if (type === "sports") {
    const r = roll(P.strength + P.agility, 45);
    if (r.ok) {
      mod("strength", 1); if (r.deg === 2) mod("agility", 1);
      mod("health", 6); mod("happiness", 6);
      if (chance(35)) mod("combat", 1);
      setStory("You got stronger and fitter.");
      addLog("Athletic year", "good");
    } else {
      mod("health", -7, "injury");
      if (chance(40)) { P.injury = pick(["sprained ankle", "broken leg"]); setStory(`Injured: ${P.injury}`); }
      else setStory("Rough sports year with a minor injury.");
      addLog("Sports injury", "bad");
    }
  } else if (type === "social") {
    const r = roll(P.charisma, 40);
    if (r.ok) {
      mod("charisma", 1); mod("happiness", r.deg === 2 ? 12 : 8); mod("reputation", 4);
      if (chance(30)) { const f = pick(NAMES); P.friends.push(f); setStory(`You became popular and friends with ${f}.`); }
      else setStory("Great social year.");
      addLog("Social success", "good");
    } else {
      mod("happiness", -8); mod("reputation", -3);
      setStory("Social life was rough.");
      addLog("Social difficulties", "bad");
    }
  } else if (type === "trouble") {
    const r = roll(P.agility + P.crime, 50);
    if (r.ok) {
      mod("crime", 2); mod("street", 3); mod("happiness", 4); mod("education", -3);
      setStory("You got away with it and learned the streets.");
      addLog("Youthful trouble — success", "good");
    } else {
      mod("reputation", -10); mod("happiness", -10); mod("education", -5); mod("heat", 8);
      setStory("Caught. Detention and consequences.");
      addLog("Got into serious trouble", "bad");
    }
  } else if (type === "job") {
    const pay = rand(2000, 5500);
    P.money += pay; mod("work", 1); mod("happiness", -3); mod("education", -2);
    setStory(`You worked part-time and earned $${pay.toLocaleString()}.`);
    addLog(`Part-time job +$${pay}`, "good");
  } else if (type === "creative") {
    const r = roll(P.charisma + P.intelligence, 45);
    if (r.ok) {
      mod("charisma", 1); mod("happiness", 10);
      if (!P.traits.includes("Creative") && chance(25)) { P.traits.push("Creative"); setStory("Your creative side flourished. New trait: Creative!"); }
      else setStory("Creative year — you enjoyed yourself.");
      addLog("Creative pursuits", "good");
    } else { mod("happiness", 3); setStory("You dabbled creatively."); }
  } else {
    mod("happiness", 3); mod("education", 2);
    setStory("A quiet, average year.");
    addLog("Coasted through school");
  }

  if (P.age === 17) {
    if (P.education >= 55) {
      P.eduLevel = "High School";
      mod("education", 10);
      setStory((document.getElementById("story-text").innerHTML || "") + "<br><br><strong>★ You graduated high school!</strong>");
      addLog("Graduated high school", "good");
    } else {
      setStory((document.getElementById("story-text").innerHTML || "") + "<br><br>You left school without strong credentials.");
      addLog("Left school early");
    }
  }

  if (chance(35)) randomSchoolEvent();
  setChoices([{ label: "Continue →", primary: true, action: nextYear }]);
  updateStatus();
}

function randomSchoolEvent() {
  const pool = [
    ["You won an academic award.", { intelligence: 1, happiness: 10, reputation: 6, education: 5 }],
    ["You were bullied.", { happiness: -14, health: -4, willpower: 1 }],
    ["A mentor teacher helped you.", { education: 8, happiness: 8 }],
    ["First crush / romance.", { happiness: 11, charisma: 1 }],
    ["Family money problems.", { happiness: -9, stress: 10 }],
    ["You joined a winning team.", { strength: 1, happiness: 11, reputation: 7 }],
    ["You stood up to a bully.", { willpower: 1, street: 3, happiness: 6 }]
  ];
  const [txt, eff] = pick(pool);
  for (const k in eff) mod(k, eff[k]);
  addLog("⚡ " + txt, "event");
  setStory((document.getElementById("story-text").innerHTML || "") + `<br><br>⚡ <em>${txt}</em>`);
}

function adultPhase() {
  setStory(`<strong>Age ${P.age}</strong><br>What do you want to focus on this year?`);
  const choices = [
    { label: "💼 Work / Career", action: workMenu },
    { label: "🔫 Crime & Underworld", action: crimeMenu },
    { label: "🏋️ Train / Education", action: trainMenu },
    { label: "❤️ Social & Relationships", action: socialMenu },
    { label: "🛒 Assets & Shopping", action: shopMenu },
    { label: "😴 Rest & Recover", action: () => {
      mod("health", 10, "rest"); mod("happiness", 8, "rest"); mod("stress", -15, "rest");
      if (P.injury && chance(45)) { addLog(`Healed from ${P.injury}`, "good"); P.injury = null; }
      setStory("You took time to rest and recover.");
      addLog("Rested");
      finishYear();
    }},
    { label: "⭐ Special Actions", action: specialMenu }
  ];
  if (P.age >= 60) choices.push({ label: "🏖️ Retire", action: () => {
    P.retired = true; P.job = "Retired";
    setStory("You retired from working life.");
    addLog("Retired");
    finishYear();
  }});
  setChoices(choices);
}

function finishYear() {
  if (chance(28)) randomAdultEvent();
  updateStatus();
  setChoices([{ label: "Continue to next year →", primary: true, action: nextYear }]);
}

function workMenu() {
  if (P.job === "Unemployed") return findJob();
  setStory(`Working as <strong>${P.job}</strong> (Level ${P.jobLevel})...`);
  const job = JOBS[P.job] || { pay: 25000, req: 0 };
  let mult = 1 + P.jobLevel * 0.11 + P.work * 0.015;
  mult += (P.intelligence - 10) * 0.015;
  const pay = Math.floor(job.pay * mult);
  const r = roll(P.intelligence + Math.floor(P.work / 2), 42);
  if (r.ok) {
    P.money += pay;
    if (chance(55)) mod("work", 1);
    mod("happiness", 3); mod("stress", 4);
    if (["Engineer", "Lawyer", "Doctor", "Software Dev"].includes(P.job)) mod("corp", 2);
    else mod("corp", 1);
    let msg = `Good year. Earned <strong>$${pay.toLocaleString()}</strong>.`;
    if (r.deg === 2 || chance(22)) {
      P.jobLevel++;
      msg += `<br>★ Promoted to level ${P.jobLevel}!`;
      addLog(`Promoted in ${P.job}`, "good");
    }
    setStory(msg);
    addLog(`Worked as ${P.job}, +$${pay}`, "good");
  } else {
    const low = Math.floor(pay * 0.55);
    P.money += low;
    mod("happiness", -6); mod("stress", 10);
    setStory(`Tough year. Only earned $${low.toLocaleString()}.`);
    if (chance(12)) {
      P.job = "Unemployed"; P.jobLevel = 0;
      setStory(document.getElementById("story-text").innerHTML + "<br>You lost your job.");
      addLog("Lost job", "bad");
    } else addLog(`Struggled at ${P.job}`, "bad");
  }
  finishYear();
}

function findJob() {
  let available = Object.entries(JOBS).filter(([n, d]) => n !== "Unemployed" && P.education >= d.req);
  if (["Bachelor", "Master", "Doctorate"].includes(P.eduLevel)) {
    available.push(["Software Dev", JOBS["Software Dev"]], ["Engineer", JOBS["Engineer"]]);
  }
  if (["Master", "Doctorate"].includes(P.eduLevel)) {
    available.push(["Lawyer", JOBS["Lawyer"]], ["Doctor", JOBS["Doctor"]]);
  }
  if (!available.length) available = [["Retail Worker", JOBS["Retail Worker"]], ["Construction", JOBS["Construction"]]];
  available.sort((a, b) => b[1].pay - a[1].pay);
  const job = pick(available.slice(0, 6))[0];
  P.job = job; P.jobLevel = 1;
  mod("happiness", 10, "new job");
  setStory(`You got hired as a <strong>${job}</strong>!`);
  addLog(`Hired as ${job}`, "good");
  finishYear();
}

function crimeMenu() {
  setStory("<strong>Underworld</strong><br>Choose an action:");
  setChoices([
    { label: "Commit a crime", action: commitCrime },
    { label: P.gang ? `Gang: ${P.gang}` : "Join a gang", action: gangMenu },
    { label: "← Back", action: adultPhase }
  ]);
}

function commitCrime() {
  setStory("Choose a crime:<br><small>Higher skill unlocks better jobs. Risk vs reward.</small>");
  const choices = CRIMES.filter((c) => P.crime >= c.req).map((c) => ({
    label: `${c.name} (Risk ${c.risk}% · Req skill ${c.req})`,
    danger: c.risk >= 60,
    action: () => doCrime(c)
  }));
  if (!choices.length) {
    setStory("Your crime skill is too low for anything yet. Try causing trouble in school or starting small later.");
    setChoices([{ label: "← Back", action: crimeMenu }]);
    return;
  }
  choices.push({ label: "← Back", action: crimeMenu });
  setChoices(choices);
}

function doCrime(c) {
  const statVal = P[c.stat] || 10;
  let bonus = P.crime * 2 - Math.floor(P.heat / 4);
  if (P.gang) bonus += 8;
  if (P.inventory.includes("Lockpicks") && c.id === "burglary") bonus += 15;
  if (P.inventory.includes("Laptop") && c.id === "fraud") bonus += 12;
  if (P.inventory.includes("Pistol") || P.inventory.includes("Knife")) bonus += 5;

  const r = roll(statVal, c.risk, bonus);
  setStory(`Attempting <strong>${c.name}</strong> (chance ~${r.chance}%)...`);

  if (r.ok) {
    let money = rand(c.reward[0], c.reward[1]);
    if (r.deg === 2) { money = Math.floor(money * 1.5); setStory(document.getElementById("story-text").innerHTML + "<br>★ Critical success!"); }
    P.money += money;
    mod("crime", c.skill); mod("street", c.skill + 1); mod("heat", Math.floor(c.heat / 2));
    mod("happiness", 6);
    setStory(document.getElementById("story-text").innerHTML + `<br>Got away with <strong>$${money.toLocaleString()}</strong>!`);
    addLog(`Successful ${c.name} +$${money}`, "good");
  } else {
    mod("heat", c.heat); mod("happiness", -12); mod("stress", 10);
    setStory(document.getElementById("story-text").innerHTML + "<br>Failed / nearly caught!");
    let arrestChance = 25 + Math.floor(P.heat / 2) + Math.floor(c.risk / 3);
    if (r.deg === -1) arrestChance += 25;
    if (chance(Math.max(15, Math.min(90, arrestChance)))) {
      let years = Math.max(1, Math.floor(c.risk / 15) + rand(0, 3));
      if (["armed_robbery", "heist"].includes(c.id)) years += rand(1, 4);
      P.inPrison = true; P.prisonYears = years; P.job = "Unemployed";
      setStory(document.getElementById("story-text").innerHTML + `<br><strong style="color:var(--danger)">ARRESTED! ${years} years prison.</strong>`);
      addLog(`Arrested for ${c.name} — ${years}y`, "bad");
    } else {
      const fine = rand(500, 4000);
      P.money = Math.max(0, P.money - fine);
      setStory(document.getElementById("story-text").innerHTML + `<br>Escaped prison but paid $${fine.toLocaleString()} fine.`);
      addLog(`Caught for ${c.name} but avoided prison`, "bad");
    }
  }
  finishYear();
}

function gangMenu() {
  if (!P.gang) {
    if (P.street < 15) {
      setStory("Your street reputation is too low to join a gang (need 15+).");
      setChoices([{ label: "← Back", action: crimeMenu }]);
      return;
    }
    setStory("Choose a gang to join:");
    setChoices([
      { label: "The Shadows (theft & stealth)", action: () => joinGang("The Shadows") },
      { label: "Iron Fists (violence)", action: () => joinGang("Iron Fists") },
      { label: "The Syndicate (fraud & drugs)", action: () => joinGang("The Syndicate") },
      { label: "← Back", action: crimeMenu }
    ]);
  } else {
    setStory(`You are in <strong>${P.gang}</strong>.`);
    setChoices([
      { label: "Do a gang job", action: gangJob },
      { label: "Leave the gang", danger: true, action: () => {
        mod("street", -15); mod("heat", 10);
        if (chance(40)) { mod("health", -18); setStory("They didn't let you leave cleanly. You got hurt."); }
        else setStory("You left the gang.");
        P.gang = null;
        addLog("Left the gang");
        finishYear();
      }},
      { label: "← Back", action: crimeMenu }
    ]);
  }
}

function joinGang(name) {
  P.gang = name; mod("street", 10); mod("heat", 5);
  setStory(`You joined <strong>${name}</strong>!`);
  addLog(`Joined ${name}`, "good");
  finishYear();
}

function gangJob() {
  const r = roll(P.agility + P.crime, 50, 10);
  if (r.ok) {
    const pay = rand(3000, 16000);
    P.money += pay; mod("street", 4); mod("crime", 2); mod("heat", 8);
    setStory(`Gang job success. Earned <strong>$${pay.toLocaleString()}</strong>.`);
    addLog("Successful gang job", "good");
  } else {
    mod("health", -12); mod("heat", 15); mod("happiness", -10);
    setStory("The job went bad. You got hurt.");
    if (chance(28)) {
      P.inPrison = true; P.prisonYears = rand(1, 4);
      setStory(document.getElementById("story-text").innerHTML + "<br>Arrested during the job!");
    }
    addLog("Failed gang job", "bad");
  }
  finishYear();
}

function trainMenu() {
  setStory("What do you train this year?");
  setChoices([
    { label: "Gym — Strength & Health ($400)", action: () => train("gym", 400) },
    { label: "Study / Courses — INT & Education ($600)", action: () => train("study", 600) },
    { label: "Networking — Charisma ($300)", action: () => train("cha", 300) },
    { label: "Agility / Sports ($350)", action: () => train("agi", 350) },
    { label: "Combat training ($500)", action: () => train("combat", 500) },
    { label: "Meditation — Willpower ($200)", action: () => train("wil", 200) },
    { label: "Pursue higher education", action: pursueEdu },
    { label: "← Back", action: adultPhase }
  ]);
}

function train(type, cost) {
  if (P.money < cost) {
    setStory("Not enough money.");
    setChoices([{ label: "← Back", action: trainMenu }]);
    return;
  }
  P.money -= cost;
  if (type === "gym") { mod("strength", 1); mod("health", 5); if (chance(30)) mod("combat", 1); setStory("Solid gym progress."); }
  else if (type === "study") { mod("intelligence", 1); mod("education", 8); if (chance(40)) mod("work", 1); setStory("You learned a lot."); }
  else if (type === "cha") { mod("charisma", 1); mod("corp", 2); mod("reputation", 2); setStory("Your network grew."); }
  else if (type === "agi") { mod("agility", 1); mod("health", 3); setStory("You became quicker."); }
  else if (type === "combat") { mod("combat", 2); if (chance(50)) mod("strength", 1); setStory("Fighting skills improved."); }
  else if (type === "wil") { mod("willpower", 1); mod("stress", -8); setStory("Mental fortitude up."); }
  mod("happiness", 4);
  addLog("Trained / studied");
  finishYear();
}

function pursueEdu() {
  if (P.eduLevel === "None" && P.education >= 50 && P.money >= 5000) {
    P.money -= 5000; P.eduLevel = "High School"; mod("education", 15);
    setStory("You completed high school equivalency.");
    addLog("Earned high school diploma", "good");
  } else if (P.eduLevel === "High School" && P.education >= 60 && P.money >= 20000) {
    P.money -= 20000; P.eduLevel = "Bachelor"; mod("education", 20); mod("intelligence", 1); mod("corp", 10);
    setStory("★ Bachelor's degree earned!");
    addLog("Earned Bachelor's", "good");
  } else if (P.eduLevel === "Bachelor" && P.education >= 75 && P.money >= 35000) {
    P.money -= 35000; P.eduLevel = "Master"; mod("education", 15); mod("intelligence", 1);
    setStory("★ Master's degree earned!");
    addLog("Earned Master's", "good");
  } else if (P.eduLevel === "Master" && P.education >= 85 && P.money >= 50000) {
    P.money -= 50000; P.eduLevel = "Doctorate"; mod("education", 10); mod("intelligence", 2); mod("corp", 15);
    setStory("★ Doctorate earned!");
    addLog("Earned Doctorate", "good");
  } else {
    setStory("Requirements not met or already at max (need enough education score + money).");
    setChoices([{ label: "← Back", action: trainMenu }]);
    return;
  }
  finishYear();
}

function socialMenu() {
  setStory("Social options:");
  setChoices([
    { label: "Go out & meet people", action: () => {
      const r = roll(P.charisma, 40);
      if (r.ok) {
        if (chance(45)) mod("charisma", 1);
        mod("happiness", 11); mod("reputation", 3); mod("stress", -5);
        if (chance(25)) { const f = pick(NAMES); P.friends.push(f); setStory(`Great year. New friend: ${f}`); }
        else setStory("Great social year.");
        addLog("Socializing", "good");
      } else { mod("happiness", -5); mod("stress", 5); setStory("Awkward or lonely times."); addLog("Social fail", "bad"); }
      finishYear();
    }},
    { label: P.partner ? `Relationship with ${P.partner}` : "Look for a partner", action: relationshipAct },
    { label: "Spend time with friends/family", action: () => {
      mod("happiness", 9); mod("stress", -6);
      setStory("You invested in your close relationships.");
      addLog("Time with close people");
      finishYear();
    }},
    { label: "Try for a child / family time", action: () => {
      if (P.partner && P.age >= 20 && chance(32)) {
        P.children++;
        mod("happiness", 18); mod("stress", 10);
        setStory(`★ You had a child! (Total children: ${P.children})`);
        addLog("Had a child", "good");
      } else if (P.children) {
        mod("happiness", 8);
        setStory(`You spent time with your ${P.children} child(ren).`);
      } else setStory("No child this year (need partner & luck).");
      finishYear();
    }},
    { label: "← Back", action: adultPhase }
  ]);
}

function relationshipAct() {
  if (!P.partner) {
    let ch = 25 + (P.charisma - 8) * 4 + Math.floor((P.reputation - 40) / 4);
    if (P.money > 50000) ch += 10;
    if (chance(Math.max(8, Math.min(80, ch)))) {
      P.partner = pick(NAMES);
      mod("happiness", 16);
      setStory(`You started dating <strong>${P.partner}</strong>!`);
      addLog(`Dating ${P.partner}`, "good");
    } else {
      mod("happiness", -5);
      setStory("No luck finding a partner this year.");
      addLog("Failed to find partner");
    }
    finishYear();
  } else {
    setStory(`Partner: <strong>${P.partner}</strong>`);
    setChoices([
      { label: "Invest time & money (strengthen)", action: () => {
        const cost = rand(500, 3000);
        if (P.money >= cost) { P.money -= cost; mod("happiness", 10); setStory(`Spent $${cost.toLocaleString()}. Relationship is stronger.`); }
        else { mod("happiness", -3); setStory("Couldn't afford to treat them well."); }
        finishYear();
      }},
      { label: "Break up", danger: true, action: () => {
        addLog(`Broke up with ${P.partner}`, "bad");
        setStory(`You ended things with ${P.partner}.`);
        P.partner = null; mod("happiness", -12);
        finishYear();
      }},
      { label: "← Back", action: socialMenu }
    ]);
  }
}

function shopMenu() {
  setStory(`Money: <strong>$${P.money.toLocaleString()}</strong><br>What do you want to buy?`);
  const items = [
    { name: "Knife", price: 80, type: "weapon" },
    { name: "Pistol", price: 1200, type: "weapon" },
    { name: "Lockpicks", price: 150, type: "tool" },
    { name: "Laptop", price: 800, type: "tool" },
    { name: "Fake ID", price: 300, type: "tool" },
    { name: "Body Armor", price: 2000, type: "armor" },
    { name: "Sedan", price: 12000, type: "vehicle" },
    { name: "Sports Car", price: 35000, type: "vehicle" }
  ];
  const choices = items.filter((i) => !P.inventory.includes(i.name) && P.vehicle !== i.name).map((i) => ({
    label: `${i.name} — $${i.price.toLocaleString()}`,
    action: () => buyItem(i)
  }));
  if (!P.property) {
    choices.push({ label: "Rent Apartment ($1,200/year)", action: () => {
      P.property = "Apartment";
      setStory("You rented an apartment. Better living conditions.");
      addLog("Rented apartment");
      finishYear();
    }});
    choices.push({ label: "Buy House ($180,000)", action: () => {
      if (P.money >= 180000) {
        P.money -= 180000; P.property = "House";
        mod("happiness", 15); mod("reputation", 10);
        setStory("You bought a house!");
        addLog("Bought a house", "good");
        finishYear();
      } else { setStory("Not enough money."); setChoices([{ label: "← Back", action: shopMenu }]); }
    }});
  }
  choices.push({ label: "← Back", action: adultPhase });
  setChoices(choices);
}

function buyItem(i) {
  if (P.money < i.price) {
    setStory("Not enough money.");
    setChoices([{ label: "← Back", action: shopMenu }]);
    return;
  }
  P.money -= i.price;
  if (i.type === "vehicle") P.vehicle = i.name;
  else P.inventory.push(i.name);
  if (i.name === "Sports Car") mod("reputation", 5);
  setStory(`Bought <strong>${i.name}</strong>!`);
  addLog(`Bought ${i.name}`, "good");
  finishYear();
}

function specialMenu() {
  setStory("Special actions:");
  const choices = [];
  if (P.age >= 18 && P.age <= 30 && !P.military) {
    choices.push({ label: "Join the military", action: () => {
      P.military = true; P.job = "Soldier"; P.jobLevel = 1;
      mod("strength", 2); mod("combat", 3); mod("willpower", 1);
      setStory("You enlisted. Hard training begins.");
      addLog("Enlisted in military", "good");
      finishYear();
    }});
  }
  choices.push({ label: P.business ? "Manage business" : "Start a business ($10,000)", action: () => {
    if (P.business) {
      const r = roll(P.intelligence + P.charisma, 50);
      if (r.ok) {
        const profit = rand(10000, 45000);
        P.money += profit; mod("work", 2); mod("corp", 5);
        setStory(`Business made <strong>$${profit.toLocaleString()}</strong> profit.`);
        addLog("Business profit", "good");
      } else {
        const loss = rand(3000, 14000);
        P.money = Math.max(0, P.money - loss);
        setStory(`Business lost $${loss.toLocaleString()}.`);
        addLog("Business loss", "bad");
      }
      finishYear();
    } else if (P.money >= 10000) {
      P.money -= 10000; P.business = true; P.job = "Business Owner"; P.jobLevel = 1;
      setStory("You started a small business!");
      addLog("Started business", "good");
      finishYear();
    } else {
      setStory("Need $10,000 capital.");
      setChoices([{ label: "← Back", action: specialMenu }]);
    }
  }});
  choices.push({ label: "Lay low (reduce heat)", action: () => {
    mod("heat", -15, "laying low"); mod("happiness", -4);
    setStory("You kept a low profile this year.");
    addLog("Laid low");
    finishYear();
  }});
  choices.push({ label: "Medical / Rehab ($3,000)", action: () => {
    if (P.money < 3000) { setStory("Need $3,000."); setChoices([{ label: "← Back", action: specialMenu }]); return; }
    P.money -= 3000;
    if (P.injury) { addLog(`Healed ${P.injury}`, "good"); P.injury = null; }
    if (P.addiction && chance(40 + P.willpower * 3)) {
      setStory(`You successfully kicked ${P.addiction}!`);
      P.addiction = null; P.addictionLevel = 0; mod("willpower", 1);
      addLog("Beat addiction", "good");
    } else {
      mod("health", 15); mod("stress", -10);
      setStory("You received medical help.");
    }
    finishYear();
  }});
  choices.push({ label: "← Back", action: adultPhase });
  setChoices(choices);
}

function prisonPhase() {
  P.prisonYears--;
  setStory(`<strong>Age ${P.age} — In Prison</strong> (${P.prisonYears} years left)<br>How do you spend the year?`);
  setChoices([
    { label: "Keep head down", action: () => { mod("happiness", -10); mod("stress", 5); setStory("Quiet, soul-crushing year."); afterPrison(); }},
    { label: "Work out hard", action: () => { mod("strength", 1); mod("combat", 1); mod("health", 4); mod("happiness", -6); setStory("You got harder."); afterPrison(); }},
    { label: "Study / read", action: () => { mod("intelligence", 1); mod("education", 6); mod("happiness", -5); setStory("You educated yourself inside."); afterPrison(); }},
    { label: "Join prison faction", action: () => {
      if (!P.prisonFaction) { P.prisonFaction = pick(["The Brotherhood", "Los Lobos", "The Silent"]); mod("street", 6); mod("crime", 2); setStory(`Joined ${P.prisonFaction}.`); }
      else { mod("street", 3); mod("crime", 1); setStory("You did work for your faction."); }
      afterPrison();
    }},
    { label: "Fight / dominance", danger: true, action: () => {
      const r = roll(P.strength + P.combat, 50);
      if (r.ok) { mod("combat", 2); mod("street", 5); mod("happiness", 5); setStory("You won. Respect gained."); }
      else { mod("health", -15); P.injury = pick(["broken rib", "concussion", "stab wound"]); mod("happiness", -15); setStory(`You lost. Injury: ${P.injury}`); }
      afterPrison();
    }},
    { label: "Attempt escape (very risky)", danger: true, action: () => {
      const ch = 8 + P.agility + P.luck - 10;
      if (chance(Math.max(3, ch))) {
        P.inPrison = false; P.prisonYears = 0; mod("heat", 25); mod("street", 15);
        setStory("★ YOU ESCAPED!");
        addLog("Escaped prison!", "good");
      } else {
        P.prisonYears += 2; mod("health", -10);
        setStory("Failed escape. Extra years added.");
        addLog("Failed escape", "bad");
      }
      afterPrison();
    }}
  ]);
}

function afterPrison() {
  addLog("Year in prison");
  if (P.prisonYears <= 0) {
    P.inPrison = false; P.prisonFaction = null;
    mod("happiness", 15, "freedom"); mod("reputation", -10, "ex-con"); mod("street", 5);
    setStory((document.getElementById("story-text").innerHTML || "") + "<br><br><strong>You have been released.</strong>");
    addLog("Released from prison", "good");
  }
  updateStatus();
  setChoices([{ label: "Continue →", primary: true, action: nextYear }]);
}

function retiredPhase() {
  setStory(`<strong>Age ${P.age} — Retirement</strong>`);
  setChoices([
    { label: "Enjoy quiet life", action: () => { mod("happiness", 6); mod("stress", -8); mod("health", -1); setStory("Peaceful year."); finishYear(); }},
    { label: "Family time", action: () => { mod("happiness", 12); setStory("Warm family moments."); finishYear(); }},
    { label: "Hobbies", action: () => { mod("happiness", 10); if (chance(30)) mod("intelligence", 1); setStory("You enjoyed your hobbies."); finishYear(); }}
  ]);
}

function randomAdultEvent() {
  const events = [
    ["You inherited some money.", { money: rand(4000, 35000), happiness: 10 }],
    ["Serious accident.", { health: -18, money: -rand(1500, 12000), stress: 12, injury: "whiplash" }],
    ["You were mugged.", { money: -rand(300, 2500), health: -7, happiness: -9 }],
    ["Big bonus or unexpected promotion money.", { money: rand(3000, 16000), happiness: 9, corp: 4 }],
    ["Public scandal.", { reputation: -14, stress: 11, happiness: -9 }],
    ["You became a minor local celebrity.", { reputation: 11, happiness: 9, charisma: 1 }],
    ["Recession hit your finances.", { money: -rand(2500, 11000), stress: 9 }],
    ["Found a great mentor.", { work: 2, intelligence: 1, happiness: 7 }],
    ["Health scare.", { health: -11, stress: 9, happiness: -7 }],
    ["Won some money gambling.", { money: rand(800, 7000), happiness: 7 }],
    ["Lost money gambling.", { money: -rand(800, 5500), happiness: -7, stress: 5 }],
    ["You saved someone — heroic act.", { reputation: 14, happiness: 14, willpower: 1 }]
  ];
  const [txt, eff] = pick(events);
  for (const k in eff) {
    if (k === "injury") { P.injury = eff[k]; addLog("Injury: " + eff[k], "bad"); }
    else if (k === "money") { P.money = Math.max(0, P.money + eff[k]); addLog(`Money ${eff[k] > 0 ? "+" : ""}${eff[k]}`, eff[k] > 0 ? "good" : "bad"); }
    else mod(k, eff[k]);
  }
  addLog("⚡ " + txt, "event");
  setStory((document.getElementById("story-text").innerHTML || "") + `<br><br>⚡ <em>${txt}</em>`);
}

function endGame() {
  doAutosave();
  updateStatus();
  show("screen-end");
  const score = Math.floor(P.money / 1000) + P.education + P.street + P.corp + P.reputation + P.children * 20 + P.jobLevel * 10;
  const el = document.getElementById("end-summary");
  if (el) {
    el.innerHTML = `
      <p><strong>${P.name}</strong> died at age <strong>${P.age}</strong>.</p>
      <p>Cause: ${P.cause || "unknown"}</p>
      <p>Final net worth: <strong>$${P.money.toLocaleString()}</strong></p>
      <p>Job: ${P.job} Level ${P.jobLevel} · Education: ${P.eduLevel}</p>
      <p>Children: ${P.children} · Gang: ${P.gang || "None"}</p>
      <p>Street Rep: ${P.street} · Corp Rep: ${P.corp}</p>
      <p>Traits: ${P.traits.join(", ")}</p>
      <p style="margin-top:12px;font-size:1.2rem">Legacy Score: <strong>${score}</strong></p>
    `;
  }
  if (onDeathCallback) onDeathCallback();
}

export { show };
