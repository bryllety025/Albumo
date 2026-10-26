// Keeps someone from guessing an event's password by trying one after another: a few wrong tries, then a wait.
// In this server's memory -- enough to make guessing hopeless without a database; a restart (or a second server)
// only gives a guesser a fresh few tries. Two counters, so that neither one is the only thing standing in the way:
//
//   - per visitor and event: a handful of wrong tries, then a wait for that visitor alone;
//   - per event, whoever is trying: a much larger number of wrong tries, then a wait for everyone. It exists for
//     the visitor who hides their address (the address comes from a header, and a client can send any header it
//     likes if nothing in front of this server overwrites it), so a flood of guesses is bounded no matter how
//     many addresses it pretends to come from. The cost is that a flood can also make guests wait; it is far
//     above what a party of honest typos reaches, and it only ever delays, for ten minutes, never locks for good.

const MAX_WRONG_TRIES = 10;
const MAX_WRONG_TRIES_PER_EVENT = 300;
const WINDOW_MS = 10 * 60 * 1000;
// Several guests behind one address (a venue's wifi) share a counter, so it is generous; a request with no address
// at all shares one counter with every other such request, which gets a still larger allowance rather than
// letting one person lock everybody out.
const MAX_WRONG_TRIES_UNKNOWN_ADDRESS = 100;
const EVENT_KEY = "*";

type Tries = { wrong: number; resetAt: number };
const records = new Map<string, Tries>();

/**
 * The visitor's address as the proxy in front of this server reports it, or "unknown". The LAST entry of
 * `X-Forwarded-For` is the one the nearest proxy added itself; the entries before it are whatever the client
 * claimed, so they are not used.
 */
export function clientAddress(req: Request): string {
  const candidates = [req.headers.get("x-forwarded-for")?.split(",").at(-1), req.headers.get("x-real-ip")];
  for (const candidate of candidates) {
    const address = candidate?.trim();
    // Only something that looks like an IPv4 or IPv6 address: whatever else a header says is not an address.
    if (address && /^[0-9a-fA-F:.]{2,45}$/.test(address)) return address;
  }
  return "unknown";
}

function limitFor(address: string): number {
  if (address === EVENT_KEY) return MAX_WRONG_TRIES_PER_EVENT;
  return address === "unknown" ? MAX_WRONG_TRIES_UNKNOWN_ADDRESS : MAX_WRONG_TRIES;
}

function live(key: string, now: number): Tries | undefined {
  const record = records.get(key);
  if (record && record.resetAt <= now) {
    records.delete(key);
    return undefined;
  }
  return record;
}

function secondsLeft(address: string, slug: string, now: number): number {
  const record = live(`${address}|${slug}`, now);
  if (!record || record.wrong < limitFor(address)) return 0;
  return Math.ceil((record.resetAt - now) / 1000);
}

/** Seconds this visitor must wait before trying again, or 0 if they may try now. */
export function waitSeconds(address: string, slug: string, now = Date.now()): number {
  return Math.max(secondsLeft(address, slug, now), secondsLeft(EVENT_KEY, slug, now));
}

function bump(key: string, now: number): void {
  const record = live(key, now);
  if (record) {
    record.wrong += 1;
    return;
  }
  records.set(key, { wrong: 1, resetAt: now + WINDOW_MS });
}

export function recordWrongTry(address: string, slug: string, now = Date.now()): void {
  // Keep the table from growing without bound under a flood of different addresses.
  if (records.size > 5000) {
    for (const [oldKey, old] of records) if (old.resetAt <= now) records.delete(oldKey);
    if (records.size > 5000) records.clear();
  }
  bump(`${address}|${slug}`, now);
  bump(`${EVENT_KEY}|${slug}`, now);
}

/** A right password forgives this visitor's wrong tries before it (the event-wide count is left alone). */
export function clearWrongTries(address: string, slug: string): void {
  records.delete(`${address}|${slug}`);
}
