// Terrace entry point. One process = one fan's seat.
//   npm start                          → opens the landing page (create/join there)
//   npm start -- --room AB2C-DEF3 ...  → auto-joins (used by scripts and demos)
// Flags: --room --name --lang --nation --port --no-ai
// Env:   SWARM_BOOTSTRAP=1 (+ DHT_PORT) to use the local dev DHT (npm run dht).

import { Companion } from "../companion/companion.js";
import { createQvacClient } from "../companion/qvacClient.js";
import { makeChat, makePresence, MAX_NAME_LENGTH, MAX_TEXT_LENGTH } from "../protocol/envelope.js";
import { generateRoomCode, normalizeRoomCode } from "../room/code.js";
import { RoomSession } from "../room/roomSession.js";
import { startUiServer } from "../ui/server.js";
import { addEntry, contextLines, createFeed, findEntry } from "./roomFeed.js";

const PRESENCE_DELAY_MS = 300; // let a freshly-opened stream settle before greeting
const STATUS_INTERVAL_MS = 5000; // refresh late-joining tabs' picture
const MAX_LANG_LENGTH = 30;
const SHUTDOWN_GRACE_MS = 2000;

// short fingerprint of a peer's public key — binds a display name to a real
// identity so one peer can't impersonate another fan's name undetectably
const peerTag = (peerId) => (typeof peerId === "string" ? peerId.slice(0, 4) : null);

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
let name = arg("--name", "").slice(0, MAX_NAME_LENGTH);
let lang = arg("--lang", "English");
let nation = arg("--nation", "NG").toUpperCase().slice(0, 2);
// An invalid --nation would make makePresence throw inside the peer-join
// handler and crash the process the moment a peer connects — fall back instead.
if (!/^[A-Z]{2}$/.test(nation)) nation = "NG";

let room = null;
let joining = null; // in-flight join promise; guards against concurrent create/join
let feed = createFeed(Date.now()); // epoch seed: ids survive restarts (see roomFeed.js)
let aiReady = false;

const qvac = aiEnabled ? createQvacClient() : null;
const companion = qvac
  ? new Companion({ runCompletion: qvac.runCompletion, loadClient: qvac.loadClient })
  : null;

const ui = await startUiServer({ port, onClientMessage: handleClient });

function status() {
  ui.broadcast({
    type: "status",
    peers: room ? room.peerCount : 0,
    aiReady,
    aiEnabled,
    inRoom: Boolean(room),
  });
}

function pushChat({ name: from, text, self, tag = null }) {
  const res = addEntry(feed, { name: from, text, self, tag });
  feed = res.feed;
  ui.broadcast({ type: "chat", ...res.entry });
  return res.entry;
}

