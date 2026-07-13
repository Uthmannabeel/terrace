// Real QVAC wiring for the Companion: loads the model once, streams
// completions to a string. Kept separate from companion.js so tests can
// inject a fake and never touch the SDK.

const MAX_OUTPUT_TOKENS = 220;

export function createQvacClient() {
  let modelId = null;
  let sdk = null;

  return {
    async loadClient() {
      // Imported lazily: the SDK's native bindings cost ~1s to evaluate, which
      // would otherwise delay UI startup even in --no-ai (chat-only) mode.
      sdk = await import("@qvac/sdk");
      modelId = await sdk.loadModel({ modelSrc: sdk.LLAMA_3_2_1B_INST_Q4_0 });
    },

    async runCompletion(history, signal) {
      if (!modelId) throw new Error("model not loaded");
      const result = sdk.completion({ modelId, history, stream: true });
      let text = "";
      let tokens = 0;
      for await (const token of result.tokenStream) {
        if (signal?.aborted) break; // timed out upstream — stop consuming the stream
        text += token;
        tokens += 1;
        if (tokens >= MAX_OUTPUT_TOKENS) break;
      }
      return text.trim();
    },
  };
}
