# Bob Poker Timer

A poker tournament clock + management app. The laptop drives a **TV display over HDMI** and
runs a **local server** so a phone can act as a live remote over a hotspot LAN — no internet or
venue WiFi required.

> **Status:** Planning approved (2026-07-28) → implementation. Target: a live tournament this
> weekend. Reliability at the event beats feature completeness, **but the project is structured to
> extend into a larger system later** (see §10).
>
> **Approved defaults:** server port **3000**; ship with a **seeded default blind structure and
> prize split** so it's usable out of the box.

---

## 1. Goals & constraints

- **Primary:** a rock-solid blind timer shown fullscreen on a TV from a Windows laptop via HDMI.
- **Bonus (in v1 scope):** control the tournament from a phone (pause/resume, edit time, players,
  seating) with the phone and TV **live-synced**.
- **Fully offline.** No venue WiFi. Devices share a network via a **phone hotspot** (laptop joins
  the phone's hotspot) or **Windows Mobile Hotspot** (phone joins the laptop's). The app never
  calls the internet.
- **Persistence:** blind structures, player rosters, and prize structures are saved to disk and
  reloadable. Live tournament state is also persisted for crash/refresh recovery.

## 2. Tech stack

- **Frontend:** React 18 + Vite + TypeScript. Clean modern **dark** theme, large legible numerals.
- **Backend:** Node.js (20+) + Express + `ws` (WebSocket). Single process.
- **State sync:** server is the **single source of truth**. Clients send commands over WebSocket;
  the server mutates state and **broadcasts the full state** to all clients. State is small, so
  full-state broadcasts keep things simple and always-consistent.
- **Persistence:** a single JSON file on disk (`server/data/db.json`), written atomically on every
  change. **Interval snapshots** (default every 2 min, `SNAPSHOT_INTERVAL_MS`) rotate into
  `server/data/backups/` (last 60), plus one on each startup. A **Restore** UI (`⤺ Restore` on the
  display / phone) lists snapshots with summaries and restores any of them via `GET /api/snapshots`
  + `POST /api/restore`. Snapshots (and a ~15s `CHECKPOINT_INTERVAL_MS` write to `db.json`) **freeze
  the live clock** so a restore/crash recovers the exact level *and time remaining*, not just the
  level. Crash recovery: restarting reloads the latest `db.json` and re-anchors the clock; snapshots
  give point-in-time rollback if a mistake or corruption happens.
- **Audio:** Web Audio API (chime) + Web Speech API `speechSynthesis` (TTS) — runs on the
  **display** client (speakers are on the TV via HDMI). No audio assets/downloads needed.

Keep dependencies minimal. No database server, no cloud, no auth.

## 3. Architecture

```
Laptop ──HDMI──> TV                 Phone (on same hotspot LAN)
  │                                    │
  ├─ Node server (Express + ws) ◄──────┘  http://<laptop-LAN-IP>:3000
  │    • authoritative tournament state
  │    • clock engine (server-driven)
  │    • JSON persistence
  │    • broadcasts full state on every change
  │
  └─ Browser (fullscreen) = DISPLAY view; also plays audio
```

- **Display view** (`/`): the TV screen. Read-mostly, but has Pause/Play + fullscreen. Plays audio.
- **Control view** (`/control`): operator/phone panel — all tabs (Players, Blinds, Prizes, Seating)
  plus clock controls. Responsive, mobile-first so it works well on a phone.
- Both views connect to the same WebSocket and reflect the same state instantly.

### Dev vs. production
- **Dev:** Vite dev server (client) + `tsx`/`nodemon` (server) run concurrently. Vite proxies
  `/api` and `/ws` to the Node server.
- **Prod (event):** `npm run build` bundles the client into `server/public`; `npm start` runs the
  Node server, serving the static bundle **and** the WebSocket on one port. One command to launch.
- **Standalone exe:** `npm run build:exe` → `dist/poker-timer.exe` (no Node needed). Pipeline: Vite
  builds the client as a **single inlined `index.html`** (`vite-plugin-singlefile`) → esbuild bundles
  the server to one CJS → Node **SEA** embeds both into a copied `node.exe` (via `postject`). At
  runtime `isSea()` switches paths: data → `poker-timer-data/` next to the exe, HTML → SEA asset,
  and it auto-opens the browser. See `scripts/build-exe.mjs`, `sea-config.json`.

## 4. Clock model (keeps TV + phone perfectly in sync)

The server owns the clock. State stores, per the current level:
- `levelIndex`, `running` (bool)
- `levelRemainingMs` — remaining at the last anchor
- `totalElapsedMs` — total elapsed at the last anchor
- `anchorEpochMs` — server time when the above were last set
- Every broadcast includes `serverNow` (server epoch ms).

Clients compute a **clock offset** = `serverNow - clientReceiveTime` and derive live values each
tick:
- `remaining = levelRemainingMs - (correctedNow - anchorEpochMs)` when running (else `levelRemainingMs`)
- `totalElapsed = totalElapsedMs + (correctedNow - anchorEpochMs)` when running

