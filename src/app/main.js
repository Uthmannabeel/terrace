// Terrace entry point. One process = one fan's seat.
//   npm start                          → opens the landing page (create/join there)
//   npm start -- --room AB2C-DEF3 ...  → auto-joins (used by scripts and demos)
// Flags: --room --name --lang --nation --port --no-ai
// Env:   SWARM_BOOTSTRAP=1 (+ DHT_PORT) to use the local dev DHT (npm run dht).

import { Companion } from "../companion/companion.js";
import { createQvacClient } from "../companion/qvacClient.js";
import { makeChat, makePresence } from "../protocol/envelope.js";
import { generateRoomCode, normalizeRoomCode } from "../room/code.js";
import { RoomSession } from "../room/roomSession.js";
import { startUiServer } from "../ui/server.js";
import { addEntry, contextLines, createFeed, findEntry } from "./roomFeed.js";

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const port = Number(arg("--port", 3600));
const aiEnabled = !process.argv.includes("--no-ai");
const bootstrap = process.env.SWARM_BOOTSTRAP
  ? [{ host: "127.0.0.1", port: Number(process.env.DHT_PORT ?? 49737) }]
  : undefined;

// Identity defaults — the landing page can override before joining.
let name = arg("--name", "").slice(0, 40);
let lang = arg("--lang", "English");
let nation = arg("--nation", "NG").toUpperCase().slice(0, 2);
// An invalid --nation would make makePresence throw inside the peer-join
// handler and crash the process the moment a peer connects — fall back instead.
if (!/^[A-Z]{2}$/.test(nation)) nation = "NG";

const PRESENCE_DELAY_MS = 300;

let room = null;
let feed = createFeed();
let aiReady = false;

const qvac = aiEnabled ? createQvacClient() : null;
const companion = qvac
  ? new Companion({ runCompletion: qvac.runCompletion, loadClient: qvac.loadClient })
  : null;

const ui = await startUiServer({ port, onClientMessage: handleClient });

function status() {
  ui.send({
    type: "status",
    peers: room ? room.peerCount : 0,
    aiReady,
    aiEnabled,
    inRoom: Boolean(room),
  });
}

function pushChat({ name: from, text, self }) {
  const res = addEntry(feed, { name: from, text, self });
  feed = res.feed;
  ui.send({ type: "chat", ...res.entry });
  return res.entry;
}

async function joinRoom(code) {
  room = new RoomSession({ roomCode: code, bootstrap });
  room.on("message", (message) => {
    if (message.kind === "chat") pushChat({ name: message.name, text: message.text });
    if (message.kind === "presence") ui.send({ type: "presence", ...message });
  });
  room.on("peer-join", (peerId) => {
    console.log(`[terrace] peer joined (${peerId.slice(0, 8)}…)`);
    // Greet only the newcomer, and not on a freshly-opened stream — an
    // immediate write can be dropped before the stream is fully up.
    const session = room;
    setTimeout(() => {
      try {
        if (session === room) {
          session.sendTo(peerId, makePresence({ name: name || "Fan", nation, isJoining: true }));
        }
      } catch {
        // peer already gone — a lost hello is fine
      }
    }, PRESENCE_DELAY_MS);
    status();
  });
  room.on("peer-leave", (peerId) => {
    console.log(`[terrace] peer left (${peerId.slice(0, 8)}…)`);
    status();
  });
  await room.join();
  console.log(`[terrace] joined room ${room.roomCode} as ${name || "Fan"}`);
}

function sendJoined(send) {
  send({ type: "joined", room: room.roomCode, name, lang, aiEnabled });
  status();
  for (const entry of feed.entries) send({ type: "chat", ...entry });
}

function applyIdentity(data) {
  if (typeof data.name === "string" && data.name.trim()) name = data.name.trim().slice(0, 40);
  if (typeof data.lang === "string" && data.lang.trim()) lang = data.lang.trim().slice(0, 30);
}

async function handleCreateOrJoin(data, send) {
  if (room) {
    sendJoined(send);
    return;
  }
  applyIdentity(data);
  try {
    const code = data.type === "create" ? generateRoomCode() : normalizeRoomCode(String(data.room ?? ""));
    await joinRoom(code);
    sendJoined(send);
  } catch (err) {
    // Tear down the half-started session or each lobby retry leaks a swarm.
    const failed = room;
    room = null;
    if (failed) failed.leave().catch(() => {});
    send({ type: "join-error", message: err.message });
  }
}

function handleClient(data, send) {
  try {
    if (data.type === "hi") {
      if (room) sendJoined(send);
      else send({ type: "lobby", name, lang, aiEnabled });
      status();
    } else if (data.type === "create" || data.type === "join") {
      void handleCreateOrJoin(data, send);
    } else if (data.type === "send" && room && typeof data.text === "string" && data.text.trim()) {
      const text = data.text.trim().slice(0, 1000);
      room.broadcast(makeChat({ name: name || "Fan", text }));
      pushChat({ name: name || "Fan", text, self: true });
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
        .catch((err) => send({ type: "companion-error", forId: entry.id, message: err.message }));
    }
  } catch (err) {
    send({ type: "companion-error", message: err.message });
  }
}

console.log(`[terrace] UI on http://127.0.0.1:${ui.port}`);

// --room flag = script/demo mode: join immediately, page skips the landing.
const roomFlag = arg("--room", null);
if (roomFlag) {
  if (!name) name = "Fan";
  await joinRoom(roomFlag);
  status();
}

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

// Late-joining browser tabs get a fresh picture periodically.
setInterval(status, 5000);

process.on("SIGINT", async () => {
  if (room) await room.leave();
  process.exit(0);
});
