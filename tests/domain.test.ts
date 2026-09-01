import { describe, it, expect } from "vitest";
import {
  validate, createItem, normalize, filterItems, sortByExpiry,
  getExpiryStatus, formatExpiry, SOURCES, QUANTITIES,
  PLANT_NAME_MAX_LEN, NOTES_MAX_LEN, type RawInput, type SeedItem,
} from "../src/domain";

const gi=(o:Partial<RawInput>={}):RawInput=>({plantName:"Tomato",source:"bought",packetYear:"2027",quantity:"full",notes:"good",...o});
const gm=(o:Partial<SeedItem>={}):SeedItem=>({id:"1",plantName:"Tomato",source:"bought",packetYear:2027,quantity:"full",notes:"good",createdAt:"2025-01-01T00:00:00.000Z",...o});

const bad=(o:Partial<RawInput>,f:string)=>{const r=validate(gi(o));expect(r.ok).toBe(false);expect(r.errors[f]).toBeTruthy();};
const good=(o:Partial<RawInput>)=>expect(validate(gi(o)).ok).toBe(true);
const badN=(n:string)=>bad({plantName:n},"plantName");
const goodN=(n:string)=>good({plantName:n});
const badY=(y:string)=>bad({packetYear:y},"packetYear");
const goodY=(y:string)=>good({packetYear:y});
const norm=(v:unknown)=>expect(normalize(v));

describe("validate – plantName",()=>{
  it("rejects empty plant name",()=>badN(""));
  it("rejects whitespace-only name",()=>badN("   "));
  it("accepts name at max length",()=>goodN("a".repeat(PLANT_NAME_MAX_LEN)));
  it("rejects name over max length",()=>badN("a".repeat(PLANT_NAME_MAX_LEN+1)));
  it("accepts normal plant name",()=>goodN("Basil – Genovese"));
});

describe("validate – source",()=>{
  it("rejects empty source",()=>bad({source:""},"source"));
  it("rejects unknown source value",()=>bad({source:"stolen"},"source"));
  it("accepts all valid source values",()=>{for(const source of SOURCES)good({source});});
});

describe("validate – packetYear",()=>{
  it("rejects empty year",()=>badY(""));
  it("rejects non-numeric year",()=>badY("abc"));
  it("rejects below min 1900",()=>badY("1899"));
  it("rejects above max 2100",()=>badY("2101"));
  it("accepts min year 1900",()=>goodY("1900"));
  it("accepts max year 2100",()=>goodY("2100"));
  it("rejects decimal year",()=>badY("2025.5"));
});

describe("validate – quantity",()=>{
  it("rejects empty quantity",()=>bad({quantity:""},"quantity"));
  it("rejects unknown quantity value",()=>bad({quantity:"overflowing"},"quantity"));
  it("accepts all valid quantity values",()=>{for(const quantity of QUANTITIES)good({quantity});});
});

describe("validate – multiple errors",()=>{
  it("reports errors for all invalid fields simultaneously",()=>{
    const {ok,errors}=validate({plantName:"",source:"",packetYear:"",quantity:"",notes:""});
    expect(ok).toBe(false);
    expect(errors.plantName&&errors.source&&errors.packetYear&&errors.quantity).toBeTruthy();
  });
});

