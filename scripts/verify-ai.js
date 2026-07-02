// Live QVAC check: loads the model and runs one translation and one explanation.
// Slow on first run (downloads ~739MB to ~/.qvac). Not part of `npm test`.
import { loadModel, LLAMA_3_2_1B_INST_Q4_0, completion, unloadModel } from "@qvac/sdk";

console.log("[verify:ai] loading model (first run downloads ~739MB)...");
const started = Date.now();
const modelId = await loadModel({ modelSrc: LLAMA_3_2_1B_INST_Q4_0 });
console.log(`[verify:ai] loaded in ${((Date.now() - started) / 1000).toFixed(1)}s`);

async function run(label, history) {
  const result = completion({ modelId, history, stream: true });
  let text = "";
  for await (const token of result.tokenStream) text += token;
  console.log(`\n[verify:ai] ${label}:\n${text.trim()}`);
}

await run("translate", [
  {
    role: "user",
    content:
      'Translate this football fan message to English, reply with only the translation: "¡Golazo! Ese pase de tacón fue una locura."',
  },
]);

await run("explain", [
  {
    role: "user",
    content: "In two sentences, explain the offside rule to a new football fan.",
  },
]);

await unloadModel({ modelId });
console.log("\n[verify:ai] OK");
