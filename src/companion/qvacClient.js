// Real QVAC wiring for the Companion: loads the model once, streams
// completions to a string. Kept separate from companion.js so tests can
// inject a fake and never touch the SDK.

import { completion, loadModel, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";

const MAX_OUTPUT_TOKENS = 220;

export function createQvacClient() {
  let modelId = null;

  return {
    async loadClient() {
      modelId = await loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0 });
    },

    async runCompletion(history) {
      if (!modelId) throw new Error("model not loaded");
      const result = completion({ modelId, history, stream: true });
      let text = "";
      let tokens = 0;
      for await (const token of result.tokenStream) {
        text += token;
        tokens += 1;
        if (tokens >= MAX_OUTPUT_TOKENS) break;
      }
      return text.trim();
    },
  };
}
