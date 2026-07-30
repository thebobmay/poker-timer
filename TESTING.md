# Bob Poker Timer — Test Plan

Goal: prove the app is ready to run a **live tournament** on real hardware. Work top-to-bottom.
Each item has a checkbox and the **expected** result. Priorities:

- **P0** — must pass before the event (a failure here can break the tournament).
- **P1** — should pass (degrades the experience if broken).
- **P2** — nice-to-have / polish.

> Tip: for the persistence/restore tests, start the server with a short snapshot interval so you
> don't wait 2 minutes: `SNAPSHOT_INTERVAL_MS=15000 npm start` (15s). Use the default for the real event.

---

## 0. Environment & setup (P0)

- [ ] `npm install` completes with no errors.
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes (26+ unit tests green).
- [ ] `npm run build` completes; `server/public/` is populated.
- [ ] `npm start` boots, prints the LAN URLs and "snapshots every 120s".
- [ ] Open `http://localhost:3000/` → **Display** loads (timer + blinds visible), no console errors (F12).
- [ ] Open `http://localhost:3000/control` → **Control** (phone layout) loads.
- [ ] Do the above on the **actual event laptop** and the **actual TV** over HDMI, and on **your phone**.

**Browsers to check:** the laptop's real browser (Chrome/Edge/Firefox), and your phone's browser.

---

## 1. Clock / timer (P0 — the heart of the app)

