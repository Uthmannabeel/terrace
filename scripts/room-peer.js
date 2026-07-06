// Minimal room peer used by the integration test (and handy for manual demos).
// Usage: node scripts/room-peer.js <roomCode> <name> <mode> [bootstrapPort]
//   mode "listen"  — join, print every received chat as RECEIVED:<json>, exit on first
//   mode "send"    — join, wait for a peer, broadcast one chat, exit
//   mode "hostile" — like send, but first writes a bad-version frame (must be dropped)
import { RoomSession } from "../src/room/roomSession.js";
import { makeChat } from "../src/protocol/envelope.js";

const [, , roomCode, name, mode, portArg] = process.argv;
const port = Number(portArg ?? 49811);
const bootstrap = [{ host: "127.0.0.1", port }];

const session = new RoomSession({ roomCode, bootstrap });
const bail = setTimeout(() => {
  console.error(`[${name}] timeout`);
  process.exit(1);
}, 45_000);

session.on("message", (message) => {
  console.log(`RECEIVED:${JSON.stringify(message)}`);
  if (mode === "listen") {
    clearTimeout(bail);
    session.leave().then(() => process.exit(0));
  }
});

session.on("peer-join", async () => {
  if (mode === "listen") return;
  // tiny delay so the freshly-opened stream is fully up before we write
  await new Promise((r) => setTimeout(r, 300));
  if (mode === "hostile") {
    session.broadcast({ v: 999, kind: "chat", name: "x", text: "bad version" });
  }
  session.broadcast(makeChat({ name, text: `hello from ${name}` }));
  setTimeout(() => {
    clearTimeout(bail);
    session.leave().then(() => process.exit(0));
  }, 4000);
});

await session.join();
console.log(`JOINED:${name}`);
