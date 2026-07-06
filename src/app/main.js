// Terrace entry point. One process = one fan's seat in the stand:
//   node src/app/main.js --room AB2C-DEF3 --name Marta --lang English
// Flags: --room (omit to open a new room) --name --lang --port --no-ai
// Env:   SWARM_BOOTSTRAP=1 to use the local dev DHT (npm run dht).

import { Companion } from "../companion/companion.js";
import { createQvacClient } from "../companion/qvacClient.js";
import { makeChat, makePresence } from "../protocol/envelope.js";
import { generateRoomCode } from "../room/code.js";
import { RoomSession } from "../room/roomSession.js";
import { startUiServer } from "../ui/server.js";
import { addEntry, contextLines, createFeed, findEntry } from "./roomFeed.js";

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const roomCode = arg("--room", generateRoomCode());
const name = arg("--name", "Fan").slice(0, 40);
const lang = arg("--lang", "English");
const port = Number(arg("--port", 3600));
const nation = arg("--nation", "NG").toUpperCase().slice(0, 2);
const aiEnabled = !process.argv.includes("--no-ai");
const bootstrap = process.env.SWARM_BOOTSTRAP
  ? [{ host: "127.0.0.1", port: Number(process.env.DHT_PORT ?? 49737) }]
  : undefined;

let feed = createFeed();
let aiReady = false;

const room = new RoomSession({ roomCode, bootstrap });
const qvac = aiEnabled ? createQvacClient() : null;
const companion = qvac
  ? new Companion({ runCompletion: qvac.runCompletion, loadClient: qvac.loadClient })
  : null;

const ui = await startUiServer({ port, onClientMessage: handleClient });

function status() {
  ui.send({ type: "status", peers: room.peerCount, aiReady, aiEnabled });
}

function pushChat({ name: from, text, self }) {
  const res = addEntry(feed, { name: from, text, self });
  feed = res.feed;
  ui.send({ type: "chat", ...res.entry });
  return res.entry;
}

room.on("message", (message) => {
  if (message.kind === "chat") pushChat({ name: message.name, text: message.text });
  if (message.kind === "presence") ui.send({ type: "presence", ...message });
});
room.on("peer-join", (peerId) => {
  console.log(`[terrace] peer joined (${peerId.slice(0, 8)}…)`);
  room.broadcast(makePresence({ name, nation, isJoining: true }));
  status();
});
room.on("peer-leave", (peerId) => {
  console.log(`[terrace] peer left (${peerId.slice(0, 8)}…)`);
  status();
});

function handleClient(data, send) {
  try {
    if (data.type === "hi") {
      // page (re)connected: give it identity + current picture + history
      send({ type: "hello", room: roomCode, name, lang, aiEnabled });
      status();
      for (const entry of feed.entries) send({ type: "chat", ...entry });
    } else if (data.type === "send" && typeof data.text === "string" && data.text.trim()) {
      const text = data.text.trim().slice(0, 1000);
      room.broadcast(makeChat({ name, text }));
      pushChat({ name, text, self: true });
    } else if (data.type === "ask" && companion) {
      const question = String(data.text ?? "").trim();
      if (!question) return;
      companion
        .explain(question, contextLines(feed))
        .then((text) => send({ type: "companion", kind: "answer", question, text }))
        .catch((err) => send({ type: "companion-error", message: err.message }));
    } else if (data.type === "translate" && companion) {
      const entry = findEntry(feed, Number(data.id));
      if (!entry) return;
      companion
        .translate(entry.text, lang)
        .then((text) => send({ type: "companion", kind: "translation", forId: entry.id, text }))
        .catch((err) => send({ type: "companion-error", message: err.message }));
    }
  } catch (err) {
    send({ type: "companion-error", message: err.message });
  }
}

// Boot sequence: page is served immediately; the room joins next (chat works
// as soon as a peer appears); the model warms up last, in the background.
console.log(`[terrace] room ${roomCode} — UI on http://127.0.0.1:${ui.port}`);

await room.join();
console.log(`[terrace] joined the swarm as ${name}`);
status();

if (companion) {
  companion
    .warmup()
    .then(() => {
      aiReady = true;
      console.log("[terrace] companion ready");
      status();
    })
    .catch((err) => {
      console.error(`[terrace] companion unavailable: ${err.message}`);
      status();
    });
}

// Late-joining browser tabs need the current picture again.
setInterval(status, 5000);

process.on("SIGINT", async () => {
  await room.leave();
  process.exit(0);
});
