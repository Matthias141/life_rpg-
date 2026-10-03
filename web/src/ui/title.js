/**
 * Title screen + character creation form.
 */

import { BACKGROUNDS, TRAITS, NAMES, BG_DESC, MAX_SLOTS } from "../data/index.js";
import { createPlayer } from "../engine/index.js";
import {
  listSlots, getMostRecentSlotId, loadSlot, deleteSlot,
  exportSlotToJSON, prepareImport, commitImport, getStorageWarning
} from "../storage/saves.js";
import { beginLifeFromForm, resumeFromSlot, show } from "./game.js";

function $(id) { return document.getElementById(id); }

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

export function renderTitleScreen() {
  show("screen-title");
  const warning = getStorageWarning();
  const warnEl = $("storage-warning");
  if (warnEl) {
    if (warning) {
      warnEl.textContent = warning;
      warnEl.classList.remove("hidden");
    } else {
      warnEl.classList.add("hidden");
    }
  }

  const slots = listSlots();
  const recentId = getMostRecentSlotId();
  const continueBtn = $("btn-continue");
  if (continueBtn) {
    if (recentId && slots.some((s) => s.id === recentId)) {
      continueBtn.disabled = false;
      continueBtn.onclick = () => loadAndResume(recentId);
    } else {
      continueBtn.disabled = true;
      continueBtn.onclick = null;
    }
  }

  const listEl = $("slot-list");
  if (!listEl) return;
  if (!slots.length) {
    listEl.innerHTML = `<p class="hint">No saved lives yet.</p>`;
    return;
  }

  listEl.innerHTML = slots.map((s) => {
    const status = s.completed ? "Completed" : "In progress";
    return `
      <div class="slot-row" data-id="${s.id}">
        <div class="slot-info">
          <strong>${escapeHtml(s.label || s.name)}</strong>
          <span class="hint">${escapeHtml(s.name)} · Age ${s.age} · ${escapeHtml(s.job)} · ${status} · ${formatDate(s.updatedAt)}</span>
        </div>
        <div class="slot-actions">
          <button type="button" data-act="load" data-id="${s.id}">Load</button>
          <button type="button" data-act="export" data-id="${s.id}">Export</button>
          <button type="button" class="danger" data-act="delete" data-id="${s.id}">Delete</button>
        </div>
      </div>`;
  }).join("");

  listEl.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === "load") loadAndResume(id);
      else if (act === "export") doExport(id);
      else if (act === "delete") doDelete(id);
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function loadAndResume(id) {
  const result = loadSlot(id);
  if (!result.ok) {
    alert(result.error || "Could not load save.");
    if (result.quarantined) renderTitleScreen();
    return;
  }
  resumeFromSlot(result.slot);
}

