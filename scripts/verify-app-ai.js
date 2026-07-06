// Live check of the companion THROUGH the app: starts one instance (AI on),
// waits for the model to warm, then asks a question and requests a
// translation over the same WebSocket the page uses. Slow on first run.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3671;

const app = spawn(
  process.execPath,
  [path.join(ROOT, "src", "app", "main.js"), "--room", "AIVF-TEST", "--name", "Vera", "--lang", "English", "--port", String(PORT)],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
);
app.stdout.on("data", (d) => process.stdout.write(`  ${d}`));
app.stderr.on("data", (d) => process.stderr.write(`  ${d}`));

function fail(msg) {
  console.error(`VERIFY FAILED: ${msg}`);
  app.kill();
  process.exit(1);
}

setTimeout(() => fail("timed out"), 8 * 60_000);

// wait for the UI server, then connect like the page does
await new Promise((r) => setTimeout(r, 2500));
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
await new Promise((r, j) => {
  ws.on("open", r);
  ws.on("error", () => j(fail("could not reach app UI socket")));
});
ws.send(JSON.stringify({ type: "hi" }));

const events = [];
ws.on("message", (raw) => events.push(JSON.parse(raw.toString())));

async function waitFor(pred, label, ms = 7 * 60_000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const hit = events.find(pred);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`timeout waiting for ${label}`);
}

console.log("[verify] waiting for companion warmup (first run downloads the model)...");
await waitFor((e) => e.type === "status" && e.aiReady, "aiReady");
console.log("[verify] companion ready — asking a question");

ws.send(JSON.stringify({ type: "ask", text: "In one sentence, what is a penalty shootout?" }));
const answer = await waitFor((e) => e.type === "companion" && e.kind === "answer", "answer");
console.log(`[verify] ANSWER: ${answer.text}`);

// seed a chat entry by sending one, then translate it via its feed id (1)
ws.send(JSON.stringify({ type: "send", text: "¡Vamos! Ese portero es un muro." }));
await waitFor((e) => e.type === "chat", "chat echo");
ws.send(JSON.stringify({ type: "translate", id: 1 }));
const translation = await waitFor(
  (e) => e.type === "companion" && e.kind === "translation",
  "translation",
);
console.log(`[verify] TRANSLATION: ${translation.text}`);

console.log("VERIFY APP-AI OK");
app.kill();
process.exit(0);
