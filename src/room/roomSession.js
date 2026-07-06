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

  async leave() {
    for (const socket of this.#peers.values()) socket.destroy();
    this.#peers.clear();
    await this.#swarm.destroy();
  }

  #onConnection(socket, info) {
    const peerId = info.publicKey.toString("hex");
    this.#peers.set(peerId, socket);
    this.emit("peer-join", peerId);

    const push = createLineSplitter(
      (line) => {
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
