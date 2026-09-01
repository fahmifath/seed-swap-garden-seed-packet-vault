import { normalize, type SeedItem } from "./domain";
const KEY = "seed-packet-vault-v1";
export type LoadResult =
| { status: "ok"; items: SeedItem[] }
| { status: "empty" }
| { status: "partial"; items: SeedItem[]; message: string }
| { status: "error"; message: string };
export type SaveResult = { status: "ok" } | { status: "error"; message: string };
export function load(): LoadResult {
let raw: string | null;
try { raw = localStorage.getItem(KEY); }
catch { return { status: "error", message: "Could not read from storage." }; }
if (raw === null) return { status: "empty" };
let parsed: unknown;
try { parsed = JSON.parse(raw); }
catch { return { status: "error", message: "Stored data is corrupt and could not be read." }; }
if (!Array.isArray(parsed)) return { status: "error", message: "Stored data has an unexpected format." };
const valid: SeedItem[] = [];
let skipped = 0;
for (const entry of parsed) {
const item = normalize(entry);
if (item) valid.push(item); else skipped++;
}
if (!valid.length && !skipped) return { status: "empty" };
if (skipped > 0 && !valid.length) return { status: "error", message: `All ${skipped} stored packet(s) were corrupt and could not be recovered.` };
if (skipped > 0) return { status: "partial", items: valid, message: `${skipped} packet(s) could not be recovered due to corrupt data.` };
return { status: "ok", items: valid };
}
export function save(items: SeedItem[]): SaveResult {
try {
localStorage.setItem(KEY, JSON.stringify(items));
return { status: "ok" };
} catch (err) {
if (err instanceof DOMException && err.name === "QuotaExceededError") {
return { status: "error", message: "Storage quota exceeded. Remove some packets to free up space." };
}
return { status: "error", message: "Could not save to storage. Changes may be lost." };
}
}