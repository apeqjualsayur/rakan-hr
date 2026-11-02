import { describe, expect, it } from "vitest";
import { formatMyKad, mykadDigits, parseMyKad } from "./mykad";

// All IC numbers here are made up.
const TODAY = "2026-11-02";

function parsed(input: string, today = TODAY) {
  const result = parseMyKad(input, today);
  if (!result.ok)
    throw new Error(`expected ${input} to parse: ${result.problem}`);
  return result.value;
}

describe("parseMyKad", () => {
  it("derives date of birth and gender for someone born in the 1980s", () => {
    expect(parsed("880512-10-5431")).toMatchObject({
      digits: "880512105431",
      formatted: "880512-10-5431",
      dateOfBirth: "1988-05-12",
      gender: "male",
      placeOfBirthCode: "10",
    });
  });

  it("reads people born in 2000 and later as 20YY", () => {
    expect(parsed("000101-14-1234").dateOfBirth).toBe("2000-01-01");
    expect(parsed("010203145678").dateOfBirth).toBe("2001-02-03");
    expect(parsed("051231-08-0012").dateOfBirth).toBe("2005-12-31");
    expect(parsed("080704-01-2223").dateOfBirth).toBe("2008-07-04");
  });

  it("reads a 20YY date that is still in the future as 19YY", () => {
    expect(parsed("261103-14-1111").dateOfBirth).toBe("1926-11-03");
    expect(parsed("991231-14-1111").dateOfBirth).toBe("1999-12-31");
    expect(parsed("300615-14-1111").dateOfBirth).toBe("1930-06-15");
  });

  it("treats a birthday of today as already happened", () => {
    expect(parsed("261102-14-1111").dateOfBirth).toBe("2026-11-02");
  });

  it("odd last digit is male, even is female", () => {
    expect(parsed("900101-14-5431").gender).toBe("male");
    expect(parsed("900101-14-5432").gender).toBe("female");
    expect(parsed("010203-14-5670").gender).toBe("female");
  });

  it("accepts spaces and missing dashes", () => {
    expect(parsed(" 900101 14 5432 ").digits).toBe("900101145432");
  });

  it("knows 29 February only exists in leap years (2000 was one)", () => {
    expect(parsed("000229-14-1234").dateOfBirth).toBe("2000-02-29");
    expect(parsed("960229-14-1234").dateOfBirth).toBe("1996-02-29");
    expect(parseMyKad("010229-14-1234", TODAY)).toEqual({
      ok: false,
      problem: "date",
    });
    expect(parseMyKad("990229-14-1234", TODAY)).toEqual({
      ok: false,
      problem: "date",
    });
  });

  it("rejects the wrong number of digits or letters", () => {
    for (const input of [
      "",
      "88051210543",
      "8805121054311",
      "88051A-10-5431",
    ]) {
      expect(parseMyKad(input, TODAY)).toEqual({
        ok: false,
        problem: "format",
      });
    }
  });

  it("rejects impossible dates", () => {
    for (const input of [
      "881312-10-5431",
      "880500-10-5431",
      "880431-10-5431",
    ]) {
      expect(parseMyKad(input, TODAY)).toEqual({ ok: false, problem: "date" });
    }
  });

  it("rejects place-of-birth codes that are never issued", () => {
    for (const code of ["00", "17", "20", "69", "70", "73", "80", "81", "96"]) {
      expect(parseMyKad(`880512-${code}-5431`, TODAY)).toEqual({
        ok: false,
        problem: "placeOfBirth",
      });
    }
    for (const code of ["01", "16", "21", "59", "60", "71", "82", "98", "99"]) {
      expect(parseMyKad(`880512-${code}-5431`, TODAY).ok).toBe(true);
    }
  });
});

describe("helpers", () => {
  it("strips separators and formats with dashes", () => {
    expect(mykadDigits("880512-10 5431")).toBe("880512105431");
    expect(formatMyKad("880512105431")).toBe("880512-10-5431");
  });
});
