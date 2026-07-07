import { describe, expect, test, vi } from "vitest";
import { createLineSplitter } from "./frame.js";
import { MAX_RAW_LENGTH } from "../protocol/envelope.js";

describe("createLineSplitter", () => {
  test("emits complete lines and holds partials", () => {
    const lines = [];
    const push = createLineSplitter((l) => lines.push(l));

    push(Buffer.from('{"a":1}\n{"b"'));
    expect(lines).toEqual(['{"a":1}']);

    push(Buffer.from(":2}\n"));
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  test("handles several lines in one chunk", () => {
    const lines = [];
    const push = createLineSplitter((l) => lines.push(l));
    push(Buffer.from("one\ntwo\nthree\n"));
    expect(lines).toEqual(["one", "two", "three"]);
  });

  test("skips empty lines", () => {
    const lines = [];
    const push = createLineSplitter((l) => lines.push(l));
    push(Buffer.from("\n\nx\n"));
    expect(lines).toEqual(["x"]);
  });

  test("reassembles a multi-byte character split across chunks", () => {
    const lines = [];
    const push = createLineSplitter((l) => lines.push(l));

    const bytes = Buffer.from("¡Golazo!\n", "utf8"); // "¡" is 2 bytes
    push(bytes.subarray(0, 1));
    push(bytes.subarray(1));

    expect(lines).toEqual(["¡Golazo!"]);
  });

  test("drops the buffer and signals overflow when a peer never sends newline", () => {
    const lines = [];
    const onOverflow = vi.fn();
    const push = createLineSplitter((l) => lines.push(l), onOverflow);

    push(Buffer.from("x".repeat(MAX_RAW_LENGTH * 4 + 1)));

    expect(onOverflow).toHaveBeenCalledOnce();
    expect(lines).toEqual([]);

    // splitter still works after the reset
    push(Buffer.from("ok\n"));
    expect(lines).toEqual(["ok"]);
  });
});
