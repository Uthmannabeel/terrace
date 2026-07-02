# Terrace — implementation plan

Knockout-round-aligned plan for the Tether Developers Cup. One project, improved
every round; judges read the commit history between rounds.

## Product

**Terrace** — the stand where fans gather. P2P watch-party rooms for live matches:

- **Rooms without servers.** A room is a Hyperswarm topic derived from a human
  room code (`terrace open <match>` → code like `FRA-ARG-9F3K`). Fans join
  peer-to-peer; no accounts, no backend, nothing to shut down after the final.
- **Fan chat.** Live messages between all peers in the room.
- **The Companion.** An on-device QVAC model in every client:
  - **Translate:** incoming messages in another language get a local translation
    inline — a Brazilian and a Japanese fan banter without either's messages
    leaving their machines.
  - **Explain:** "what just happened?" — offside, VAR, why the goal was ruled out;
    answered locally, even with zero connectivity beyond the room.
- Signature design element: the **match clock ribbon** — room time, score, and
  events pinned as a single strip; the room's shared heartbeat.

Why it wins on the judging axes: technical ambition (two stacks composed, not
decorated), real use of the platform (Hyperswarm topics/connections + QVAC
inference are the app), utility (watch parties are how football is actually
consumed; translation is a real barrier), creativity (privacy-preserving fan
translation is novel), UX (design bar: real-product quality, no template UI).

## Round milestones

### Round of 16 — prototype + demo by **July 8**
- `src/room/` — room codes, topic derivation, Hyperswarm join/leave, peer set.
- `src/protocol/` — versioned JSON message envelope (chat, presence, event),
  length caps, defensive parse (never trust peer input — ECC security rule).
- `src/companion/` — QVAC wrapper: load-once model residency, translate(msg, lang),
  explain(question, roomContext); bounded queue so 6 tok/s never blocks chat.
- UI — single window (Electron or Pear-Electron), two-instance demo on one laptop
  against the local DHT bootstrap. Room, chat, companion panel, clock ribbon.
- Tests: protocol + room-code pure logic; two-peer integration over local
  bootstrap; companion mocked. `npm run verify:ai` = live model check.
- Demo video v1 (≤3 min, unlisted YouTube).

### Quarter-final — refined build by **July 10**
- Autobase ordered shared log (multi-writer chat with consistent ordering) —
  deepens the Pears usage beyond raw sockets.
- Presence + nation flags (register-your-nation theme tie-in), joins/leaves.
- Match events: any peer can log a goal/card; events pin to the clock ribbon.
- UI polish pass against the design standards; demo video v2.

### Semi-final — **July 12–13**
- Pitch materials: architecture diagram, README landing page, LIMITATIONS.md
  (honest scope — same credibility play as prior entries).
- Stretch: local speech — QVAC speech model for spoken "explain" (if the SDK's
  speech support proves out on Windows; otherwise cut without regret).

### Final lock — **July 14 23:59 UTC+1**; live pitch July 15
- Freeze, tag release, final demo video, pitch script for the user.

## Architecture guardrails (ECC)

- Many small files; pure logic separated from IO so it's testable without peers
  or models. TDD: protocol and room logic get tests FIRST.
- Peer input is hostile input: schema-validate every message, cap lengths,
  escape everything rendered.
- No cloud calls anywhere in the AI path (track disqualifier) — CI greps for
  fetch/https in `src/companion/` as a tripwire.
- Model stays resident; companion work is queued, chat never waits on the LLM.

## Known environment facts (proven in spike, 2026-07-02)

- QVAC on this machine: 739MB model, 130s first load, ~6.3 tok/s.
- Corporate network blocks the public DHT → local bootstrap for dev
  (`npm run dht`), phone hotspot for cross-network demos.
- `overrides.bare-zlib="1.3.1"` required (firewall hash-blocks 1.4.0).
