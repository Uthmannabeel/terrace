// Debug: two raw Hyperswarm instances + hyperdht testnet in one process.
import createTestnet from "hyperdht/testnet.js";
import Hyperswarm from "hyperswarm";
import crypto from "node:crypto";

const log = (who, msg) => console.log(`[${Date.now() % 100000}] [${who}] ${msg}`);

const testnet = await createTestnet(3);
log("net", `bootstrap: ${JSON.stringify(testnet.bootstrap)}`);

const topic = crypto.createHash("sha256").update("debug-topic").digest();

const a = new Hyperswarm({ bootstrap: testnet.bootstrap });
const b = new Hyperswarm({ bootstrap: testnet.bootstrap });

a.on("connection", (s) => {
  log("a", "CONNECTION");
  s.write("hello from a\n");
  s.on("data", (d) => log("a", `data: ${d.toString().trim()}`));
  s.on("error", (e) => log("a", `socket err: ${e.message}`));
});
b.on("connection", (s) => {
  log("b", "CONNECTION");
  s.write("hello from b\n");
  s.on("data", (d) => log("b", `data: ${d.toString().trim()}`));
  s.on("error", (e) => log("b", `socket err: ${e.message}`));
});

const da = a.join(topic, { server: true, client: true });
const db = b.join(topic, { server: true, client: true });
log("a", "joined, flushing discovery...");
await da.flushed();
log("a", "discovery flushed");
await db.flushed();
log("b", "discovery flushed");

await a.flush();
log("a", "swarm flushed");
await b.flush();
log("b", "swarm flushed");

setTimeout(async () => {
  log("net", `a peers=${a.connections.size} b peers=${b.connections.size}`);
  await a.destroy();
  await b.destroy();
  await testnet.destroy();
  process.exit(0);
}, 8000);
