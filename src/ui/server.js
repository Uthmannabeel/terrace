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

  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Set();

  wss.on("connection", (socket) => {
    clients.add(socket);
    socket.on("close", () => clients.delete(socket));
    socket.on("message", (raw) => {
      let data;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return; // ignore malformed frames from the page
      }
      if (data && typeof data === "object") onClientMessage(data, send);
    });
  });

  function send(event) {
    const raw = JSON.stringify(event);
    for (const socket of clients) {
      if (socket.readyState === socket.OPEN) socket.send(raw);
    }
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return { send, port: server.address().port, close: () => server.close() };
}
