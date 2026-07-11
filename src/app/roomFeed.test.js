import { describe, expect, test } from "vitest";
import { addEntry, contextLines, createFeed, findEntry } from "./roomFeed.js";

describe("roomFeed", () => {
  test("assigns incrementing ids and keeps input immutable", () => {
    const feed0 = createFeed();
    const { feed: feed1, entry: e1 } = addEntry(feed0, { name: "A", text: "hi" });
    const { feed: feed2, entry: e2 } = addEntry(feed1, { name: "B", text: "yo" });

    expect(e1.id).toBe(1);
    expect(e2.id).toBe(2);
    expect(feed0.entries).toHaveLength(0);
    expect(feed2.entries).toHaveLength(2);
  });

  test("createFeed seeds ids from startId so they stay unique across restarts", () => {
    const { feed, entry } = addEntry(createFeed(1_700_000), { name: "A", text: "hi" });
    expect(entry.id).toBe(1_700_000);
    expect(feed.nextId).toBe(1_700_001);
  });

  test("findEntry retrieves by id", () => {
    const { feed } = addEntry(createFeed(), { name: "A", text: "hello" });
    expect(findEntry(feed, 1)?.text).toBe("hello");
    expect(findEntry(feed, 99)).toBeUndefined();
  });

  test("feed is bounded", () => {
    let feed = createFeed();
    for (let i = 0; i < 250; i++) {
      ({ feed } = addEntry(feed, { name: "A", text: `m${i}` }));
    }
    expect(feed.entries.length).toBeLessThanOrEqual(200);
    expect(feed.entries.at(-1).text).toBe("m249");
  });

  test("contextLines renders a short name-prefixed tail", () => {
    let feed = createFeed();
    for (let i = 0; i < 12; i++) {
      ({ feed } = addEntry(feed, { name: "Fan", text: `msg ${i}` }));
    }
    const lines = contextLines(feed);
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines.at(-1)).toBe("Fan: msg 11");
  });
});
