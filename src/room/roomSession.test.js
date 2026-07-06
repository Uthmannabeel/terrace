// Integration test for RoomSession over real sockets.
//
// NOTE ON SHAPE: on this dev machine, endpoint protection prevents two
// Hyperswarm instances in ONE process from ever connecting (the same code
// works cross-process). So this test reproduces the proven topology: a DHT
// bootstrap child process + two peer child processes, all on 127.0.0.1.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generateRoomCode } from "./code.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DHT_PORT = 49811; // distinct from the dev bootstrap's 49737

let bootstrapProc;

function run(script, args) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = { stdout: "", stderr: "", child };
  child.stdout.on("data", (d) => (out.stdout += d.toString()));
  child.stderr.on("data", (d) => (out.stderr += d.toString()));
  out.done = new Promise((resolve) => child.on("close", (code) => resolve(code)));
  return out;
}

beforeAll(async () => {
  bootstrapProc = run(path.join(ROOT, "scripts", "dht-bootstrap.js"), [String(DHT_PORT)]);
  // wait until the bootstrap node reports ready
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("bootstrap start timeout")), 15_000);
    const poll = setInterval(() => {
      if (bootstrapProc.stdout.includes("listening")) {
        clearTimeout(t);
        clearInterval(poll);
        resolve();
      }
    }, 100);
  });
});

afterAll(() => {
  bootstrapProc?.child.kill();
});

const PEER = path.join(ROOT, "scripts", "room-peer.js");

describe("RoomSession (cross-process over local DHT)", () => {
  test("two peers in the same room exchange a chat message", { timeout: 60_000 }, async () => {
    const code = generateRoomCode();
    const listener = run(PEER, [code, "Bob", "listen", String(DHT_PORT)]);
    const sender = run(PEER, [code, "Alice", "send", String(DHT_PORT)]);

    const [listenerExit, senderExit] = await Promise.all([listener.done, sender.done]);

    expect(senderExit, sender.stderr).toBe(0);
    expect(listenerExit, listener.stderr).toBe(0);
    expect(listener.stdout).toContain('"kind":"chat"');
    expect(listener.stdout).toContain('"name":"Alice"');
    expect(listener.stdout).toContain("hello from Alice");
  });

  test("malformed peer frames are dropped; valid traffic still flows", { timeout: 60_000 }, async () => {
    const code = generateRoomCode();
    const listener = run(PEER, [code, "Bob", "listen", String(DHT_PORT)]);
    const sender = run(PEER, [code, "Mallory", "hostile", String(DHT_PORT)]);

    const [listenerExit] = await Promise.all([listener.done, sender.done]);

    expect(listenerExit, listener.stderr).toBe(0);
    // the bad-version frame must never surface as a message
    expect(listener.stdout).not.toContain("bad version");
    expect(listener.stdout).toContain("hello from Mallory");
  });
});
