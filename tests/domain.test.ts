import { describe, it, expect } from "vitest";
import {
  validate, createItem, normalize, filterItems, sortByExpiry,
  getExpiryStatus, formatExpiry, SOURCES, QUANTITIES,
  PLANT_NAME_MAX_LEN, NOTES_MAX_LEN, type RawInput, type SeedItem,
} from "../src/domain";

const gi = (o: Partial<RawInput> = {}): RawInput => ({
  plantName: "Cherry Tomato – Sun Gold", source: "bought",
  packetYear: "2027", quantity: "full", notes: "great germination", ...o,
});

const gm = (o: Partial<SeedItem> = {}): SeedItem => ({
  id: "abc-123", plantName: "Cherry Tomato – Sun Gold", source: "bought",
  packetYear: 2027, quantity: "full", notes: "great germination",
  createdAt: "2025-01-01T00:00:00.000Z", ...o,
});

const bad = (o: Partial<RawInput>, f: string) => {
  const r = validate(gi(o));
  expect(r.ok).toBe(false);
  expect(r.errors[f]).toBeTruthy();
};
const good = (o: Partial<RawInput>) => expect(validate(gi(o)).ok).toBe(true);

describe("validate – plantName", () => {
  it("rejects empty plant name", () => bad({ plantName: "" }, "plantName"));
  it("rejects whitespace-only plant name", () => bad({ plantName: "   " }, "plantName"));
  it("accepts a plant name at the exact max length", () => good({ plantName: "a".repeat(PLANT_NAME_MAX_LEN) }));
  it("rejects a plant name one character over the max length", () => bad({ plantName: "a".repeat(PLANT_NAME_MAX_LEN + 1) }, "plantName"));
  it("accepts a normal plant name", () => good({ plantName: "Basil – Genovese" }));
});

describe("validate – source", () => {
  it("rejects empty source", () => bad({ source: "" }, "source"));
  it("rejects an unknown source value", () => bad({ source: "stolen" }, "source"));
  it("accepts all valid source values", () => {
    for (const source of SOURCES) good({ source });
  });
});

describe("validate – packetYear", () => {
  it("rejects empty packet year", () => bad({ packetYear: "" }, "packetYear"));
  it("rejects a non-numeric year", () => bad({ packetYear: "abc" }, "packetYear"));
  it("rejects a year below the minimum (1900)", () => bad({ packetYear: "1899" }, "packetYear"));
  it("rejects a year above the maximum (2100)", () => bad({ packetYear: "2101" }, "packetYear"));
  it("accepts the boundary year 1900", () => good({ packetYear: "1900" }));
  it("accepts the boundary year 2100", () => good({ packetYear: "2100" }));
  it("rejects a decimal year", () => bad({ packetYear: "2025.5" }, "packetYear"));
});

describe("validate – quantity", () => {
  it("rejects empty quantity", () => bad({ quantity: "" }, "quantity"));
  it("rejects unknown quantity value", () => bad({ quantity: "overflowing" }, "quantity"));
  it("accepts all valid quantity values", () => {
    for (const quantity of QUANTITIES) good({ quantity });
  });
});

describe("validate – multiple errors", () => {
  it("reports errors for all invalid fields simultaneously", () => {
    const { ok, errors } = validate({ plantName: "", source: "", packetYear: "", quantity: "", notes: "" });
    expect(ok).toBe(false);
    expect(errors.plantName && errors.source && errors.packetYear && errors.quantity).toBeTruthy();
  });
});

