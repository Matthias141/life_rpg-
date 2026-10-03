# Life RPG Simulator

BitLife × Torn-style text life sim. Static HTML + ES modules. Deploys to Vercel as static files.

## File layout

```
web/
  index.html          # shell (CSS + screens); loads modules
  package.json
  src/
    data/index.js     # BACKGROUNDS, TRAITS, JOBS, CRIMES, NAMES, versions
    engine/index.js   # createPlayer, roll, mod, advanceYear (no DOM)
    storage/saves.js  # versioned multi-slot localStorage layer
    ui/
      game.js         # play screens, year loop, autosave hooks
      title.js        # archive / title screen + birth form
  tests/
    saves.test.js     # node:test suite for the save layer
```

## Run locally

ES modules **require an HTTP server** (`file://` will not work).

```bash
cd web
npm start
# or: npx serve -p 3000 .
```

Open `http://localhost:3000`.

## Tests

```bash
cd web
npm test
# or: node --test tests/saves.test.js
```

## Save system

- **Index key:** `liferpg:v1:index`
- **Slot key:** `liferpg:v1:slot:<id>`
- **Corrupt quarantine:** `liferpg:v1:corrupt:<id>`
- Max **10** slots.
- Autosave at the end of every year and on death.
- Export / import JSON files from the Archive screen.
- Player state includes reserved `lineage: { dynastyId, generation, ancestors }` (unused in gameplay for now).

### Adding a migration

1. Bump `SAVE_VERSION` in `src/data/index.js`.
2. Push a function onto `MIGRATIONS` in `src/storage/saves.js`.  
   Index `i` upgrades a save **from** version `i` **to** `i+1`.

```js
// Example: SAVE_VERSION becomes 2
export const MIGRATIONS = [
  // index 0: v0 → v1 (already handled / no-op)
  // index 1: v1 → v2
  (state) => {
    if (!state.newField) state.newField = defaultValue;
    return state;
  }
];
```

3. Add a test that writes a v1 fixture and loads it under the new version.

Loading a save with `saveVersion` **newer** than the app is refused with a clear message and is never overwritten.

## Deploy (Vercel)

Point the project root at `web/` (or the repo root if `web` is the only static content). No build step required.

## NPC personality engine

Deterministic, offline NPCs live under `state.npcs`.

### Schema (`/src/engine/npc.js`)

```
NPC: {
  id, name, age, role,
  traits: { openness, conscientiousness, extraversion, agreeableness, volatility },  // 0–100
  values: { ambition, loyalty, greed, honesty },
  voice: { formality, verbosity, quirks[] },
  mood: -100..100, baselineMood,
  bond: { trust, affection, respect, fear, resentment },
  memory: [{ year, type, valence, weight }],  // max 20
  goals: string[],
  recentLines: string[],
  rngState: number,
  lineage: { parentIds, childIds }  // reserved for dynasty
}
```

### How to add a trait
1. Add the key to `traits` in `generateNpc`.
2. Bias role blocks if needed.
3. Reference it inside `react()` when computing outcomes.

### How to add an action
1. Extend the `action === "..."` branch in `react()`.
2. Choose a `lineKey` and ensure `LINES[lineKey]` has high/mid/low arrays (≥6 lines each).
3. Wire a button in `doNpcAction` / dossier UI.

### How to add a line fragment
Edit the `LINES` object in `npc.js`. Each `lineKey` needs `high`, `mid`, and `low` arrays with at least 6 variants. Use `{year}` / `{deed}` placeholders for memory callbacks.

### Save version
`SAVE_VERSION` is **2**. Migration from v1 adds `npcs: {}` and generates parents on load.
