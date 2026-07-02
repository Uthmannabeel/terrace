import { describe, expect, test } from "vitest";
import { TOPIC_BYTES, generateRoomCode, normalizeRoomCode, roomCodeToTopic } from "./code.js";

describe("generateRoomCode", () => {
  test("produces the XXXX-XXXX shape from the unambiguous alphabet", () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // 0, 1, I and O are excluded — too easy to misread when shared over a shout
    expect(code).not.toMatch(/[01IO]/);
  });

  test("produces different codes across calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe("normalizeRoomCode", () => {
  test("uppercases and trims", () => {
    expect(normalizeRoomCode("  ab2c-def3 ")).toBe("AB2C-DEF3");
  });

  test("accepts codes typed without the dash", () => {
    expect(normalizeRoomCode("ab2cdef3")).toBe("AB2C-DEF3");
  });

  test("throws on invalid characters", () => {
    expect(() => normalizeRoomCode("ab!c-def3")).toThrow(/room code/i);
  });

  test("throws on wrong length", () => {
    expect(() => normalizeRoomCode("ab2c")).toThrow(/room code/i);
  });
});

describe("roomCodeToTopic", () => {
  test("returns a 32-byte buffer", () => {
    const topic = roomCodeToTopic("AB2C-DEF3");
    expect(Buffer.isBuffer(topic)).toBe(true);
    expect(topic.length).toBe(TOPIC_BYTES);
  });

  test("is deterministic and case/format insensitive", () => {
    const a = roomCodeToTopic("AB2C-DEF3");
    const b = roomCodeToTopic("ab2cdef3");
    expect(a.equals(b)).toBe(true);
  });

  test("different codes give different topics", () => {
    const a = roomCodeToTopic("AB2C-DEF3");
    const b = roomCodeToTopic("AB2C-DEF4");
    expect(a.equals(b)).toBe(false);
  });
});
