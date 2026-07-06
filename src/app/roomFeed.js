// In-memory feed of the room's chat: assigns local ids (so the UI can ask
// "translate message 12"), and keeps a bounded tail as context for the
// companion. Pure — no IO.

const MAX_FEED = 200;
const CONTEXT_LINES = 8;

export function createFeed() {
  return { nextId: 1, entries: [] };
}

export function addEntry(feed, { name, text, self }) {
  const entry = { id: feed.nextId, name, text, self: Boolean(self) };
  const entries = [...feed.entries, entry].slice(-MAX_FEED);
  return { feed: { nextId: feed.nextId + 1, entries }, entry };
}

export function findEntry(feed, id) {
  return feed.entries.find((e) => e.id === id);
}

export function contextLines(feed) {
  return feed.entries.slice(-CONTEXT_LINES).map((e) => `${e.name}: ${e.text}`);
}
