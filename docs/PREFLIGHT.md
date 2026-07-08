# Pre-demo live test (dry run)

Run through this once, **well before** you record — it takes about 15 minutes and
exercises every feature the video shows. Every step says what you should see, so
a problem is obvious immediately instead of mid-recording.

## Step 1 — Clean start (1 min)

Old Terrace processes hold onto the room and make new ones flake. In any
PowerShell window:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

No output means nothing was running — that's fine.

## Step 2 — Start the three terminals (3 min)

Open three PowerShell terminals in the `terrace` folder.

**Terminal 1 — the local DHT** (helps the two peers find each other):
```powershell
npm run dht
```
You should see: a line saying the bootstrap node is listening. Leave it running.

**Terminal 2 — Alice (AI on):**
```powershell
$env:SWARM_BOOTSTRAP="1"; npm start -- --room DEMO-ROOM --name Alice --lang English --port 3600
```
You should see: `UI on http://127.0.0.1:3600`, then `joined room DEMO-ROOM as Alice`.

**Terminal 3 — Bruno (chat only):**
```powershell
$env:SWARM_BOOTSTRAP="1"; npm start -- --room DEMO-ROOM --name Bruno --lang Spanish --port 3601 --no-ai
```
You should see: the same two lines for Bruno, and within a few seconds **both**
terminals print `peer joined`.

Now wait for Terminal 2 to print **`companion ready`** (about 15 seconds — the
model is already on this machine). Nothing involving the AI works before this.

## Step 3 — Test everything in the browser (8 min)

Open `http://127.0.0.1:3600` (Alice) and `http://127.0.0.1:3601` (Bruno) in two
browser windows, side by side.

Work down this list in order. Each line is: **do this → you should see this.**

1. **Both pages load** → the room view with `DEMO-ROOM` at the top (no landing
   page — the `--room` flag skips it).
2. **Look at the top bar on both** → `IN THE STAND · 2` and the LIVE chip
   showing. If it says `· 1`, the peers haven't connected — see fixes below.
3. **Look at the chat feed** → each window shows a notice that the other fan is
   in the stand (e.g. `BRUNO (NG) IS IN THE STAND`).
4. **Check Alice's companion lamp** → it should be in its "ready" state, not
   "warming". Bruno's says `COMPANION OFF` — correct, he started with `--no-ai`.
5. **Alice: type a message and send** → it appears instantly in **both** windows.
6. **Bruno: paste and send the demo's Spanish line** →
   `¡Qué golazo! El árbitro no vio nada en esa jugada.` — it appears instantly
   in Alice's window, **accents intact** (¡ and á display correctly).
7. **Alice: click TRANSLATE on Bruno's message** → the button becomes `…`, and
   after roughly 10–30 seconds an English translation appears under the message
   and the button disappears. This pause is normal — it's the on-device model
   working. Don't click anything else while you wait the first time.
8. **Alice: switch the composer to ASK and send** →
   `Why would a goal be disallowed for offside?` — after a similar pause a
   `COMPANION · ON THIS DEVICE` block appears with a plain-speech answer.
9. **Alice: click the room code at the top** → a `ROOM CODE COPIED` notice.
10. **Bruno: send one more message** → still instant, even right after the AI
    work. Chat never waits for the companion.

If all ten pass, the demo will work. The app is ready.

## Step 4 — If something goes wrong

| Symptom | Fix |
|---|---|
| `IN THE STAND · 1`, no LIVE chip, no "is in the stand" notice | The peers can't find each other. Almost always stale processes or a missed step. Close terminals 2 and 3, run the Step 1 kill command, check Terminal 1 (the DHT) is still running, and restart terminals 2 and 3 — the `$env:SWARM_BOOTSTRAP="1"` part must be on the same line as `npm start`. |
| `companion ready` never appears in Terminal 2 | Read Terminal 2's output — if it says `companion unavailable`, chat still works but TRANSLATE/ASK won't. Restart Terminal 2. If it persists, record the chat-only parts and re-check; the model is cached so no download is involved. |
| TRANSLATE stuck on `…` for over a minute | The app now times these out on its own — a "took too long" notice will appear and the button comes back. Click it again once. |
| A page won't load | The matching terminal probably crashed — look at it, press up-arrow, run the command again, refresh the page. |
| Anything else weird | Nuclear option, fixes everything: close all three terminals, Step 1 kill command, start again from Step 2. Fresh runs are reliable. |

## Step 5 — Reset before the real recording (important)

Your test messages **stay in the chat feed** — if you record straight after the
dry run, the video opens on a feed full of test chatter.

Before recording: close terminals 2 and 3 (Ctrl+C), run the Step 1 kill command,
and start terminals 2 and 3 again (Terminal 1 can stay). Wait for
`companion ready`, confirm `IN THE STAND · 2`, then pick up
`docs/DEMO_SCRIPT.pdf` and hit record on a clean room.