// Builds the session and only publishes it to `room` once join() succeeds — so a
// second create/join arriving mid-join can't observe a half-open room, and a
// failed join leaves `room` null with the swarm already torn down.
async function joinRoom(code) {
  const session = new RoomSession({ roomCode: code, bootstrap });
  session.on("message", (message, peerId) => {
    if (message.kind === "chat") {
      pushChat({ name: message.name, text: message.text, tag: peerTag(peerId) });
    }
    if (message.kind === "presence") ui.broadcast({ type: "presence", ...message });
  });
  session.on("peer-join", (peerId) => {
    console.log(`[terrace] peer joined (${peerId.slice(0, 8)}…)`);
    // Greet only the newcomer, and not on a freshly-opened stream — an
    // immediate write can be dropped before the stream is fully up.
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
  session.on("peer-leave", (peerId) => {
    console.log(`[terrace] peer left (${peerId.slice(0, 8)}…)`);
    status();
  });
  try {
    await session.join();
  } catch (err) {
    await session.leave().catch(() => {}); // don't leak the swarm on a failed join
    throw err;
  }
  room = session;
  console.log(`[terrace] joined room ${session.roomCode} as ${name || "Fan"}`);
}

function sendJoined(target) {
  target({ type: "joined", room: room.roomCode, name, lang, aiEnabled });
  status();
  for (const entry of feed.entries) target({ type: "chat", ...entry });
}

function applyIdentity(data) {
  if (typeof data.name === "string" && data.name.trim()) {
    name = data.name.trim().slice(0, MAX_NAME_LENGTH);
  }
  if (typeof data.lang === "string" && data.lang.trim()) {
    lang = data.lang.trim().slice(0, MAX_LANG_LENGTH);
  }
}

async function handleCreateOrJoin(data, reply) {
  if (room) {
    sendJoined(reply);
    return;
  }
  if (joining) {
    // a create/join is already in flight — wait it out, then reflect the result
    // to this tab instead of kicking off a second, racing join
    await joining.catch(() => {});
    if (room) sendJoined(reply);
    else reply({ type: "join-error", message: "could not join — try again" });
    return;
  }
  applyIdentity(data);
  let code;
  try {
    code = data.type === "create" ? generateRoomCode() : normalizeRoomCode(String(data.room ?? ""));
  } catch (err) {
    reply({ type: "join-error", message: err.message });
    return;
  }
  joining = joinRoom(code);
  try {
    await joining;
    sendJoined(ui.broadcast); // every tab on this device transitions into the room
  } catch (err) {
    reply({ type: "join-error", message: err.message });
  } finally {
    joining = null;
  }
}

function handleClient(data, reply) {
  try {
    if (data.type === "hi") {
      if (room) sendJoined(reply);
      else reply({ type: "lobby", name, lang, aiEnabled });
      status();
    } else if (data.type === "create" || data.type === "join") {
      void handleCreateOrJoin(data, reply);
    } else if (data.type === "send" && room && typeof data.text === "string" && data.text.trim()) {
      const text = data.text.trim().slice(0, MAX_TEXT_LENGTH);
      room.broadcast(makeChat({ name: name || "Fan", text }));
      pushChat({ name: name || "Fan", text, self: true });
    } else if (data.type === "ask" && companion) {
      const question = String(data.text ?? "").trim();
      if (!question) return;
      companion
        .explain(question, contextLines(feed))
        .then((text) => reply({ type: "companion", kind: "answer", question, text }))
        .catch((err) => reply({ type: "companion-error", message: err.message }));
    } else if (data.type === "translate" && companion) {
      const id = Number(data.id);
      const entry = findEntry(feed, id);
      if (!entry) {
        // message aged out of the feed (>200 ago) but its button still exists
        // in the longer-lived DOM — release it instead of leaving it stuck on "…"
        reply({ type: "companion-error", forId: id, message: "that message is no longer available" });
        return;
      }
      companion
        .translate(entry.text, lang)
        .then((text) => reply({ type: "companion", kind: "translation", forId: entry.id, text }))
        .catch((err) => reply({ type: "companion-error", forId: entry.id, message: err.message }));
    }
  } catch (err) {
    reply({ type: "companion-error", message: err.message });
  }
}

console.log(`[terrace] UI on http://127.0.0.1:${ui.port}`);

// --room flag = script/demo mode: join immediately, page skips the landing.
const roomFlag = arg("--room", null);
if (roomFlag) {
  if (!name) name = "Fan";
  try {
    await joinRoom(roomFlag);
    status();
  } catch (err) {
    console.error(`[terrace] could not join ${roomFlag}: ${err.message}`);
    process.exit(1);
  }
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
setInterval(status, STATUS_INTERVAL_MS);

let shuttingDown = false;
process.on("SIGINT", () => {
  if (shuttingDown) process.exit(0); // second Ctrl+C forces the issue
  shuttingDown = true;
  const left = room ? room.leave().catch(() => {}) : Promise.resolve();
  const deadline = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS));
  Promise.race([left, deadline]).finally(() => process.exit(0));
});
