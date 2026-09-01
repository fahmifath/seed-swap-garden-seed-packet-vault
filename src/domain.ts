export const SOURCES = ["bought", "saved", "swapped", "gifted"] as const;
export type Source = (typeof SOURCES)[number];
export const QUANTITIES = ["full", "partial", "nearly empty"] as const;
export type Quantity = (typeof QUANTITIES)[number];

export interface SeedItem {
  id: string; plantName: string; source: Source; packetYear: number;
  quantity: Quantity; notes: string; createdAt: string;
}

export interface ValidationErrors {
  [key: string]: string | undefined;
  plantName?: string; source?: string; packetYear?: string; quantity?: string;
}

export interface ValidateResult { ok: boolean; errors: ValidationErrors; }

export interface RawInput {
  plantName: string; source: string; packetYear: string; quantity: string; notes: string;
}

export const PLANT_NAME_MAX_LEN = 100;
export const NOTES_MAX_LEN = 500;
const YEAR_MIN = 1900;
const YEAR_MAX = 2100;

export function validate(input: RawInput): ValidateResult {
  const errors: ValidationErrors = {};
  const name = input.plantName.trim();
  if (!name) errors.plantName = "Plant name is required.";
  else if (name.length > PLANT_NAME_MAX_LEN) errors.plantName = `Plant name must be ${PLANT_NAME_MAX_LEN} characters or fewer.`;
  if (!SOURCES.includes(input.source as Source)) errors.source = "Please select a valid seed source.";
  const yr = Number(input.packetYear);
  if (!input.packetYear.trim()) errors.packetYear = "Packet year is required.";
  else if (!Number.isInteger(yr) || yr < YEAR_MIN || yr > YEAR_MAX) errors.packetYear = `Year must be a whole number between ${YEAR_MIN} and ${YEAR_MAX}.`;
  if (!QUANTITIES.includes(input.quantity as Quantity)) errors.quantity = "Please select a valid quantity.";
  return { ok: !Object.keys(errors).length, errors };
}

export function createItem(input: RawInput, id: string, now: string): SeedItem {
  return {
    id, plantName: input.plantName.trim(), source: input.source as Source,
    packetYear: Number(input.packetYear), quantity: input.quantity as Quantity,
    notes: input.notes.trim().slice(0, NOTES_MAX_LEN), createdAt: now,
  };
}

export function normalize(raw: unknown): SeedItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const input: RawInput = {
    plantName: typeof r.plantName === "string" ? r.plantName : "",
    source: typeof r.source === "string" ? r.source : "",
    packetYear: typeof r.packetYear === "number" ? String(r.packetYear) : String(r.packetYear ?? ""),
    quantity: typeof r.quantity === "string" ? r.quantity : "",
    notes: typeof r.notes === "string" ? r.notes : "",
  };
  if (!validate(input).ok) return null;
  const id = typeof r.id === "string" && r.id.trim() ? r.id : null;
  if (!id) return null;
  return {
    id, plantName: input.plantName.trim(), source: input.source as Source,
    packetYear: Number(input.packetYear), quantity: input.quantity as Quantity,
    notes: input.notes.trim().slice(0, NOTES_MAX_LEN),
    createdAt: typeof r.createdAt === "string" ? r.createdAt : new Date(0).toISOString(),
  };
}

export function filterItems(items: SeedItem[], query: string, source: Source | ""): SeedItem[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => (!q || item.plantName.toLowerCase().includes(q) || item.notes.toLowerCase().includes(q)) && (!source || item.source === source));
}

export function sortByExpiry(items: SeedItem[]): SeedItem[] {
  return [...items].sort((a, b) => a.packetYear - b.packetYear);
}

export type ExpiryStatus = "expired" | "expiring-soon" | "ok";

export function getExpiryStatus(packetYear: number, currentYear: number): ExpiryStatus {
  if (packetYear < currentYear) return "expired";
  if (packetYear === currentYear) return "expiring-soon";
  return "ok";
}

export function formatExpiry(packetYear: number, currentYear: number): string {
  const status = getExpiryStatus(packetYear, currentYear);
  if (status === "expired") return `${packetYear} (expired)`;
  if (status === "expiring-soon") return `${packetYear} (expires this year)`;
  return String(packetYear);
}