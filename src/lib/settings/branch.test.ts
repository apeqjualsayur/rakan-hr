import { describe, expect, it } from "vitest";
import { parseOperatingHours } from "../../../scripts/lib/company-config.mjs";
import {
  normaliseHours,
  parseBranchForm,
  parseCoordinates,
  summariseHours,
} from "./branch";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

describe("parseCoordinates", () => {
  it("reads coordinates copied from Google Maps", () => {
    expect(parseCoordinates("3.139003, 101.686855")).toEqual({
      lat: 3.139003,
      lng: 101.686855,
    });
    expect(parseCoordinates(" 3.1390031234 101.6868 ")).toEqual({
      lat: 3.139003,
      lng: 101.6868,
    });
  });

  it("rejects text that is not a coordinate pair", () => {
    expect(parseCoordinates("Jalan Ampang")).toBeNull();
    expect(parseCoordinates("95, 101")).toBeNull();
    expect(parseCoordinates("3.1")).toBeNull();
  });
});

describe("operating hours", () => {
  it("accepts what the seed writes from company-config.yaml", () => {
    const seeded = parseOperatingHours("Mon-Fri 08:30-17:30, Sat 08:30-13:00");
    expect(normaliseHours(seeded)).toEqual(seeded);
  });

  it("rejects closing before opening, bad times and unknown days", () => {
    expect(
      normaliseHours({ mon: [{ open: "17:00", close: "09:00" }] }),
    ).toBeNull();
    expect(normaliseHours({ monday: [] })).toBeNull();
    expect(
      normaliseHours({ mon: [{ open: "8:30", close: "17:00" }] }),
    ).toBeNull();
  });

  it("summarises days with the same hours", () => {
    const hours = parseOperatingHours("Mon-Fri 08:30-17:30, Sat 08:30-13:00");
    const day = (d: string) => d[0]!.toUpperCase() + d.slice(1);
    expect(summariseHours(hours, day, (t) => t)).toBe(
      "Mon–Fri 08:30–17:30 · Sat 08:30–13:00",
    );
    expect(summariseHours({}, day, (t) => t)).toBe("");
  });
});

describe("parseBranchForm", () => {
  const base = {
    name: "Main centre",
    state_code: "MY-10",
    operating_hours: JSON.stringify({
      mon: [{ open: "08:30", close: "17:30" }],
    }),
  };

  it("saves a geofence, rounding to 6 decimals", () => {
    const result = parseBranchForm(
      form({
        ...base,
        geo_lat: "3.13900312",
        geo_lng: "101.6868551",
        geo_radius_m: "150",
      }),
    );
    expect(result).toEqual({
      ok: true,
      values: expect.objectContaining({
        geo_lat: 3.139003,
        geo_lng: 101.686855,
        geo_radius_m: 150,
      }),
    });
  });

  it("uses the 100 m default radius when only the pin is set", () => {
    const result = parseBranchForm(
      form({ ...base, geo_lat: "3.1", geo_lng: "101.6" }),
    );
    expect(result.ok && result.values.geo_radius_m).toBe(100);
  });

  it("requires a name, both coordinates and a sensible radius", () => {
    expect(parseBranchForm(form({ ...base, name: " " }))).toEqual({
      ok: false,
      errors: { name: "required" },
    });
    expect(parseBranchForm(form({ ...base, geo_lat: "3.1" }))).toEqual({
      ok: false,
      errors: { geo_lat: "coordinatesPair" },
    });
    expect(
      parseBranchForm(
        form({ ...base, geo_lat: "3.1", geo_lng: "101.6", geo_radius_m: "5" }),
      ),
    ).toEqual({ ok: false, errors: { geo_radius_m: "invalidRadius" } });
    expect(parseBranchForm(form({ ...base, operating_hours: "nope" }))).toEqual(
      {
        ok: false,
        errors: { operating_hours: "invalidHours" },
      },
    );
  });
});