- [ ] Press **▶** — timer counts down second-by-second; status shows **IN PLAY**.
- [ ] Press **❚❚** — timer freezes exactly; status shows **PAUSED**. Wait 20s, resume — it continues from where it froze (no lost/gained time).
- [ ] **Total time** increments only while running, and keeps accumulating across level changes.
- [ ] **−1m / +1m** adjust the remaining time correctly (and can't go below 0:00).
- [ ] **⏭ (next level)** advances to the next level, remaining resets to that level's full duration.
- [ ] **⏮ (prev level)** goes back a level.
- [ ] Let a short level run to **0:00** → it **auto-advances** to the next level and re-anchors total time.
- [ ] Under 1:00 remaining, the timer turns **red and pulses**.
- [ ] **Round numbering**: playing levels show "Round N"; break levels show **BREAK** (breaks are not numbered).
- [ ] Reach the **final level** and let it expire → clock **stops** (doesn't crash or wrap around).
- [ ] Current + **Next** blinds are correct (Ante shows **–** when 0). Next shows **BREAK** when the next level is a break.
- [ ] The **Upcoming** panel lists the next few levels; breaks show in amber.

---

## 2. Audio (P1 — verify on the EVENT laptop's speakers/TV)

- [ ] Click **🔊 Enable sound** once (required by the browser).
- [ ] Advance into a **playing** level → pleasant chime + spoken **"Blinds up."**
- [ ] Advance into a **break** level → spoken **"X minute break"** (matches the break's duration).
- [ ] TTS voice is intelligible over HDMI to the TV at event volume. *(If the voice is poor, note it — it's OS/browser-dependent.)*
- [ ] If you refresh the page mid-event, remember you must click **Enable sound** again.

---

## 3. Blinds tab (P0)

- [ ] Open **Blinds**. The default structure loads with rounds + breaks.
- [ ] Edit a small/big/ante value, click **Save** → the Display's current/next blinds reflect it (if it's the active structure).
- [ ] Change a **Duration**, Save → future levels use it (note: the *currently running* level's clock doesn't change — that's by design; use the Display's time controls).
- [ ] Toggle a row's **Break** checkbox → that row shows only a duration; round numbers renumber correctly.
- [ ] **+ Add level** / **+ Add break** append rows.
- [ ] Remove a row (✕).
- [ ] **Set every round to [N] mins → Apply to all rounds** → all non-break durations become N. **Apply to rounds + breaks** → all durations become N. (Then Save.)
- [ ] **Save as new** creates a copy and selects it; the dropdown lists both.
- [ ] **Select** a different structure from the dropdown → clock resets to level 1 of that structure.
- [ ] **Delete** a non-active structure.
- [ ] Enter your **real event blind structure**, Save it, and select it. ✅ (do this for the actual event)

---

## 4. Players — named mode (P0)

- [ ] Confirm **Count only** is **unchecked**.
- [ ] Set the **Stakes** (Buy-in / Rebuy / Add-on cash + chips) to your event values.
- [ ] **Add Player** with a name → appears in the table; "buys in for $X / Y chips" note matches stakes.
- [ ] Add Player with a **blank name** → added as "—" (allowed).
- [ ] Edit a player's **Cash in** / **Chips** inline.
- [ ] **Knock out** a player → row dims to **OUT**; Players count drops; they leave the seating chart.
- [ ] **Rebuy** an OUT player → back to **IN**, chips + pool increase by the rebuy stake; Rebuys count ticks.
- [ ] **Add-on** → chips + pool increase by the add-on stake.
- [ ] **✕ remove** deletes the player entirely.
- [ ] **Derived values** are correct: Total Chips = Σ active chips; Chip Average = total ÷ players (N/A at 0); Prize Pool = Σ all buy-ins + rebuys + add-ons.

### Roster (saved players)

- [ ] **Save player** adds a name to the roster.
- [ ] Saving a **duplicate name** (any case) is **rejected** with a toast; roster count unchanged.
- [ ] Click **+ Name** to add a saved player to the game.
- [ ] That saved player now shows **✓ Name greyed out** and can't be added again.
- [ ] Clicking a greyed player does nothing; clicking it via a second device also blocked (toast "already in the tournament").
- [ ] **Remove** the player from the game → the roster entry becomes **+ Name** (addable) again.
- [ ] **✕** on a roster chip deletes the saved player from the roster.

---

## 5. Players — count-only mode (P0 if you'll use it)

- [ ] Check **Count only (no names)**.
- [ ] **+ New entry** (×N) → Players left and Entries both go up by N.
- [ ] **− Knock out** → Players left −1 (Entries unchanged); floors at 0 (can't go negative).
- [ ] **Rebuy (+player)** → Players left +1 and Rebuys +1.
- [ ] **Add-on** → Add-ons +1 (Players left unchanged).
- [ ] Manually edit the number fields → values update; pool/chips recompute.
- [ ] **Prize Pool** = entries×buyin + rebuys×rebuy + add-ons×addon (matches the on-screen formula).
- [ ] **Total Chips / Chip Average** computed from the counts × stakes (avg rises as players bust).
- [ ] Uncheck Count only → back to named mode.

---

## 6. Prizes tab (P0)

- [ ] Open **Prizes**. Default 50/30/20 loads.
- [ ] **Percentage** mode: set places = 3, values 50/30/20 → **Used: 100% of 100%**.
- [ ] Payout column = roundUp(pool × pct); with a real pool the numbers look right and are **whole dollars**.
- [ ] Make percentages exceed 100% → **Used** turns red (over).
- [ ] Switch to **Cash** mode → enter fixed dollar amounts; payouts show those amounts.
- [ ] Change **# of places** (e.g., 5) → table grows; extra places default to 0.
- [ ] **Round to** (e.g., 5) → payouts round up to the nearest $5.
- [ ] **Save / Save as new / Delete** behave like Blinds.
- [ ] Display's **Prize Pool** and 1st/2nd/3rd… payouts match the tab. ✅ enter your real payout scheme.

---

## 7. Seating & rebalancing (P0 — the most complex area)

Set up: named mode, ~9–18 players, a **Max per table** (e.g., 9 or your real value).

- [ ] **Randomize** → players spread across the right number of tables, roughly even; each has a seat number; empty seats show "empty".
- [ ] Per-player **Rebuy** and **Knock out** work from the seating chart (knockout vacates the seat).
- [ ] Change **Max per table** and Randomize again → table count recalculates.

### Suggestions

- [ ] Knock players out until the field fits on **fewer tables** → a **⚖ break suggestion** auto-appears (Seating tab card + amber badge on Display + card on phone).
- [ ] The card lists **exact moves** ("Name · Table X → Table Y, seat Z"). Read them out loud — they make sense.
- [ ] **Confirm** → the emptied table disappears, players move only into vacant seats, **everyone else stays put**, no table exceeds max.
- [ ] **Re-draw seats** → different random destinations for the movers.
- [ ] **Dismiss** → card hides; it reappears after the next seating change (knockout).
- [ ] Create an **uneven** situation (tables differ by ≥2) with no break possible → a **balance suggestion** proposes moving **one** player fullest→shortest; Confirm; if still uneven it suggests again.
- [ ] **Suggest seating** button forces a fresh proposal on demand.
- [ ] Try to force a merge that **wouldn't fit** (small max, full tables) → **warning toast**, nothing moves.
- [ ] **Clear** empties the chart.
- [ ] Count-only mode: seating uses **Player 1…N** placeholders; per-player buttons and suggestions are hidden (by design).

---

## 8. Multi-device sync (P0)

Open the **Display on the laptop** and the **Control on the phone** at the same time.

- [ ] Pause/resume on the phone → the TV reflects it **immediately**; timers stay in lock-step to the second.
- [ ] Add/knock-out a player on the phone → the TV's counts/pool update instantly, and vice-versa.
- [ ] Open the same tab on both → edits on one appear on the other.
- [ ] A seating suggestion appears on **both** surfaces; confirming on one updates both.
- [ ] Open a **third** client (another browser tab) → it loads current state immediately on connect.
- [ ] Kill WiFi/hotspot briefly → "Reconnecting…" banner shows; restore it → reconnects and re-syncs without a manual refresh.

---

## 9. Persistence & crash recovery (P0)

- [ ] **Refresh** the Display mid-count → reloads to the exact same state (clock keeps going, players intact).
- [ ] **Stop the server** (Ctrl-C) while a level is running, then `npm start` again → state restored; running clock **resumes from where it was** (does not jump forward by the downtime).
- [ ] Close the laptop lid / let it **sleep** for a minute, wake it → the app is still correct after reconnect.
- [ ] Let the snapshot interval elapse a couple times (use `SNAPSHOT_INTERVAL_MS=15000`), confirm files appear in `server/data/backups/`.
- [ ] **⤺ Restore** (Display or phone) lists snapshots newest-first with summaries (round · players · pool · tables).
- [ ] Make a **mistake** (e.g., accidentally Clear seating or knock the wrong person out), then Restore an earlier snapshot → the mistake is undone across chips/players/pool/blinds/prizes/**seating**. Confirm dialog appears first.
- [ ] After restore, all connected devices show the restored state.
- [ ] Simulate corruption: stop server, hand-edit `server/data/db.json` to invalid JSON, start → server backs up the corrupt file and starts fresh (doesn't crash); the corrupt copy is in `backups/`.

---

## 10. Fullscreen & display polish (P1)

- [ ] Click **Fullscreen** (or F11) on the laptop → true fullscreen on the TV.
- [ ] The **top bar auto-hides**; timer/blinds fill the screen.
- [ ] Move the mouse to the **top edge** → the bar slides back in with all tabs; move away → it hides.
- [ ] Exit fullscreen via **Esc**, and via mouse-to-top → **Fullscreen** button.
- [ ] Numbers are **legible from across the room** on the actual TV (check 1080p and/or 4K).
- [ ] No horizontal scrollbars; nothing clipped at the TV's real resolution/overscan.
- [ ] Phone layout: buttons are tappable, no content cut off in portrait.

---

## 11. Networking at the venue (P0 — the offline story)

- [ ] **Allow the port through Windows Firewall on the event laptop** (one-time, REQUIRED for hotspot):
  in an **Administrator** PowerShell run `scripts/allow-firewall.ps1` (or the `New-NetFirewallRule`
  one-liner in the README). A hotspot is a *Public* network and Windows blocks inbound there by
  default — this is the usual reason "works on home WiFi, fails on hotspot."
- [ ] **Turn OFF any VPN on the phone.** A phone VPN tunnels *all* traffic — including requests to the
  laptop's local `192.168.x.x` — so the control page won't load until it's off. (Client-side, not the
  laptop: it blocks regardless of the laptop's firewall/network.)
- [ ] With **no internet**, start the phone **hotspot**, connect the **laptop** to it.
- [ ] From the Display, **📱 Phone** shows a `http://192.168.x.x:3000/control` URL.
- [ ] Type that URL on the phone **with `http://`** → Control loads and syncs. (Zero venue WiFi.)
- [ ] Reconnect after the phone locks/sleeps → resyncs.
- [ ] If it still fails: confirm the phone shows the *hotspot* 192.168.x.x address (not a Hyper-V
  `172.x` or a `169.254.x` one), and as a firewall check temporarily
  `Set-NetFirewallProfile -Profile Public -Enabled $false` (admin) — if it connects, keep the allow
  rule and re-enable the firewall.

---

## 12. Edge cases & stress (P1)

- [ ] **0 players**: Chip Average shows **N/A**, no divide-by-zero, payouts show $0.
- [ ] **1 table / 1 player**: no bogus seating suggestions.
- [ ] Rapidly click Pause/Play and Next/Prev many times → no desync, no negative time, no crash.
- [ ] Set a level **Duration to 0** → advancing through it doesn't hang.
- [ ] Very **large** player count (e.g., 30–50) → seating, suggestions, and lists stay responsive.
- [ ] Long tournament name / long player names → layout doesn't break.
- [ ] Delete the **active** blind or prize structure → app falls back gracefully (selects another / clears).
- [ ] Enter negative or non-numeric values in fields → coerced/clamped, no NaN on the Display.

---

## 13. Full dry-run (P0 — do this at least once end-to-end)

Run a compressed mock tournament (use 1–2 minute levels so it's quick):

1. [ ] Enter your **real blind structure** and **prize scheme**; set **stakes**.
2. [ ] Register your field (names or count).
3. [ ] **Randomize** seating.
4. [ ] **Start** the clock; verify blinds-up audio on the first auto-advance.
5. [ ] Take a **break** level; verify the break announcement.
6. [ ] **Knock out** several players over time; do a couple **rebuys** and an **add-on**.
7. [ ] Accept a **table-break suggestion** and a **balance suggestion**; read the moves aloud.
8. [ ] Manage it all from the **phone** for a stretch while watching the TV.
9. [ ] Deliberately do something wrong, then **Restore** a snapshot.
10. [ ] Play down to the final places; confirm **payouts** match your intended split and are whole dollars.
11. [ ] Note anything that felt awkward or wrong → bring it back for fixes.

---

## 14. Event-day final checklist (P0 — the morning of)

- [ ] Laptop charged / plugged in; **sleep/screensaver disabled** (Windows power settings).
- [ ] HDMI to TV works; resolution correct; overscan OK.
- [ ] `npm start` running; Display fullscreen on the TV.
- [ ] **Enable sound** clicked; volume set; test one announcement.
- [ ] **Firewall rule added** (`scripts/allow-firewall.ps1` as admin) so the phone can reach the laptop.
- [ ] **VPN OFF on the phone** (it tunnels local traffic and blocks the control page).
- [ ] Phone on the same hotspot; Control URL bookmarked and working.
- [ ] Blind structure, prize scheme, and stakes entered and **saved**.
- [ ] Players/seating set.
- [ ] You know where **⤺ Restore** is, just in case.
- [ ] A backup plan if the laptop dies (paper structure sheet?).

---

## Known limitations / watch-list

- TTS voice quality depends on the OS/browser — verify on the real machine.
- Production mode doesn't hot-reload; after any code change, restart `npm start`.
- `npx tsx` can leave an orphaned process holding port 3000 — if you see `EADDRINUSE`, kill it or reboot the terminal.
- `server/data/db.json` is the **live data** — never delete it. Backups live in `server/data/backups/`.
- Seating fairness moves players **randomly** (no dealer-button tracking in v1) — intentional, matches a card-draw.
- Manual "Add Player" allows duplicate typed names on purpose (two real people can share a name); only the **roster** flow dedupes.
