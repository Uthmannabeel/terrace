import { describe, expect, test } from "vitest";
import {
  MAX_NAME_LENGTH,
  MAX_RAW_LENGTH,
  MAX_TEXT_LENGTH,
  PROTOCOL_VERSION,
  encodeMessage,
  makeChat,
  makePresence,
  parseMessage,
} from "./envelope.js";

describe("makeChat", () => {
  test("builds a versioned chat envelope", () => {
    const msg = makeChat({ name: "Nabeel", text: "GOAL!" });

    expect(msg.v).toBe(PROTOCOL_VERSION);
    expect(msg.kind).toBe("chat");
    expect(msg.name).toBe("Nabeel");
    expect(msg.text).toBe("GOAL!");
  });

  test("throws on empty text", () => {
    expect(() => makeChat({ name: "Nabeel", text: "" })).toThrow(/text/);
  });

  test("throws on oversized text", () => {
    const text = "x".repeat(MAX_TEXT_LENGTH + 1);
    expect(() => makeChat({ name: "Nabeel", text })).toThrow(/text/);
  });
});

describe("makePresence", () => {
  test("builds a presence envelope with nation", () => {
    const msg = makePresence({ name: "Aiko", nation: "JP", isJoining: true });

    expect(msg.kind).toBe("presence");
    expect(msg.nation).toBe("JP");
    expect(msg.isJoining).toBe(true);
  });

  test("rejects a nation that is not a 2-letter code", () => {
    expect(() => makePresence({ name: "Aiko", nation: "Japan", isJoining: true })).toThrow(
      /nation/,
    );
  });
});

describe("encode / parse round-trip", () => {
  test("chat survives the wire format", () => {
    const sent = makeChat({ name: "Marta", text: "¡Golazo!" });

    const parsed = parseMessage(encodeMessage(sent));

    expect(parsed.ok).toBe(true);
    expect(parsed.message).toEqual(sent);
  });

  test("encoded form is newline-terminated JSON", () => {
    const raw = encodeMessage(makeChat({ name: "a", text: "hi" }));
    expect(raw.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});

describe("parseMessage — hostile peer input", () => {
  test("rejects non-JSON garbage without throwing", () => {
    const parsed = parseMessage("not json at all");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/JSON/i);
  });

  test("rejects oversized raw input before parsing", () => {
    const parsed = parseMessage("x".repeat(MAX_RAW_LENGTH + 1));
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/size/i);
  });

  test("rejects unknown kinds", () => {
    const parsed = parseMessage(JSON.stringify({ v: PROTOCOL_VERSION, kind: "exec" }) + "\n");
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/kind/);
  });

  test("rejects wrong protocol version", () => {
    const parsed = parseMessage(
      JSON.stringify({ v: 999, kind: "chat", name: "a", text: "hi" }) + "\n",
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/version/i);
  });

  test("rejects chat with missing fields", () => {
    const parsed = parseMessage(JSON.stringify({ v: PROTOCOL_VERSION, kind: "chat" }) + "\n");
    expect(parsed.ok).toBe(false);
  });

  test("rejects names above the cap", () => {
    const parsed = parseMessage(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: "chat",
        name: "n".repeat(MAX_NAME_LENGTH + 1),
        text: "hi",
      }) + "\n",
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/name/);
  });

  test("strips unexpected extra fields instead of carrying them", () => {
    const parsed = parseMessage(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        kind: "chat",
        name: "a",
        text: "hi",
        __proto__: { evil: true },
        extra: "field",
      }) + "\n",
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.message).not.toHaveProperty("extra");
    expect(parsed.message.evil).toBeUndefined();
  });
});