describe("createItem", () => {
  it("creates an item with the provided id and now parameters", () => {
    const item = createItem(gi(), "test-id", "2025-01-01T00:00:00.000Z");
    expect(item.id).toBe("test-id");
    expect(item.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });
  it("trims whitespace from plantName", () => {
    expect(createItem(gi({ plantName: "  Basil  " }), "x", "2025-01-01").plantName).toBe("Basil");
  });
  it("truncates notes to NOTES_MAX_LEN characters", () => {
    expect(createItem(gi({ notes: "x".repeat(NOTES_MAX_LEN + 50) }), "x", "2025-01-01").notes.length).toBe(NOTES_MAX_LEN);
  });
  it("parses packetYear as a number", () => {
    expect(createItem(gi({ packetYear: "2029" }), "x", "2025-01-01").packetYear).toBe(2029);
  });
});

describe("normalize – non-object raw shapes", () => {
  it("rejects null", () => { expect(normalize(null)).toBeNull(); });
  it("rejects a bare string", () => { expect(normalize("Cherry Tomato")).toBeNull(); });
  it("rejects a bare number", () => { expect(normalize(42)).toBeNull(); });
  it("rejects an array", () => { expect(normalize([])).toBeNull(); });
  it("rejects undefined", () => { expect(normalize(undefined)).toBeNull(); });
});

describe("normalize – malformed objects", () => {
  it("rejects an object with missing required fields", () => { expect(normalize({ id: "abc" })).toBeNull(); });
  it("rejects an object with wrong-type plantName", () => { expect(normalize({ ...gm(), plantName: 123 })).toBeNull(); });
  it("rejects an object with an invalid source", () => { expect(normalize({ ...gm(), source: "bad" })).toBeNull(); });
  it("rejects an object with an invalid quantity", () => { expect(normalize({ ...gm(), quantity: "bad" })).toBeNull(); });
  it("rejects an object with a packetYear out of range", () => { expect(normalize({ ...gm(), packetYear: 1800 })).toBeNull(); });
  it("rejects an object with no id", () => {
    const raw = { ...gm() };
    // @ts-expect-error test
    delete raw.id;
    expect(normalize(raw)).toBeNull();
  });
  it("rejects an object with an empty string id", () => { expect(normalize({ ...gm(), id: "" })).toBeNull(); });
});

describe("normalize – valid shapes", () => {
  it("normalizes a well-formed stored item", () => {
    expect(normalize(gm())?.plantName).toBe("Cherry Tomato – Sun Gold");
  });
  it("falls back to epoch for missing createdAt", () => {
    const raw = { ...gm() };
    // @ts-expect-error test
    delete raw.createdAt;
    expect(normalize(raw)?.createdAt).toBe(new Date(0).toISOString());
  });
  it("handles numeric packetYear from JSON correctly", () => {
    expect(normalize({ ...gm(), packetYear: 2026 })?.packetYear).toBe(2026);
  });
});

describe("filterItems", () => {
  const items: SeedItem[] = [
    gm({ id: "1", plantName: "Cherry Tomato", source: "bought", notes: "great germination" }),
    gm({ id: "2", plantName: "Basil Genovese", source: "saved", notes: "needs soaking" }),
    gm({ id: "3", plantName: "Purple Basil", source: "swapped", notes: "" }),
    gm({ id: "4", plantName: "Sunflower Giant", source: "gifted", notes: "from neighbor" }),
  ];

  it("returns all items when query and source are empty", () => {
    expect(filterItems(items, "", "")).toHaveLength(4);
  });
  it("filters by plant name (case-insensitive)", () => {
    expect(filterItems(items, "basil", "").map((i) => i.id)).toEqual(["2", "3"]);
  });
  it("filters by notes text", () => {
    expect(filterItems(items, "soaking", "").map((i) => i.id)).toEqual(["2"]);
  });
  it("filters by source type", () => {
    expect(filterItems(items, "", "saved")).toHaveLength(1);
  });
  it("applies both text and source filters together", () => {
    expect(filterItems(items, "basil", "swapped").map((i) => i.id)).toEqual(["3"]);
  });
  it("returns empty array when no items match", () => {
    expect(filterItems(items, "zzznomatch", "")).toHaveLength(0);
  });
  it("returns empty array when source matches no items", () => {
    expect(filterItems(items, "", "bought" as never)).toHaveLength(1);
  });
  it("does not mutate the input array", () => {
    const copy = [...items];
    filterItems(items, "basil", "saved");
    expect(items).toEqual(copy);
  });
});

describe("sortByExpiry", () => {
  it("sorts ascending by packetYear", () => {
    const items = [gm({ id: "a", packetYear: 2028 }), gm({ id: "b", packetYear: 2022 }), gm({ id: "c", packetYear: 2025 })];
    expect(sortByExpiry(items).map((i) => i.packetYear)).toEqual([2022, 2025, 2028]);
  });
  it("does not mutate the input array", () => {
    const items = [gm({ id: "a", packetYear: 2030 }), gm({ id: "b", packetYear: 2020 })];
    const orig = items.map((i) => i.id);
    sortByExpiry(items);
    expect(items.map((i) => i.id)).toEqual(orig);
  });
  it("handles an empty array", () => { expect(sortByExpiry([])).toEqual([]); });
  it("handles a single-item array", () => { expect(sortByExpiry([gm({ packetYear: 2025 })])).toHaveLength(1); });
});

describe("getExpiryStatus", () => {
  it("returns 'expired' when packetYear is before current year", () => {
    expect(getExpiryStatus(2020, 2026)).toBe("expired");
  });
  it("returns 'expiring-soon' when packetYear equals current year", () => {
    expect(getExpiryStatus(2026, 2026)).toBe("expiring-soon");
  });
  it("returns 'ok' when packetYear is after current year", () => {
    expect(getExpiryStatus(2030, 2026)).toBe("ok");
  });
  it("handles boundary year at exactly min year", () => {
    expect(getExpiryStatus(1900, 1901)).toBe("expired");
  });
});

describe("formatExpiry", () => {
  it("includes '(expired)' label for past years", () => {
    expect(formatExpiry(2020, 2026)).toContain("(expired)");
  });
  it("includes '(expires this year)' label for current year", () => {
    expect(formatExpiry(2026, 2026)).toContain("(expires this year)");
  });
  it("returns just the year for future years", () => {
    expect(formatExpiry(2030, 2026)).toBe("2030");
  });
});
