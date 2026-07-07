# Terrace

**Peer-to-peer watch parties for football, with an on-device AI match companion.**
No servers. No accounts. No API keys.

Built for the [Tether Developers Cup](https://dorahacks.io/hackathon/tether-developers-cup)
on two Tether stacks at once: rooms run on the **Pears stack** (Hyperswarm) and the
companion runs on **QVAC** — a language model living entirely on your device.

## What it does

- **Open a room, shout the code.** A room is just a code like `AB2C-DEF3`. Anyone
  who starts Terrace with that code lands in the same stand — peers connect
  directly to each other over the Hyperswarm DHT. There is no server to pay for,
  moderate you, or go down at full time.
- **Chat with the stand.** Live fan chat, peer to peer.
- **Tap TRANSLATE on any message.** A Brazilian and a Japanese fan can banter —
  the translation happens on your own machine. Nobody's messages leave the room.
- **Ask the companion.** "Why was that disallowed?" — the on-device model answers
  in plain speech, using the room's recent chat as context. Works even where
  cloud AI can't: stadium dead zones, throttled match-day networks, or countries
  where those services aren't available.

## Run it

Requires Node.js ≥ 22.17.

```bash
npm install
npm start                              # opens a new room, prints its code
npm start -- --room AB2C-DEF3 --name Marta --lang English
```

Then open the printed URL (default `http://127.0.0.1:3600`). The AI model
(~740 MB) downloads to `~/.qvac` on first run and is reused after that.

Useful flags: `--name` your display name · `--lang` the language TRANSLATE
targets · `--port` UI port · `--no-ai` skip the model (chat only).

### Two-seat demo on one machine

```bash
npm run dht                                              # terminal 1 (local DHT)
$env:SWARM_BOOTSTRAP="1"; npm start -- --room DEMO-ROOM --name Alice --port 3600            # terminal 2
$env:SWARM_BOOTSTRAP="1"; npm start -- --room DEMO-ROOM --name Bruno --port 3601 --no-ai    # terminal 3
```

The `SWARM_BOOTSTRAP` variable points peers at the local DHT from terminal 1 —
used for development and for networks that block the public DHT. On normal
networks, skip terminal 1 and the variable entirely.

## Verify it works

```bash
npm test              # 41 tests: protocol, rooms (real sockets), companion, feed
npm run smoke         # headless end-to-end: page → P2P → page
npm run verify:ai     # live QVAC check (translate + explain)
```

## How it's built

Full picture with diagram and trust boundaries: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src/protocol/    versioned wire format — every peer frame validated, capped, allowlisted
src/room/        room codes → Hyperswarm topics; RoomSession (join/broadcast/events)
src/companion/   QVAC model, loaded once; single-lane bounded queue; prompt builders
src/app/         entry point + feed state
src/ui/          local page (served on 127.0.0.1) + WebSocket bridge
```

Design notes:

- **Peers are hostile input.** Every incoming frame is size-capped, schema-checked,
  and rebuilt field-by-field before it touches the app. Malformed traffic is
  dropped without ceremony.
- **Chat never waits for the AI.** Generation on modest hardware is slow, so the
  companion works through a small bounded queue; translations arrive when ready.
- **Fully offline-capable.** System fonts, no CDNs, no telemetry. With a local
  DHT bootstrap, an entire room can run on a LAN with zero internet.

## License

MIT