Commands re-anchor on the server:
- **Pause:** freeze `levelRemainingMs`/`totalElapsedMs` to computed values, `running=false`.
- **Play:** `anchorEpochMs=now`, `running=true`.
- **Edit time:** set `levelRemainingMs` directly, re-anchor.
- **Skip level (±):** change `levelIndex`, reset `levelRemainingMs` to that level's full duration.
- The server schedules level end; on expiry it advances the level, re-anchors, fires an **audio
  event**, and broadcasts.

## 5. Data model

Saved (reusable) collections + the live tournament. Shapes live in `shared/types.ts` (imported by
both client and server).

```ts
Level        { smallBlind; bigBlind; ante; durationMins; isBreak;
               lastRebuy? }                                 // lastRebuy: last level rebuys/add-ons allowed (one)
BlindStructure { id; name; levels: Level[] }
PrizeStructure { id; name; mode: 'cash'|'percentage'; places: number;
                 values: number[]; roundTo: number }       // integers only, round up
SavedPlayer  { id; name }                                   // reusable roster
Stakes       { buyInCash; buyInChips; rebuyCash; rebuyChips; addOnCash; addOnChips;
               addOnsEnabled: boolean; maxAddOns; maxRebuys } // maxes: 0 = unlimited
TournamentPlayer { id; name; savedPlayerId?; status: 'active'|'out';
                   rebuys: number; addOns: number }         // chips/cash DERIVED from counts × stakes
Table        { id; seats: (playerId|null)[] }               // text-based seating in v1
Stakes       { buyInCash; buyInChips; rebuyCash; rebuyChips; addOnCash; addOnChips }
Tournament   { name; blindStructureId; prizeStructureId; stakes: Stakes;
               anonymousCount: number|null;                 // players-left when name-less
               anonEntries; anonRebuys; anonAddOns;         // anon accounting for pool + chips
               players: TournamentPlayer[]; clock: ClockState;
               seating: { maxPerTable: number; tables: Table[] } }
AppSettings  { stakes: Stakes }                             // remembered across sessions
DB           { version; settings: AppSettings; savedPlayers;
               blindStructures; prizeStructures; tournament }
```

### Derived values (computed, never stored)
- **Player chips/cash are DERIVED** from `buy-in + rebuys + add-ons` × stakes — not a mutable
  stack. So a knockout doesn't remove chips from play (they went to the survivors) and a rebuy adds
  a fresh stack. (Fixes the 25k→30k bug: knockout keeps total, rebuy adds one stack.)
- **Total chips in play** — named: Σ over *all* players (active + out) of their bought chips;
  anonymous: `entries·buyInChips + rebuys·rebuyChips + addOns·addOnChips`.
- **Players remaining** = count of `status==='active'` (or `anonymousCount` in anonymous mode).
- **Chip average** = total chips ÷ players remaining (`N/A` if 0). *(Spec phrased this inverted;
  standard poker chip average = total chips per remaining player, which the reference screenshot
  confirms: 400 chips / 2 players = 200.)*
- **Prize pool** — named: Σ over all players of `buy-in + rebuys + add-ons` cash; anonymous:
  `entries·buyInCash + rebuys·rebuyCash + addOns·addOnCash`. The **Stakes** drive both modes' math.
  While the rebuy period is open (`rebuyPeriodOpen`), the pool is shown tagged **"not final"**.
- **Payouts:** from prize pool via the prize structure. Percentage mode → `roundUp(pool * pct)`;
  cash mode → the entered amounts. Integers only.

## 6. Features by view

### Display (TV)
Current level: **Small / Big / Ante** (Ante shows `–` when 0). Next level (same layout).
Round number (breaks are not numbered rounds). **Time left** (big), **Total elapsed**.
Chip average, total chips, player count. Prize pool + payouts (1st, 2nd, 3rd, …).
Pause/Play. Fullscreen toggle (Fullscreen API; note F11 also works). In fullscreen the top bar
auto-hides for an immersive timer and slides back in when the mouse moves to the top edge
(`clientY ≤ 72`).

### Players
A **Stakes** editor sets buy-in / rebuy / add-on **cash + chip** amounts (persisted), plus rules:
**Allow add-ons**, **Max rebuys/player**, **Max add-ons/player** (0 = unlimited). Named mode: add by
name (blank names rejected); per-player row shows **editable Rebuys & Add-ons counts**, derived
Chips, and always-visible **Rebuy / Add-on / Knock out** — plus **Undo KO** to reverse a mistaken
knockout (no rebuy counted). Rebuy works directly (no knock-out-first) and brings an out player back.
Buttons respect the caps and the **rebuy period** (closed once the clock passes the level marked
*Last rebuy* on the Blinds tab). Save roster for reuse (dedup). **Anonymous mode:** one-tap **+ New
entry / − Knock out / Rebuy / Add-on** adjust the aggregate counts, editable below.

