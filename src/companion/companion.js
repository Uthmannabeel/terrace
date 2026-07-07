// The on-device match companion. One small model, loaded once and kept
// resident; every request goes through a single-lane bounded queue so slow
// generation can never block the chat path — chat is instant, AI answers
// arrive when they arrive.

import { buildExplainPrompt, buildTranslatePrompt } from "./prompts.js";

export const MAX_QUEUE = 4;
export const MAX_INPUT_LENGTH = 1500;
export const COMPLETION_TIMEOUT_MS = 60_000;

export class Companion {
  #runCompletion;
  #loadClient;
  #timeoutMs;
  #ready = false;
  #queue = [];
  #running = false;

  constructor({ runCompletion, loadClient, timeoutMs = COMPLETION_TIMEOUT_MS }) {
    this.#runCompletion = runCompletion;
    this.#loadClient = loadClient;
    this.#timeoutMs = timeoutMs;
  }

  get isReady() {
    return this.#ready;
  }

  async warmup() {
    await this.#loadClient();
    this.#ready = true;
  }

  translate(text, targetLanguage) {
    return this.#enqueue(() => buildTranslatePrompt(this.#capped(text), targetLanguage));
  }

  explain(question, roomContext = []) {
    return this.#enqueue(() => buildExplainPrompt(this.#capped(question), roomContext));
  }

  #capped(text) {
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("text must be a non-empty string");
    }
    if (text.length > MAX_INPUT_LENGTH) {
      throw new Error(`text too long (max ${MAX_INPUT_LENGTH} characters)`);
    }
    return text;
  }

  #enqueue(buildHistory) {
    if (!this.#ready) {
      return Promise.reject(new Error("the companion is still warming up"));
    }
    if (this.#queue.length >= MAX_QUEUE) {
      return Promise.reject(new Error("the companion is busy — try again in a moment"));
    }
    let history;
    try {
      history = buildHistory();
    } catch (err) {
      return Promise.reject(err);
    }
    return new Promise((resolve, reject) => {
      this.#queue.push({ history, resolve, reject });
      void this.#drain();
    });
  }

  async #drain() {
    if (this.#running) return;
    this.#running = true;
    try {
      while (this.#queue.length > 0) {
        const job = this.#queue.shift();
        try {
          job.resolve(await this.#withTimeout(this.#runCompletion(job.history)));
        } catch (err) {
          job.reject(err);
        }
      }
    } finally {
      this.#running = false;
    }
  }

  // A stalled generation must not wedge the single lane forever — time the
  // job out so the drain loop moves on and later asks can still run.
  #withTimeout(promise) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("the companion took too long — try again")),
        this.#timeoutMs,
      );
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}
