// Terrace page logic. Everything renders through textContent — peer text is
// hostile input and must never become markup.

const $ = (id) => document.getElementById(id);
const feedEl = $("feed");
const emptyEl = $("empty");
const input = $("input");

let mode = "chat";
let aiReady = false;
let joinedAt = Date.now();

// ── clock ribbon ──────────────────────────────────────────────
setInterval(() => {
  const secs = Math.floor((Date.now() - joinedAt) / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  $("clock").textContent = `${mm}:${ss}`;
}, 1000);

$("room-code").addEventListener("click", () => {
  navigator.clipboard?.writeText($("room-code").textContent).then(() => {
    notice("room code copied");
  });
});

// ── websocket to the local app process ───────────────────────
let ws;
function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "hi" })));
  ws.addEventListener("message", (e) => {
    let ev;
    try {
      ev = JSON.parse(e.data);
    } catch {
      return;
    }
    handle(ev);
  });
  ws.addEventListener("close", () => setTimeout(connect, 1500));
}
connect();

const seenChatIds = new Set();

function handle(ev) {
  if (ev.type === "hello") {
    $("room-code").textContent = ev.room;
    document.title = `Terrace — ${ev.room}`;
    if (!ev.aiEnabled) $("companion-lamp").textContent = "COMPANION OFF";
  } else if (ev.type === "status") {
    $("stand").textContent = `IN THE STAND: ${ev.peers + 1}`;
    $("live-dot").classList.toggle("on", ev.peers > 0);
    aiReady = Boolean(ev.aiReady);
    const lamp = $("companion-lamp");
    if (ev.aiEnabled) lamp.dataset.state = aiReady ? "ready" : "warming";
    document.querySelectorAll(".translate-btn").forEach((b) => (b.disabled = !aiReady));
  } else if (ev.type === "chat") {
    if (seenChatIds.has(ev.id)) return;
    seenChatIds.add(ev.id);
    renderChat(ev);
  } else if (ev.type === "presence" && ev.isJoining) {
    notice(`${ev.name} (${ev.nation}) is in the stand`);
  } else if (ev.type === "companion") {
    ev.kind === "translation" ? renderTranslation(ev) : renderAnswer(ev);
  } else if (ev.type === "companion-error") {
    notice(ev.message, true);
  }
}

// ── rendering (textContent only) ──────────────────────────────
function showFeed() {
  if (emptyEl.style.display !== "none") emptyEl.style.display = "none";
}

function stick() {
  feedEl.scrollTop = feedEl.scrollHeight;
}

function renderChat({ id, name, text, self }) {
  showFeed();
  const msg = document.createElement("div");
  msg.className = self ? "msg self" : "msg";
  msg.dataset.id = id;

  const head = document.createElement("div");
  head.className = "msg-head";
  const who = document.createElement("span");
  who.className = "msg-name";
  who.textContent = name;
  head.appendChild(who);

  if (!self) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "translate-btn";
    btn.textContent = "TRANSLATE";
    btn.disabled = !aiReady;
    btn.addEventListener("click", () => {
      btn.textContent = "…";
      btn.disabled = true;
      ws.send(JSON.stringify({ type: "translate", id }));
    });
    head.appendChild(btn);
  }

  const body = document.createElement("div");
  body.className = "msg-text";
  body.textContent = text;

  msg.append(head, body);
  feedEl.appendChild(msg);
  stick();
}

function renderTranslation({ forId, text }) {
  const msg = feedEl.querySelector(`.msg[data-id="${CSS.escape(String(forId))}"]`);
  if (!msg) return;
  msg.querySelector(".translate-btn")?.remove();
  let t = msg.querySelector(".msg-translation");
  if (!t) {
    t = document.createElement("div");
    t.className = "msg-translation";
    msg.appendChild(t);
  }
  t.textContent = text;
  stick();
}

function renderAnswer({ question, text }) {
  showFeed();
  const block = document.createElement("div");
  block.className = "companion-block";

  const tag = document.createElement("div");
  tag.className = "companion-tag";
  tag.textContent = "COMPANION";
  const q = document.createElement("div");
  q.className = "companion-q";
  q.textContent = question;
  const a = document.createElement("div");
  a.className = "companion-a";
  a.textContent = text;

  block.append(tag, q, a);
  feedEl.appendChild(block);
  stick();
}

function notice(text, isError = false) {
  showFeed();
  const n = document.createElement("div");
  n.className = isError ? "notice error" : "notice";
  n.textContent = text;
  feedEl.appendChild(n);
  stick();
}

// ── composer ──────────────────────────────────────────────────
function setMode(next) {
  mode = next;
  $("mode-chat").classList.toggle("active", next === "chat");
  $("mode-ask").classList.toggle("active", next === "ask");
  $("mode-chat").setAttribute("aria-pressed", String(next === "chat"));
  $("mode-ask").setAttribute("aria-pressed", String(next === "ask"));
  input.placeholder = next === "chat" ? "Say it to the stand…" : "Ask the companion anything about the game…";
  input.focus();
}
$("mode-chat").addEventListener("click", () => setMode("chat"));
$("mode-ask").addEventListener("click", () => setMode("ask"));

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || ws.readyState !== WebSocket.OPEN) return;
  if (mode === "ask" && !aiReady) {
    notice("the companion is still warming up", true);
    return;
  }
  ws.send(JSON.stringify({ type: mode === "chat" ? "send" : "ask", text }));
  input.value = "";
});