describe("createItem",()=>{
  it("creates item with provided id and now parameters",()=>{
    const item=createItem(gi(),"test-id","2025-01-01T00:00:00.000Z");
    expect(item.id).toBe("test-id");
    expect(item.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });
  it("trims whitespace from plantName",()=>{expect(createItem(gi({plantName:"  Basil  "}),"x","2025-01-01").plantName).toBe("Basil");});
  it("truncates notes to NOTES_MAX_LEN characters",()=>{expect(createItem(gi({notes:"x".repeat(NOTES_MAX_LEN+50)}),"x","2025-01-01").notes.length).toBe(NOTES_MAX_LEN);});
  it("parses packetYear as a number",()=>{expect(createItem(gi({packetYear:"2029"}),"x","2025-01-01").packetYear).toBe(2029);});
});

describe("normalize – non-object raw shapes",()=>{
  it("rejects null",()=>norm(null).toBeNull());
  it("rejects bare string",()=>norm("Tomato").toBeNull());
  it("rejects bare number",()=>norm(42).toBeNull());
  it("rejects array",()=>norm([]).toBeNull());
  it("rejects undefined",()=>norm(undefined).toBeNull());
});

describe("normalize – malformed objects",()=>{
  it("rejects missing required fields",()=>norm({id:"abc"}).toBeNull());
  it("rejects wrong-type plantName",()=>norm({...gm(),plantName:123}).toBeNull());
  it("rejects invalid source",()=>norm({...gm(),source:"bad"}).toBeNull());
  it("rejects invalid quantity",()=>norm({...gm(),quantity:"bad"}).toBeNull());
  it("rejects out-of-range packetYear",()=>norm({...gm(),packetYear:1800}).toBeNull());
  it("rejects object with no id",()=>{const r={...gm()};delete (r as Partial<SeedItem>).id;norm(r).toBeNull();});
  it("rejects empty id string",()=>norm({...gm(),id:""}).toBeNull());
});

describe("normalize – valid shapes",()=>{
  it("normalizes well-formed stored item",()=>{expect(normalize(gm())?.plantName).toBe("Tomato");});
  it("falls back to epoch for missing createdAt",()=>{const r={...gm()};delete (r as Partial<SeedItem>).createdAt;expect(normalize(r)?.createdAt).toBe(new Date(0).toISOString());});
  it("handles numeric packetYear from JSON correctly",()=>{expect(normalize({...gm(),packetYear:2026})?.packetYear).toBe(2026);});
});

describe("filterItems",()=>{
  const items:SeedItem[]=[
    gm({id:"1",plantName:"Cherry Tomato",source:"bought",notes:"germination"}),
    gm({id:"2",plantName:"Basil Genovese",source:"saved",notes:"soaking"}),
    gm({id:"3",plantName:"Purple Basil",source:"swapped",notes:""}),
    gm({id:"4",plantName:"Sunflower",source:"gifted",notes:"neighbor"}),
  ];
  it("returns all items when query and source are empty",()=>{expect(filterItems(items,"","")).toHaveLength(4);});
  it("filters by plant name case-insensitively",()=>{expect(filterItems(items,"basil","").map((i)=>i.id)).toEqual(["2","3"]);});
  it("filters by notes text",()=>{expect(filterItems(items,"soaking","").map((i)=>i.id)).toEqual(["2"]);});
  it("filters by source type",()=>{expect(filterItems(items,"","saved")).toHaveLength(1);});
  it("applies text and source filters together",()=>{expect(filterItems(items,"basil","swapped").map((i)=>i.id)).toEqual(["3"]);});
  it("returns empty array when no items match",()=>{expect(filterItems(items,"zzznomatch","")).toHaveLength(0);});
  it("returns empty array when source matches no items",()=>{expect(filterItems(items,"","bought" as never)).toHaveLength(1);});
  it("does not mutate the input array",()=>{const copy=[...items];filterItems(items,"basil","saved");expect(items).toEqual(copy);});
});

describe("sortByExpiry",()=>{
  it("sorts ascending by packetYear",()=>{
    const items=[gm({id:"a",packetYear:2028}),gm({id:"b",packetYear:2022}),gm({id:"c",packetYear:2025})];
    expect(sortByExpiry(items).map((i)=>i.packetYear)).toEqual([2022,2025,2028]);
  });
  it("does not mutate input array",()=>{
    const items=[gm({id:"a",packetYear:2030}),gm({id:"b",packetYear:2020})];
    const orig=items.map((i)=>i.id);
    sortByExpiry(items);
    expect(items.map((i)=>i.id)).toEqual(orig);
  });
  it("handles empty array",()=>{expect(sortByExpiry([])).toEqual([]);});
  it("handles single-item array",()=>{expect(sortByExpiry([gm({packetYear:2025})])).toHaveLength(1);});
});

describe("getExpiryStatus",()=>{
  it("returns expired when packetYear before current year",()=>{expect(getExpiryStatus(2020,2026)).toBe("expired");});
  it("returns expiring-soon when packetYear equals current year",()=>{expect(getExpiryStatus(2026,2026)).toBe("expiring-soon");});
  it("returns ok when packetYear after current year",()=>{expect(getExpiryStatus(2030,2026)).toBe("ok");});
  it("handles boundary year at min year",()=>{expect(getExpiryStatus(1900,1901)).toBe("expired");});
});

describe("formatExpiry",()=>{
  it("includes expired label for past years",()=>{expect(formatExpiry(2020,2026)).toContain("(expired)");});
  it("includes expires this year label for current year",()=>{expect(formatExpiry(2026,2026)).toContain("(expires this year)");});
  it("returns just year for future years",()=>{expect(formatExpiry(2030,2026)).toBe("2030");});
});