### Blinds
Select / Save / Delete named structures. Editable rows: Round (auto 1..n, breaks excluded from
numbering), SB, BB, Ante (default 0), Duration (mins), Break (checkbox). Break rows: duration only.
**Bulk duration:** "Apply to all rounds" (or rounds + breaks) sets every level's duration at once.
**Last rebuy** checkbox marks the last level where rebuys/add-ons are allowed (single-select).
*(Stretch: a "Calculate" auto-generator and add-on/rebuy limits — only if time allows.)*

### Prizes
Radio: cash vs percentage. Choose number of paying places. Editable per-place table. "Used X of Y"
validity hint. Save / Delete. Integers only, round up.

### Seating (text-based in v1)
Tables use **fixed seats** (`seats[i]` = occupant of seat i+1, or null when vacant). Set **max per
table**; tables auto-calculated from active player count. **Randomize** for the initial draw (works
in anonymous mode too, using `Player 1…Player N` placeholders). Each seated player has **Rebuy** and
**Knock out** (knockout vacates the seat).

**Suggest-and-confirm rebalancing** (replaces a one-click merge). `rebalanceKind()` (deterministic,
drives the badges) and `suggestSeating()` (random seat draw, drives the card) live in `shared`:
- **Break** — as soon as the field fits on fewer tables, propose emptying the shortest table and
  moving its players to random vacant seats on the least-full remaining tables.
- **Balance** — else, if table sizes differ by ≥ 2, propose moving **one** random player from the
  fullest to the shortest table (re-suggests after each confirm until spread ≤ 1).
- Suggestions **auto-surface** (⚖ badge on the display, card on the phone/Seating tab) and via a
  manual "Suggest seating" button. **Nothing moves until confirmed.** Confirm sends
  `seating/applyMoves`, which the server **re-validates** (seats still vacant, players still seated,
  ≤ max) before applying — a stale move is refused with a notice. Emptied tables drop & renumber.
  Existing players never move. Named mode only (anonymous count can't name who moves).

Notices/warnings travel back to the originating client via a `ServerMessage` `error` → toast. No
table graphics in v1.

### Audio (on the display client)
- New round starts → pleasant chime + TTS **"Blinds up"**.
- Break level starts → TTS **"X minute break"** (e.g. "20 minute break").
- Browsers block autoplay until a user gesture — **arm audio on the first click** (e.g. the Start
  button) and note this in the UI.

## 7. Project structure

```
Bob Poker Timer/
  CLAUDE.md
  package.json            # root scripts: dev, build, start
  shared/types.ts         # types shared by client + server
  server/
    src/index.ts          # Express + ws wiring, static serving
    src/state.ts          # in-memory state + command handlers
    src/clock.ts          # clock engine + level scheduling
    src/seating.ts        # randomize / rebalance / merge (pure, unit-testable)
    src/persistence.ts    # atomic JSON read/write
    data/db.json          # persisted store (gitignored content, seeded on first run)
    public/               # built client (prod)
  client/
    index.html
    vite.config.ts
    src/main.tsx
    src/views/Display.tsx
    src/views/Control.tsx
    src/tabs/{Players,Blinds,Prizes,Seating}.tsx
    src/net/ws.ts         # WebSocket client + state hook + clock offset
    src/audio.ts
```

## 8. Commands

```bash
npm install          # root + workspaces
npm run dev          # Vite (client) + server with reload, concurrently
npm run build        # build client into server/public
npm start            # run production server (serve display + control + ws on one port)
```

At the event: connect laptop + phone to the same hotspot, run `npm start`, open the display
fullscreen on the TV, and browse to `http://<laptop-LAN-IP>:3000/control` on the phone.

## 10. Extensibility (design for growth)

v1 ships as a single-tournament, single-operator, offline tool — but nothing should hard-code that.
Structure so a larger system (multiple tournaments, saved history, multi-user, cloud/DB, auth) can
be layered on **without a rewrite**:

- **Typed command/event protocol.** All state changes flow through discriminated-union `Command`
  messages (`{ type: 'clock/pause' }`, `{ type: 'players/add', ... }`, …) and the server emits
  `Event`/state broadcasts. Adding a feature = adding a command variant + a handler. Defined once in
  `shared/protocol.ts`, used by both sides.
- **Persistence behind an interface.** `Store` interface (`load()/save()/…`) with a
  `JsonFileStore` implementation now. A future `SqliteStore`/`PostgresStore` drops in without
  touching domain code.
- **Pure domain core.** Clock, seating, prizes, payouts are pure functions with no I/O, no React,
  no WebSocket — independently testable and reusable by any future host (CLI, cloud worker, etc.).
- **Tournament-scoped from day one.** The live `tournament` sits under an addressable id even though
  there's only one now, so a `tournaments` collection + selector can be added later cleanly.
- **Feature-foldered UI.** Each tab/view is self-contained; shared types are the single contract.
- **No hidden globals / singletons that assume one game.** State is passed explicitly.

## 9. Conventions

- TypeScript everywhere; shared types are the contract between client and server.
- Seating/prize/clock logic is **pure and unit-testable**; keep it out of React components.
- The server never trusts client-computed time — it re-derives from its own clock.
- Money and chips are **integers** (round up where the spec requires).
- Prefer clarity and reliability over cleverness. This runs live, once, with no ops team.
```
