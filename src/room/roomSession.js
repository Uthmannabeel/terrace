// A live connection to one watch-party room. Wraps Hyperswarm: peers who join
// the same room code find each other and exchange protocol messages. Emits:
//   "message"    (validated envelope, from a peer)
//   "peer-join"  (peerId)
//   "peer-leave" (peerId)
// Invalid or oversized peer input is dropped silently — hostile input must
// never take the room down.

import { EventEmitter } from "node:events";
import Hyperswarm from "hyperswarm";
import { roomCodeToTopic, normalizeRoomCode } from "./code.js";
import { encodeMessage, parseMessage } from "../protocol/envelope.js";
import { createLineSplitter } from "./frame.js";

// Per-peer token bucket: generous for a human typing, but caps a hostile peer
// that streams valid frames at line rate from saturating the event loop or
// scrolling the whole stand out of view. Refills RATE_PER_SEC/sec up to RATE_BURST.
const RATE_PER_SEC = 20;
const RATE_BURST = 40;

export class RoomSession extends EventEmitter {
  #swarm;
  #peers = new Map(); // peerId -> socket

  constructor({ roomCode, bootstrap }) {
    super();
    this.roomCode = normalizeRoomCode(roomCode);
    this.#swarm = new Hyperswarm(bootstrap ? { bootstrap } : {});
    this.#swarm.on("connection", (socket, info) => this.#onConnection(socket, info));
  }

  async join() {
    const discovery = this.#swarm.join(roomCodeToTopic(this.roomCode), {
      server: true,
      client: true,
    });
    await discovery.flushed();
  }

  get peerCount() {
    return this.#peers.size;
  }

  broadcast(message) {
    const raw = encodeMessage(message);
    for (const socket of this.#peers.values()) {
      socket.write(raw);
    }
  }

  // Send to one peer only (e.g. greeting a newcomer without re-announcing
  // to the whole stand). No-op if the peer already left.
  sendTo(peerId, message) {
    const socket = this.#peers.get(peerId);
    if (socket) socket.write(encodeMessage(message));
  }

  async leave() {
    for (const socket of this.#peers.values()) socket.destroy();
    this.#peers.clear();
    await this.#swarm.destroy();
  }

  #onConnection(socket, info) {
    const peerId = info.publicKey.toString("hex");
    this.#peers.set(peerId, socket);
    this.emit("peer-join", peerId);

    let tokens = RATE_BURST;
    let lastRefill = Date.now();
    const push = createLineSplitter(
      (line) => {
        const now = Date.now();
        tokens = Math.min(RATE_BURST, tokens + ((now - lastRefill) / 1000) * RATE_PER_SEC);
        lastRefill = now;
        if (tokens < 1) return; // over budget — drop this frame silently
        tokens -= 1;
        const parsed = parseMessage(line);
        if (parsed.ok) this.emit("message", parsed.message, peerId);
      },
      () => socket.destroy(new Error("peer exceeded frame buffer")),
    );

    socket.on("data", push);
    socket.on("error", () => {
      /* dropped below via close */
    });
    socket.on("close", () => {
      if (this.#peers.get(peerId) === socket) {
        this.#peers.delete(peerId);
        this.emit("peer-leave", peerId);
      }
    });
  }
}
