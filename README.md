# Bob Poker Timer

A poker tournament clock + manager. The laptop drives a **TV over HDMI** and hosts a **phone
remote** over a local hotspot — no internet or venue WiFi required. Built with React + Vite +
TypeScript and a small Node/Express + WebSocket server. See `CLAUDE.md` for architecture.

## Quick start (development)

```bash
npm install
npm run dev
```

- Display (TV): http://localhost:5173/
- Control (phone/operator): http://localhost:5173/control

The Vite dev server proxies to the Node server on port 3000.

## Running it for the event (production)

```bash
npm start
```

This builds the client and runs the server on **one port (3000)**, serving both views and the live
sync. The console prints the URLs, including your LAN address.

- On the laptop, open **http://localhost:3000/** and press **⛶ Fullscreen** (or F11). Plug into the
  TV via HDMI.
- Click **🔊 Enable sound** once so the "Blinds up" / break announcements can play.

## Standalone executable (no Node.js needed)

To run the timer on the event laptop **without installing Node.js**, build a single self-contained
`.exe` (it bundles the Node runtime + the whole app):

```bash
npm install      # once, on a machine that has Node
npm run build:exe
```

This produces **`dist/poker-timer.exe`** (Windows). Copy that one file to a **writable folder**
(e.g. the Desktop) on the event laptop and double-click it:

- A console window opens showing the URLs; the display opens automatically in your browser.
- It saves data to a **`poker-timer-data/`** folder created next to the exe (so keep the exe somewhere
  writable — not inside `Program Files`).
- Close the console window to stop the timer.
- First launch may show a Windows SmartScreen prompt (the exe is unsigned) — choose *More info →
  Run anyway*.

Change the port with an env var if needed: `set PORT=4000 && poker-timer.exe`.

### Connect your phone (no venue WiFi needed)

1. Turn on your **phone's hotspot** and connect the **laptop** to it (the laptop keeps driving the
   TV over HDMI). Alternatively use Windows **Mobile Hotspot** and join it from the phone.
2. On the laptop display, click **📱 Phone** — it shows the address to type, e.g.
   `http://192.168.x.x:3000/control` (type the `http://` explicitly on the phone).
3. **Allow it through Windows Firewall.** A phone hotspot is a *Public* network, and Windows blocks
   incoming connections on Public networks by default — so the phone can't reach the laptop until you
   allow the port. (This is why it works on your home Wi‑Fi, which is *Private* and already allowed,
   but not over a hotspot.) In an **Administrator** PowerShell on the laptop:

   ```powershell
   # Scoped: only on Public networks, only port 3000 — home/Private Wi-Fi stays closed.
   powershell -ExecutionPolicy Bypass -File scripts\allow-firewall.ps1
   # Optionally restrict to just the hotspot's device range:
   #   ...\allow-firewall.ps1 -Subnet 192.168.x.0/24
   ```

   The rule is **removable** — close the port again after the event with
   `scripts\remove-firewall.ps1` (admin). Nothing is opened permanently unless you leave it.
4. Open the address on the phone. It stays in sync with the TV automatically — pause/resume, edit
   time, manage players, prizes, and seating all from your hand.

## Using it

- **Display**: current + next blinds, round, time left, total elapsed, chip average, total chips,
  players, prize pool + payouts. Play/pause, ⏮/⏭ skip a level, ±1 min time nudge.
- **Players**: set the **buy-in / rebuy / add-on** cash + chip amounts once (they drive the prize
  pool). Add by name, knock out / rebuy / add-on, save a reusable roster. "Count only" mode has
  one-tap **New entry / Knock out / Rebuy / Add-on** buttons (plus editable totals) and computes the
  pool + chips from the stakes.
- **Blinds**: edit/save/select named structures; break rows use duration only. "Apply to all rounds"
  sets every level's duration at once.
- **Prizes**: cash or percentage, choose paying places, payouts computed from the prize pool
  (integers, rounded up).
- **Seating**: set max per table, randomize the initial draw, per-player **Rebuy / Knock out**, and
  a **suggest-and-confirm** rebalancer. When tables need breaking or evening out, the app proposes
  the exact moves ("Ha → Table 1, seat 3") — you just Confirm (or Re-draw / Dismiss). Nothing moves
  until you confirm, it never exceeds max per table, and seated players stay put.

Everything is saved to `server/data/db.json` and reloads automatically — including mid-tournament
state, so a laptop sleep or browser refresh won't lose the clock. On top of that, the server writes
**recovery snapshots** every ~2 minutes (and on startup) to `server/data/backups/`. If something goes
wrong, click **⤺ Restore** (on the display or phone) and pick a point in time — it restores chips,
players, prize pool, blinds, prizes, and seating. Change the cadence with `SNAPSHOT_INTERVAL_MS`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Client + server with hot reload |
| `npm run build` | Build the client into `server/public` |
| `npm start` | Build + run the production server on port 3000 |
| `npm run build:exe` | Build the standalone `dist/poker-timer.exe` (no Node needed to run) |
| `npm run typecheck` | Type-check all packages |
| `npm test` | Run the domain unit tests |

Change the port with `PORT=4000 npm start`.

## Event-day checklist

- [ ] `npm start` runs and the display loads on the laptop.
- [ ] Fullscreen on the TV looks right; numbers are legible from across the room.
- [ ] **Enable sound** clicked; a level change says "Blinds up".
- [ ] Blind structure entered/selected (a sensible default ships out of the box).
- [ ] Players (or a count) entered; prize pool + payouts look right.
- [ ] Phone connected via hotspot and can pause/resume the clock.
- [ ] (Optional) Know where **⤺ Restore** is, in case you need to roll back after a mishap.
