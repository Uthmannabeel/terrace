// Headless end-to-end smoke: local DHT + two full app instances (AI off) +
// two WebSocket "browsers". Proves page → app → P2P → app → page without
// opening a real browser. Run: npm run smoke
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DHT_PORT = 49821;
const ROOM = "SMKE-TEST";
const children = [];

function start(script, args, env = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.stderr.on("data", (d) => process.stderr.write(d));
  return child;
}

function waitForLine(child, needle, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${needle}"`)), timeoutMs);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      if (buf.includes(needle)) {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

// Backstop: whatever path we exit by (throw, error event, success), never leave
// child app/DHT processes holding their fixed ports and breaking the next run.
process.on("exit", () => {
  for (const c of children) c.kill();
});

function fail(err) {
  console.error(`SMOKE FAILED: ${err.message}`);
  process.exit(1);
}

try {
  const dht = start(path.join(ROOT, "scripts", "dht-bootstrap.js"), [String(DHT_PORT)]);
  await waitForLine(dht, "listening");

  const env = { SWARM_BOOTSTRAP: "1", DHT_PORT: String(DHT_PORT) };
  const a = start(path.join(ROOT, "src", "app", "main.js"),
    ["--room", ROOM, "--name", "Alice", "--port", "3651", "--no-ai"], env);
  const b = start(path.join(ROOT, "src", "app", "main.js"),
    ["--room", ROOM, "--name", "Bob", "--port", "3652", "--no-ai"], env);
  await Promise.all([waitForLine(a, "joined room"), waitForLine(b, "joined room")]);
  console.log("[smoke] both instances up");

  // static page serves
  const page = await fetch("http://127.0.0.1:3651/");
  if (!page.ok || !(await page.text()).includes("TERRACE")) {
    throw new Error("page did not serve");
  }
  console.log("[smoke] page serves");

  // two "browsers"
  const wsA = new WebSocket("ws://127.0.0.1:3651/ws");
  const wsB = new WebSocket("ws://127.0.0.1:3652/ws");
  wsA.on("error", (e) => fail(new Error(`wsA: ${e.message}`)));
  wsB.on("error", (e) => fail(new Error(`wsB: ${e.message}`)));
  const received = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Bob never saw Alice's chat")), 30_000);
    wsB.on("message", (raw) => {
      const ev = JSON.parse(raw.toString());
      if (ev.type === "chat" && ev.name === "Alice" && ev.text === "GOAL for the smoke test") {
        clearTimeout(t);
        resolve();
      }
    });
  });

  await new Promise((r) => wsA.on("open", r));
  await new Promise((r) => wsB.on("open", r));
  wsB.send(JSON.stringify({ type: "hi" }));

  // wait until Alice's instance reports a peer before sending
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("peers never connected")), 30_000);
    wsA.send(JSON.stringify({ type: "hi" }));
    wsA.on("message", (raw) => {
      const ev = JSON.parse(raw.toString());
      if (ev.type === "status" && ev.peers >= 1) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  console.log("[smoke] peers connected");

  wsA.send(JSON.stringify({ type: "send", text: "GOAL for the smoke test" }));
  await received;
  console.log("[smoke] chat flowed page→P2P→page");

  console.log("SMOKE OK");
  for (const c of children) c.kill();
  process.exit(0);
} catch (err) {
  fail(err);
}
