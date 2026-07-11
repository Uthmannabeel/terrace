# Terrace — Architecture

Terrace is two Tether stacks joined at one seam: **Pears (Hyperswarm)** carries the
room, **QVAC** carries the intelligence. There is no third party anywhere — no
server, no accounts, no cloud AI, no API keys.

## The big picture

```
        Fan A's machine                                Fan B's machine
┌─────────────────────────────┐                ┌─────────────────────────────┐
│  Browser (127.0.0.1:3600)   │                │  Browser (127.0.0.1:3601)   │
│  index.html · app.js        │                │                             │
│        │  WebSocket          │                │        │  WebSocket         │
│  ┌─────▼──────────────────┐ │                │ ┌───────▼────────────────┐  │
│  │ ui/server.js (bridge)  │ │                │ │ ui/server.js (bridge)  │  │
│  └─────┬──────────────────┘ │                │ └───────┬────────────────┘  │
│  ┌─────▼──────────────────┐ │                │ ┌───────▼────────────────┐  │
│  │ app/main.js            │ │                │ │ app/main.js            │  │
│  │  · roomFeed (state)    │ │                │ │                        │  │
│  └──┬──────────────────┬──┘ │                │ └───┬────────────────────┘  │
│  ┌──▼───────────┐ ┌────▼──┐ │   encrypted    │ ┌───▼──────────┐            │
│  │ RoomSession  │ │Compan-│ │   P2P stream   │ │ RoomSession  │            │
│  │ (Hyperswarm) ◄─┤ ion   │ ├────────────────► │ (Hyperswarm) │            │
│  └──────────────┘ │(QVAC) │ │  ndjson frames │ └──────────────┘            │
│                   └───┬───┘ │                └─────────────────────────────┘
│              Llama 3.2 1B   │
│              (~/.qvac, on   │        Discovery: Hyperswarm DHT
│               device only)  │        (topic = sha256 of room code)
└─────────────────────────────┘
```

One process = one fan's seat. Each seat runs a tiny localhost web UI, a
Hyperswarm session for the room, and (optionally) a resident on-device model.

## Modules

| Module | Job |
|---|---|
| `src/protocol/` | Versioned wire format. `parseMessage` never throws: size-cap **before** `JSON.parse`, version check, kind allowlist, then the message is **rebuilt field-by-field** so unexpected keys (including `__proto__`) never reach the app. |
| `src/room/` | `code.js` — human-friendly room codes (`AB2C-DEF3`, no 0/O/1/I ambiguity) hashed into a 32-byte Hyperswarm topic under a versioned namespace. `frame.js` — ndjson line splitter with a capped accumulator (a peer that never sends `\n` gets disconnected, not our memory). `roomSession.js` — wraps Hyperswarm: join/broadcast/leave, emits `message` / `peer-join` / `peer-leave`. |
| `src/companion/` | `companion.js` — single-lane **bounded queue** (max 4) in front of the model, so slow generation can never block chat; over-capacity asks are refused politely rather than piling up. `qvacClient.js` — the only file that touches `@qvac/sdk`: load Llama 3.2 1B once, keep it resident, stream completions with an output-token cap. `prompts.js` — translate/explain prompt builders. |
| `src/app/` | `main.js` — wires everything; `roomFeed.js` — immutable chat feed state, provides recent-context lines for the companion. |
| `src/ui/` | Static page + WebSocket bridge, bound to **127.0.0.1 only**, serving from a hard allowlist of five files (no directory traversal possible). Peer text reaches the DOM via `textContent` only — never `innerHTML`. |

## Data flows

**Chat:** page → ws bridge → `main.js` (trim, cap at 1000 chars) →
`RoomSession.broadcast` → every peer socket as one ndjson line. Inbound: line
splitter → `parseMessage` (validate + rebuild) → feed → page. Invalid frames are
dropped silently; hostile input must never take the room down.

**Translate / Ask:** page sends `translate` (message id) or `ask` (question) →
`Companion` queue → QVAC completion on-device → answer back over the ws bridge.
The room never sees companion traffic — translation and questions are private to
the seat that asked.

**Presence:** on `peer-join`, a seat greets the newcomer directly (a targeted
`sendTo`, not a broadcast) with a presence envelope (name + 2-letter nation) so
the stand can show who's in without re-announcing to everyone already there.

## Trust boundaries

1. **Peers are hostile.** Everything crossing a Hyperswarm socket is size-capped,
   schema-checked, and rebuilt before use. Transport is Noise-encrypted by
   Hyperswarm itself.
2. **The UI is local.** HTTP + ws bind to 127.0.0.1; the page is plumbing for one
   device, not a service.
3. **The model is local.** Prompts and chat context never leave the machine —
   this is the point: private, offline-capable, quota-free.

## Why these choices

- **Room = hash of a shoutable code.** The invite channel is human speech; the
  DHT does discovery. No signalling server to run or pay for.
- **Load the model once, queue everything.** First load is expensive; on modest
  hardware generation is ~6 tok/s. The bounded queue keeps chat instant and makes
  slowness legible ("busy — try again") instead of silent.
- **ndjson over the raw duplex stream.** Simplest framing that survives partial
  chunks; a versioned envelope leaves room to grow (match events, reactions)
  without breaking old peers.
- **Injectable QVAC client.** 44 tests run without the SDK; `npm run verify:ai`
  proves the real model path.

## Offline / restricted-network story

With `npm run dht` (a local DHT bootstrap on `127.0.0.1:49737`) and
`SWARM_BOOTSTRAP=1`, an entire room runs with **zero internet** — LAN-only
watch parties work, and so do networks that block the public DHT. Fonts are
self-hosted; there are no CDNs and no telemetry.