function doExport(id) {
  const result = exportSlotToJSON(id);
  if (!result.ok) {
    alert(result.error || "Export failed.");
    return;
  }
  const blob = new Blob([result.json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(url);
}

function doDelete(id) {
  if (!confirm("Delete this life permanently? This cannot be undone.")) return;
  deleteSlot(id);
  renderTitleScreen();
}

export function setupTitleActions() {
  const newBtn = $("btn-new-life");
  if (newBtn) {
    newBtn.onclick = () => {
      if (listSlots().length >= MAX_SLOTS) {
        alert(`Maximum of ${MAX_SLOTS} lives reached. Delete one before starting a new life.`);
        return;
      }
      show("screen-create");
      window.scrollTo(0, 0);
    };
  }

  const importBtn = $("btn-import");
  const importInput = $("import-file");
  if (importBtn && importInput) {
    importBtn.onclick = () => importInput.click();
    importInput.onchange = async () => {
      const file = importInput.files?.[0];
      importInput.value = "";
      if (!file) return;
      const text = await file.text();
      const prepared = prepareImport(text);
      if (!prepared.ok) {
        alert(prepared.error);
        return;
      }
      if (prepared.existingId) {
        const ok = confirm("A life with this id already exists. Overwrite it?");
        if (!ok) return;
        const result = commitImport(prepared.slot, { overwriteId: prepared.existingId });
        if (!result.ok) alert(result.error);
        else { alert("Import complete."); renderTitleScreen(); }
      } else {
        if (listSlots().length >= MAX_SLOTS) {
          alert(`Maximum of ${MAX_SLOTS} lives reached. Delete one first.`);
          return;
        }
        const result = commitImport(prepared.slot);
        if (!result.ok) alert(result.error);
        else { alert("Import complete."); renderTitleScreen(); }
      }
    };
  }

  const backBtn = $("btn-back-title");
  if (backBtn) backBtn.onclick = () => renderTitleScreen();
}

/* ---------- creation form (registry theme) ---------- */

export function setupCreationForm() {
  const LABEL = {
    education: "Education", happiness: "Happiness", reputation: "Reputation", crime: "Crime", heat: "Heat",
    street: "Street rep", strength: "STR", intelligence: "INT", charisma: "CHA", agility: "AGI", luck: "LCK",
    willpower: "WIL", health: "Health", work: "Work"
  };
  const CORE = [["strength", "STR"], ["intelligence", "INT"], ["charisma", "CHA"], ["agility", "AGI"], ["luck", "LCK"], ["willpower", "WIL"]];
  const OTHER = [["money", "Money"], ["health", "Health"], ["happiness", "Happiness"], ["education", "Education"],
    ["reputation", "Reputation"], ["street", "Street rep"], ["heat", "Heat"], ["crime", "Crime"], ["work", "Work"]];
  const BAD_UP = new Set(["heat"]);
  const money = (n) => "$" + n.toLocaleString();

  const chip = (k, v) => {
    const bad = v < 0 || (BAD_UP.has(k) && v > 0);
    const s = v > 0 ? "+" : "−";
    const a = Math.abs(v);
    return `<span class="chip${bad ? " bad" : ""}">${k === "money" ? s + money(a) : s + a + " " + LABEL[k]}</span>`;
  };
  const opt = (name, group, desc, data, on) =>
    `<label class="opt"><input type="radio" name="${group}" value="${name}"${on ? " checked" : ""}><span class="card"><span class="box"></span><span class="name">${name}</span>${desc ? `<span class="desc">${desc}</span>` : ""}<span class="chips">${Object.entries(data).filter(([, v]) => v !== 0).map(([k, v]) => chip(k, v)).join("")}</span></span></label>`;

  const genderSeg = $("gender-seg");
  if (genderSeg) {
    genderSeg.innerHTML = ["Male", "Female", "Non-binary"].map((g, i) =>
      `<label class="opt"><input type="radio" name="gender" value="${g}"${i === 0 ? " checked" : ""}><span class="card"><span class="box"></span><span class="name">${g}</span></span></label>`
    ).join("");
  }
  const bgList = $("bg-list");
  if (bgList) {
    bgList.innerHTML = Object.keys(BACKGROUNDS).map((b) =>
      opt(b, "bg", BG_DESC[b], BACKGROUNDS[b], b === "Working Class")
    ).join("");
  }
  const traitList = $("trait-list");
  if (traitList) {
    traitList.innerHTML = Object.keys(TRAITS).map((t, i) =>
      opt(t, "trait", "", TRAITS[t], i === 0)
    ).join("");
  }

  const val = (n) => document.querySelector(`input[name="${n}"]:checked`)?.value;
  function render() {
    const gender = val("gender") || "Male";
    const bg = val("bg") || "Working Class";
    const trait = val("trait") || "Athletic";
    const name = $("inp-name")?.value.trim() || "Alex";
    if ($("inp-gender")) $("inp-gender").value = gender;
    if ($("inp-bg")) $("inp-bg").value = bg;
    if ($("inp-trait")) $("inp-trait").value = trait;
    const p = createPlayer(name, gender, bg, trait);
    const base = createPlayer(name, gender, "(none)", "(none)");
    if ($("pv-name")) $("pv-name").textContent = `${name}, ${gender.toLowerCase()}, born ${bg.toLowerCase()}`;
    if ($("pv-class")) $("pv-class").textContent = bg;
    if ($("pv-core")) {
      $("pv-core").innerHTML = CORE.map(([k, l]) => {
        const d = p[k] - base[k];
        return `<div class="die${d ? " up" : ""}">${d ? `<u>+${d}</u>` : ""}<b>${p[k]}</b><i>${l}</i></div>`;
      }).join("");
    }
    if ($("pv-other")) {
      $("pv-other").innerHTML = OTHER.map(([k, l]) => {
        const d = p[k] - base[k];
        const cls = d === 0 ? "" : ((d > 0) !== BAD_UP.has(k) ? "up" : "down");
        return `<div class="${cls}"><span>${l}</span><b>${k === "money" ? money(p[k]) : p[k]}</b></div>`;
      }).join("");
    }
    if ($("sb-name")) $("sb-name").textContent = name;
    if ($("sb-sub")) $("sb-sub").textContent = `${bg}, ${trait}`;
  }

  document.querySelectorAll("#screen-create input[type=radio]").forEach((e) => e.addEventListener("change", render));
  $("inp-name")?.addEventListener("input", render);
  $("inp-name")?.addEventListener("keydown", (e) => { if (e.key === "Enter") beginLife(); });
  $("btn-random")?.addEventListener("click", () => {
    if ($("inp-name")) { $("inp-name").value = NAMES[Math.floor(Math.random() * NAMES.length)]; render(); }
  });
  render();
}

export function beginLife() {
  const st = $("stamp");
  if (st && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    st.classList.add("on");
    setTimeout(() => { st.classList.remove("on"); beginLifeFromForm(); }, 750);
  } else {
    beginLifeFromForm();
  }
}

// expose for inline onclick in HTML
if (typeof window !== "undefined") {
  window.beginLife = beginLife;
}
