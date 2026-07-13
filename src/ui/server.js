// Local UI host: serves the static page and bridges it to the app over a
// WebSocket. This is per-device plumbing on 127.0.0.1 — the room itself has
// no server; peers talk directly over Hyperswarm.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const FILES = new Set([
  "/index.html",
  "/app.js",
  "/styles.css",
  "/fonts/archivo-var.woff2",
  "/fonts/martian-mono-var.woff2",
]);

export async function startUiServer({ port, onClientMessage }) {
  const server = http.createServer(async (req, res) => {
    const url = req.url === "/" ? "/index.html" : (req.url ?? "");
    if (!FILES.has(url)) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    try {
      const body = await readFile(path.join(PUBLIC_DIR, url));
      res
        .writeHead(200, {
          "content-type": CONTENT_TYPES[path.extname(url)] ?? "application/octet-stream",
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        })
        .end(body);
    } catch {
      res.writeHead(500, { "content-type": "text/plain" }).end("read error");
    }
  });

  // WebSockets skip the same-origin policy: without this check any web page
  // open in the user's browser could drive the app via ws://127.0.0.1.
  // The Host header is checked against a fixed loopback allowlist (not trusted
  // as-is) so a DNS-rebinding page pointing its own domain at 127.0.0.1 can't
  // satisfy the origin match. Non-browser clients send no Origin and are allowed.
  const allowedHosts = new Set(); // filled once the real port is known, below
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    verifyClient: ({ origin, req }) => {
      const host = req.headers.host;
      if (!allowedHosts.has(host)) return false;
      return origin === undefined || origin === `http://${host}`;
    },
  });
  const clients = new Set();

  wss.on("connection", (socket) => {
    clients.add(socket);
    // reply() answers just the requesting tab; broadcast() reaches every tab on
    // this device. Handlers pick per event — a join-error belongs to one tab, a
    // new chat to all of them.
    const reply = (event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    };
    socket.on("close", () => clients.delete(socket));
    socket.on("message", (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return; // ignore malformed frames from the page
      }
      if (data && typeof data === "object") onClientMessage(data, reply);
    });
  });

  function broadcast(event) {
    const raw = JSON.stringify(event);
    for (const socket of clients) {
      if (socket.readyState === socket.OPEN) socket.send(raw);
    }
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const boundPort = server.address().port;
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) allowedHosts.add(`${host}:${boundPort}`);

  return {
    broadcast,
    port: boundPort,
    close: () => {
      for (const socket of clients) socket.terminate();
      wss.close();
      server.close();
    },
  };
}
