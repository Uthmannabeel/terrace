// Room codes are how fans share a room over a shout or a group chat:
// short, unambiguous (no 0/O or 1/I), case-insensitive. The Hyperswarm topic
// is derived from the normalized code, so any spelling that normalizes the
// same lands in the same room.

import crypto from "node:crypto";

export const TOPIC_BYTES = 32;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUP_LENGTH = 4;
const CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const TOPIC_NAMESPACE = "terrace/room/v1/";

export function generateRoomCode() {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  const group = () => Array.from({ length: GROUP_LENGTH }, pick).join("");
  return `${group()}-${group()}`;
}

export function normalizeRoomCode(input) {
  if (typeof input !== "string") {
    throw new Error("room code must be a string");
  }
  const compact = input.trim().toUpperCase().replace(/-/g, "");
  const grouped = `${compact.slice(0, GROUP_LENGTH)}-${compact.slice(GROUP_LENGTH)}`;
  if (!CODE_PATTERN.test(grouped)) {
    throw new Error("room code must be 8 letters/digits, like AB2C-DEF3");
  }
  return grouped;
}

export function roomCodeToTopic(input) {
  const code = normalizeRoomCode(input);
  return crypto.createHash("sha256").update(`${TOPIC_NAMESPACE}${code}`).digest();
}
