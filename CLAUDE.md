# Terrace — project instructions

This project uses the **ECC (Everything Claude Code)** agent harness. Follow the
agent instructions and rules in:

- `.claude/AGENTS.md` — agent orchestration, principles, workflow
- `.claude/rules/ecc/common/` — language-agnostic standards (coding-style, testing, security, git)
- `.claude/rules/ecc/web/` — TypeScript/web specifics

## What this is

**Terrace** — peer-to-peer watch parties for football, with an on-device AI match
companion. Entry for the **Tether Developers Cup** (DoraHacks), dual track:
**Pears (P2P)** + **QVAC (Local AI)**. Fans join a match room peer-to-peer (no
server, no accounts), chat live, and a local AI translates fan messages and
answers "what just happened?" — private, offline-capable, no API keys.

## Stack

- JavaScript (ESM, Node ≥ 22.17 — QVAC requirement).
- `hyperswarm` — room discovery + peer connections (topic = hash of room code).
- `@qvac/sdk` — on-device LLM (Llama 3.2 1B Q4, `~/.qvac`, load once and keep resident).
- `hyperdht` — local DHT bootstrap for offline dev/tests (`npm run dht`).
- `vitest` — tests. Pure logic tested directly; P2P integration-tested against the
  local bootstrap; QVAC mocked in tests, verified live via `npm run verify:ai`.

## Hackathon constraints (do not violate)

- All AI must run on-device through the QVAC SDK — **no cloud AI APIs** (track rule).
- Public repo, MIT license, judge-runnable setup instructions.
- Keep committing through the knockout rounds — judges read commit history as progress.
- Theme: football / the global tournament moment.

## Environment notes (this corporate Windows machine)

- npm/npx need `$env:NODE_OPTIONS="--use-system-ca"` (corporate TLS interception).
- The firewall hash-blocks `bare-zlib@1.4.0` — kept at `overrides.bare-zlib="1.3.1"`
  in package.json. Do not remove the override.
- Public Hyperswarm DHT (UDP) is blocked on the corporate network — run
  `npm run dht` (local bootstrap on 127.0.0.1:49737) and set `SWARM_BOOTSTRAP=1`
  for local two-peer dev/demo. Cross-network demos need a phone hotspot.
- PowerShell 5.1: use `[IO.File]::ReadAllText/WriteAllText` for UTF-8 file surgery.
