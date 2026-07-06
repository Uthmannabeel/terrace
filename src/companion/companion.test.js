import { describe, expect, test, vi } from "vitest";
import { Companion, MAX_QUEUE } from "./companion.js";

function fakeClient(reply = "ok", delayMs = 0) {
  return vi.fn(async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return reply;
  });
}

describe("Companion lifecycle", () => {
  test("starts not-ready; becomes ready after warmup", async () => {
    const companion = new Companion({ runCompletion: fakeClient(), loadClient: async () => {} });
    expect(companion.isReady).toBe(false);
    await companion.warmup();
    expect(companion.isReady).toBe(true);
  });

  test("requests before warmup reject with a friendly error", async () => {
    const companion = new Companion({ runCompletion: fakeClient(), loadClient: async () => {} });
    await expect(companion.explain("what is offside?")).rejects.toThrow(/warming up/i);
  });

  test("warmup failure surfaces as unavailable, not a crash", async () => {
    const companion = new Companion({
      runCompletion: fakeClient(),
      loadClient: async () => {
        throw new Error("model download failed");
      },
    });
    await expect(companion.warmup()).rejects.toThrow(/model download failed/);
    expect(companion.isReady).toBe(false);
  });
});

describe("Companion jobs", () => {
  async function ready(reply, delayMs) {
    const runCompletion = fakeClient(reply, delayMs);
    const companion = new Companion({ runCompletion, loadClient: async () => {} });
    await companion.warmup();
    return { companion, runCompletion };
  }

  test("translate builds a translation prompt and returns the reply", async () => {
    const { companion, runCompletion } = await ready("What a goal!");

    const result = await companion.translate("¡Qué golazo!", "English");

    expect(result).toBe("What a goal!");
    const history = runCompletion.mock.calls[0][0];
    const prompt = history.map((m) => m.content).join("\n");
    expect(prompt).toContain("¡Qué golazo!");
    expect(prompt).toContain("English");
  });

  test("explain includes recent room context", async () => {
    const { companion, runCompletion } = await ready("An offside means...");

    await companion.explain("why was that disallowed?", ["Ref called it back", "VAR check"]);

    const prompt = runCompletion.mock.calls[0][0].map((m) => m.content).join("\n");
    expect(prompt).toContain("why was that disallowed?");
    expect(prompt).toContain("VAR check");
  });

  test("jobs run one at a time in order", async () => {
    const order = [];
    const companion = new Companion({
      runCompletion: async (history) => {
        const tag = history.at(-1).content.match(/Question: (.+)$/)[1];
        order.push(`start-${tag}`);
        await new Promise((r) => setTimeout(r, 30));
        order.push(`end-${tag}`);
        return tag;
      },
      loadClient: async () => {},
    });
    await companion.warmup();

    await Promise.all([companion.explain("1"), companion.explain("2")]);

    expect(order).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  test("queue is bounded — overflow rejects instead of backing up forever", async () => {
    const { companion } = await ready("slow", 200);

    const jobs = Array.from({ length: MAX_QUEUE + 2 }, (_, i) =>
      companion.explain(`q${i}`).catch((e) => e),
    );
    const results = await Promise.all(jobs);

    const rejected = results.filter((r) => r instanceof Error);
    expect(rejected.length).toBeGreaterThan(0);
    expect(String(rejected[0].message)).toMatch(/busy/i);
  });

  test("input length is capped before it reaches the model", async () => {
    const { companion } = await ready();
    await expect(companion.translate("x".repeat(5000), "English")).rejects.toThrow(/long/i);
  });
});
