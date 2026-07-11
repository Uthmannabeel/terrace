// Terrace page logic. Two views: lobby (create/join) and room. Everything
// renders via textContent — peer text is hostile input, never markup.

const $ = (id) => document.getElementById(id);
const feedEl = $("feed");

let mode = "chat";
let aiReady = false;
let inRoom = false;
let joinedAt = null;
let lastAuthor = null;

// fixed username palette (Twitch-style): assigned by name hash, never random
const NAME_COLORS = ["#d6ff3f", "#5ec8f0", "#f0a35e", "#e57fe5", "#7fe5a3", "#f0e35e", "#f08a8a", "#9d8af0"];
function nameColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

// ── views ─────────────────────────────────────────────────────
function showLobby() {
  $("lobby").hidden = false;
  $("room").hidden = true;
}
function showRoom(code) {
  $("lobby").hidden = true;
  $("room").hidden = false;
  $("room-code").textContent = code;
  document.title = `Terrace — ${code}`;
  if (!joinedAt) joinedAt = Date.now();
  $("input").focus();
}

// ── clock ─────────────────────────────────────────────────────
setInterval(() => {
  if (!joinedAt) return;
  const secs = Math.floor((Date.now() - joinedAt) / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  $("clock").textContent = `${mm}:${ss}`;
}, 1000);

$("room-code").addEventListener("click", () => {
  navigator.clipboard?.writeText($("room-code").textContent.trim()).then(() => {
    notice("ROOM CODE COPIED");
  });
});

// ── websocket to the local app process ────────────────────────
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
const MAX_SEEN_IDS = 600;

function rememberChatId(id) {
  seenChatIds.add(id);
  // ids only grow and the app replays at most its last 200 — old ids are safe to forget
  if (seenChatIds.size > MAX_SEEN_IDS) {
    const oldest = seenChatIds.values();
    for (let i = 0; i < MAX_SEEN_IDS / 2; i += 1) seenChatIds.delete(oldest.next().value);
  }
}

function handle(ev) {
  if (ev.type === "lobby") {
    // returning to the lobby (e.g. the app restarted under us): clear room state
    // so the create button, clock, and status guard don't stay stuck from before
    setBusy(false);
    inRoom = false;
    joinedAt = null;
    if (ev.name) $("lobby-name").value = ev.name;
    showLobby();
  } else if (ev.type === "joined") {
    inRoom = true;
    showRoom(ev.room);
    if (!ev.aiEnabled) $("companion-lamp").textContent = "COMPANION OFF";
  } else if (ev.type === "join-error") {
    setBusy(false);
    const note = $("lobby-note");
    note.textContent = ev.message;
    note.classList.add("error");
  } else if (ev.type === "status") {
    if (!inRoom) return;
    $("stand").textContent = `IN THE STAND · ${ev.peers + 1}`;
    $("live-chip").hidden = ev.peers === 0;
    aiReady = Boolean(ev.aiReady);
    const lamp = $("companion-lamp");
    if (ev.aiEnabled) lamp.dataset.state = aiReady ? "ready" : "warming";
    document.querySelectorAll(".translate-btn").forEach((b) => {
      if (b.textContent !== "…") b.disabled = !aiReady; // "…" = request in flight
    });
  } else if (ev.type === "chat") {
    if (seenChatIds.has(ev.id)) return;
    rememberChatId(ev.id);
    renderChat(ev);
  } else if (ev.type === "presence" && ev.isJoining) {
    notice(`${ev.name} (${ev.nation}) IS IN THE STAND`);
    lastAuthor = null;
  } else if (ev.type === "companion") {
    ev.kind === "translation" ? renderTranslation(ev) : renderAnswer(ev);
  } else if (ev.type === "companion-error") {
    if (ev.forId != null) restoreTranslateBtn(ev.forId);
    notice(ev.message.toUpperCase(), true);
  }
}

// ── lobby actions ─────────────────────────────────────────────
function identity() {
  return {
    name: $("lobby-name").value.trim() || "Fan",
    lang: $("lobby-lang").value,
  };
}
function setBusy(busy) {
  $("create-btn").disabled = busy;
  $("create-btn").textContent = busy ? "OPENING…" : "START A ROOM";
}
function lobbyError(text) {
  const note = $("lobby-note");
  note.textContent = text;
  note.classList.add("error");
}
$("create-btn").addEventListener("click", () => {
  if (ws.readyState !== WebSocket.OPEN) {
    lobbyError("STILL CONNECTING — TRY AGAIN");
    return;
  }
  setBusy(true);
  ws.send(JSON.stringify({ type: "create", ...identity() }));
});
$("join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("join-code").value.trim();
  if (!code) return;
  if (ws.readyState !== WebSocket.OPEN) {
    lobbyError("STILL CONNECTING — TRY AGAIN");
    return;
  }
  ws.send(JSON.stringify({ type: "join", room: code, ...identity() }));
});

// ── rendering (textContent only) ──────────────────────────────
function showFeed() {
  const empty = $("empty");
  if (empty && !empty.hidden) empty.hidden = true;
}
const MAX_RENDERED = 300;
function stick() {
  // a peer flooding valid messages must not grow the DOM without bound
  while (feedEl.children.length > MAX_RENDERED) feedEl.removeChild(feedEl.firstElementChild);
  feedEl.scrollTop = feedEl.scrollHeight;
}

function renderChat({ id, name, text, self }) {
  showFeed();
  const grouped = lastAuthor === name;
  lastAuthor = name;

  const msg = document.createElement("div");
  msg.className = grouped ? "msg grouped" : "msg";
  msg.dataset.id = id;

  const who = document.createElement("span");
  who.className = "msg-name";
  who.textContent = name;
  who.style.color = self ? "var(--ink)" : nameColor(name);

  const body = document.createElement("span");
  body.className = "msg-text";
  body.textContent = text;

  msg.append(who, body);

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
    msg.appendChild(btn);
  }

  feedEl.appendChild(msg);
  stick();
}

function restoreTranslateBtn(forId) {
  const btn = feedEl.querySelector(`.msg[data-id="${CSS.escape(String(forId))}"] .translate-btn`);
  if (btn) {
    btn.textContent = "TRANSLATE";
    btn.disabled = !aiReady;
  }
}

function renderTranslation({ forId, text }) {
  const msg = feedEl.querySelector(`.msg[data-id="${CSS.escape(String(forId))}"]`);
  if (!msg) return;
  msg.querySelector(".translate-btn")?.remove();
  let t = msg.nextElementSibling;
  if (!t || !t.classList.contains("msg-translation")) {
    t = document.createElement("div");
    t.className = "msg-translation";
    msg.after(t);
  }
  t.textContent = text;
  stick();
}

function renderAnswer({ question, text }) {
  showFeed();
  lastAuthor = null;
  const block = document.createElement("div");
  block.className = "companion-block";

  const tag = document.createElement("div");
  tag.className = "companion-tag";
  tag.textContent = "COMPANION · ON THIS DEVICE";
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
  lastAuthor = null;
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
  $("input").placeholder =
    next === "chat" ? "Say it to the stand…" : "Ask about the match — answered on this device…";
  $("input").focus();
}
$("mode-chat").addEventListener("click", () => setMode("chat"));
$("mode-ask").addEventListener("click", () => setMode("ask"));

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("input").value.trim();
  if (!text || ws.readyState !== WebSocket.OPEN) return;
  if (mode === "ask" && !aiReady) {
    notice("THE COMPANION IS STILL WARMING UP", true);
    return;
  }
  ws.send(JSON.stringify({ type: mode === "chat" ? "send" : "ask", text }));
  $("input").value = "";
});
