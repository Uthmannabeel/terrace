// Wire protocol for room messages. Everything a peer sends is hostile input:
// parseMessage never throws, caps sizes before JSON.parse, and rebuilds a clean
// object so unexpected fields (including __proto__) never reach the app.

export const PROTOCOL_VERSION = 1;
export const MAX_RAW_LENGTH = 8192;
export const MAX_TEXT_LENGTH = 1000;
export const MAX_NAME_LENGTH = 40;

const NATION_PATTERN = /^[A-Z]{2}$/;

function requireString(value, field, maxLength) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new Error(`${field} exceeds ${maxLength} characters`);
  }
  return value;
}

export function makeChat({ name, text }) {
  return {
    v: PROTOCOL_VERSION,
    kind: "chat",
    name: requireString(name, "name", MAX_NAME_LENGTH),
    text: requireString(text, "text", MAX_TEXT_LENGTH),
  };
}

export function makePresence({ name, nation, isJoining }) {
  if (typeof nation !== "string" || !NATION_PATTERN.test(nation)) {
    throw new Error("nation must be a 2-letter code");
  }
  return {
    v: PROTOCOL_VERSION,
    kind: "presence",
    name: requireString(name, "name", MAX_NAME_LENGTH),
    nation,
    isJoining: Boolean(isJoining),
  };
}

export function encodeMessage(message) {
  return `${JSON.stringify(message)}\n`;
}

const VALIDATORS = {
  chat: (raw) => makeChat({ name: raw.name, text: raw.text }),
  presence: (raw) => makePresence({ name: raw.name, nation: raw.nation, isJoining: raw.isJoining }),
};

export function parseMessage(raw) {
  if (typeof raw !== "string" || raw.length > MAX_RAW_LENGTH) {
    return { ok: false, error: `message size must be 1..${MAX_RAW_LENGTH} bytes` };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid JSON" };
  }

  if (data === null || typeof data !== "object") {
    return { ok: false, error: "invalid JSON: expected an object" };
  }
  if (data.v !== PROTOCOL_VERSION) {
    return { ok: false, error: `unsupported protocol version: ${data.v}` };
  }

  const validate = VALIDATORS[data.kind];
  if (!validate) {
    return { ok: false, error: `unknown kind: ${String(data.kind)}` };
  }

  try {
    return { ok: true, message: validate(data) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
