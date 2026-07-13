// Verifies the landing flow end-to-end without a browser: fresh instance →
// page gets "lobby" → create → "joined" with a valid room code → chat echo.
// Also asserts every static asset (incl. fonts) serves 200.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3681;

const app = spawn(
  process.execPath,
  [path.join(ROOT, "src", "app", "main.js"), "--port", String(PORT), "--no-ai"],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
);
app.stderr.on("data", (d) => process.stderr.write(`  ${d}`));
process.on("exit", () => app.kill()); // never orphan the app instance on its fixed port

function fail(msg) {
  console.error(`VERIFY-LOBBY FAILED: ${msg}`);
  process.exit(1);
}
setTimeout(() => fail("timed out"), 60_000);
await new Promise((r) => setTimeout(r, 2500));

try {
  for (const asset of ["/", "/app.js", "/styles.css", "/fonts/archivo-var.woff2", "/fonts/martian-mono-var.woff2"]) {
    const res = await fetch(`http://127.0.0.1:${PORT}${asset}`);
    if (!res.ok) fail(`${asset} → ${res.status}`);
  }
} catch (err) {
  fail(`asset fetch: ${err.message}`);
}
console.log("[verify-lobby] all assets serve 200");

const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
ws.on("error", (e) => fail(`ws: ${e.message}`));
const events = [];
ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));
await new Promise((r) => ws.on("open", r));
ws.send(JSON.stringify({ type: "hi" }));

async function waitFor(pred, label) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const hit = events.find(pred);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  fail(`timeout waiting for ${label}`);
}

await waitFor((e) => e.type === "lobby", "lobby event");
console.log("[verify-lobby] fresh instance starts in lobby");

ws.send(JSON.stringify({ type: "create", name: "Nabeel", lang: "English" }));
const joined = await waitFor((e) => e.type === "joined", "joined event");
if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(joined.room)) fail(`bad room code: ${joined.room}`);
console.log(`[verify-lobby] created room ${joined.room} as ${joined.name}`);

ws.send(JSON.stringify({ type: "send", text: "first message" }));
await waitFor((e) => e.type === "chat" && e.text === "first message" && e.self, "chat echo");
console.log("[verify-lobby] chat echoes to the page");

// a second join attempt must not error or re-room
ws.send(JSON.stringify({ type: "join", room: "AAAA-AAAA", name: "X", lang: "English" }));
const again = await waitFor((e, i) => e.type === "joined" && events.indexOf(e) > events.indexOf(joined), "idempotent join");
if (again.room !== joined.room) fail("second join changed the room");
console.log("[verify-lobby] join-after-joined is idempotent");

console.log("VERIFY-LOBBY OK");
app.kill();
process.exit(0);
