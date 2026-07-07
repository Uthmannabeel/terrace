// Newline-delimited JSON framing over a peer socket. Peers are untrusted:
// the accumulator is capped so a peer that never sends a newline cannot
// grow memory without bound.

import { StringDecoder } from "node:string_decoder";
import { MAX_RAW_LENGTH } from "../protocol/envelope.js";

const MAX_BUFFER = MAX_RAW_LENGTH * 4;

export function createLineSplitter(onLine, onOverflow) {
  // StringDecoder holds partial multi-byte sequences across TCP chunk
  // boundaries — chunk.toString() would garble "¡Golazo!" split mid-character.
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  return function push(chunk) {
    buffer += decoder.write(chunk);
    if (buffer.length > MAX_BUFFER) {
      buffer = "";
      onOverflow?.();
      return;
    }
    let idx = buffer.indexOf("\n");
    while (idx !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.length > 0) onLine(line);
      idx = buffer.indexOf("\n");
    }
  };
}
