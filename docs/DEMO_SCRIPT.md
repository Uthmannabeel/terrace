# Demo video script (target: under 3 minutes)

Shot-by-shot plan for the Tether Developers Cup submission video. Two Terrace
windows side by side on one machine — Alice (left, with AI) and Bruno (right,
chat-only) — like two fans in different countries.

## Before you press record

Do this once; it takes ~2 minutes and prevents every known flake.

1. **Kill stray Node processes** (stale swarms make peers fail to connect):
   ```powershell
   Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
   ```
2. Open **three PowerShell terminals** in the `terrace` folder.
3. Terminal 1 — local DHT (leave it running):
   ```powershell
   npm run dht
   ```
4. Terminal 2 — Alice's seat (AI on):
   ```powershell
   $env:SWARM_BOOTSTRAP="1"; npm start -- --room DEMO-ROOM --name Alice --lang English --port 3600
   ```
5. Terminal 3 — Bruno's seat (chat only, starts fast):
   ```powershell
   $env:SWARM_BOOTSTRAP="1"; npm start -- --room DEMO-ROOM --name Bruno --lang Spanish --port 3601 --no-ai
   ```
6. Open `http://127.0.0.1:3600` and `http://127.0.0.1:3601` in two browser
   windows, arranged **side by side**.
7. **Wait for Alice's terminal to say `companion ready`** (the model is already
   cached in `~/.qvac`, so this is the load time only — a minute or two).
   Do not start recording until you see it.
8. Confirm both pages show **1 peer connected**.

## The recording (3 scenes)

### Scene 1 — The hook (0:00–0:30)

Screen: your face or the two windows. Say roughly:

> "This is Terrace — peer-to-peer watch parties for football, with an AI match
> companion that runs entirely on your device. No servers, no accounts, no API
> keys. It's built on two Tether stacks: rooms run on Pears — Hyperswarm — and
> the AI is QVAC, a language model living on my machine. These two windows are
> two fans. The only thing they share is a room code."

Point at the room code on screen (`DEMO-ROOM`).

### Scene 2 — P2P chat + translate (0:30–1:45)

1. In **Bruno's** window type a Spanish message, e.g.:
   `¡Qué golazo! El árbitro no vio nada en esa jugada.`
2. Show it arriving **instantly** in Alice's window — say:
   > "That went peer to peer. Straight from one machine to the other — there is
   > no server in the middle."
3. In **Alice's** window click **TRANSLATE** on Bruno's message.
4. While it generates (a few seconds), say:
   > "Alice doesn't speak Spanish, so she taps translate — and this translation
   > is happening on her own laptop. Bruno's message never leaves the room,
   > nothing goes to the cloud."
5. Show the English translation appearing under the message.

### Scene 3 — Ask the companion + close (1:45–2:50)

1. In Alice's window, ask the companion:
   `Why would a goal be disallowed for offside?`
2. While it answers, say:
   > "The companion answers using the room's chat as context — like the friend
   > in the stand who actually knows the rules. It works in a stadium dead zone,
   > on a throttled match-day network, anywhere cloud AI can't go."
3. Show the answer. Then the close:
   > "Terrace: a watch party that belongs to the fans in it. Pears for the room,
   > QVAC for the brain, nothing in between. Thanks."

## Timing notes

- The model generates at ~6 tokens/second — **keep talking while it thinks**;
  the waiting moments are exactly when you deliver the privacy lines.
- If a generation feels long, that's fine — one translate + one ask fits in
  3 minutes with room to spare.
- If anything glitches, stop, kill the node processes (step 1), and restart —
  fresh runs are reliable.

## Upload checklist

- YouTube, **unlisted**, length ≤ 3:00.
- Title: `Terrace — Tether Developers Cup demo`.
- Paste the link into the DoraHacks BUIDL submission alongside
  `https://github.com/Uthmannabeel/terrace`.
