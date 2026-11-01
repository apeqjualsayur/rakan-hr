import { describe, expect, it } from "vitest";
import {
  dateFromIso,
  dateTileParts,
  formatClock,
  formatDate,
  formatMoney,
  formatTime,
  greetingPeriod,
  initials,
  malaysiaToday,
  maskNumber,
} from "./format";

// 30 Oct 2026, 9:00 am in Kuala Lumpur (UTC+8).
const friday = new Date("2026-10-30T01:00:00Z");

describe("formatDate (ui-system.md §5)", () => {
  it("formats English dates day-first", () => {
    expect(formatDate(friday, "en", "short")).toBe("30 Oct");
    expect(formatDate(friday, "en", "weekdayShort")).toBe("Fri 30 Oct");
    expect(formatDate(friday, "en", "long")).toBe("Friday, 30 October 2026");
    expect(formatDate(friday, "en", "longNoYear")).toBe("Friday, 30 October");
    expect(formatDate(friday, "en", "full")).toBe("30 Oct 2026");
  });

  it("formats Bahasa Malaysia dates", () => {
    expect(formatDate(friday, "ms", "short")).toBe("30 Okt");
    expect(formatDate(friday, "ms", "longNoYear")).toBe("Jumaat, 30 Oktober");
  });

  it("uses Malaysia time, not the device time zone", () => {
    // 11 pm UTC on 29 Oct is already 30 Oct in Kuala Lumpur.
    expect(formatDate(new Date("2026-10-29T23:00:00Z"), "en", "short")).toBe(
      "30 Oct",
    );
  });

  it("splits date tiles into month caps and day", () => {
    expect(dateTileParts(new Date("2026-11-07T01:00:00Z"), "en")).toEqual({
      month: "NOV",
      day: "7",
    });
  });
});

describe("formatTime", () => {
  it("shows 12-hour times with lowercase am/pm in English", () => {
    expect(formatTime(new Date("2026-10-30T00:30:00Z"), "en")).toBe("8:30 am");
    expect(formatTime(new Date("2026-10-30T09:30:00Z"), "en")).toBe("5:30 pm");
  });
});

describe("formatMoney", () => {
  it("puts a space after RM and always shows 2 decimals", () => {
    expect(formatMoney(3354.65)).toBe("RM 3,354.65");
    expect(formatMoney("86.4")).toBe("RM 86.40");
    expect(formatMoney(1200000)).toBe("RM 1,200,000.00");
  });

  it("shows negatives with a minus sign before RM", () => {
    expect(formatMoney(-12.5)).toBe("−RM 12.50");
  });
});

describe("maskNumber / initials / greetingPeriod", () => {
  it("keeps only the last 4 digits", () => {
    expect(maskNumber("5141 2345 4821")).toBe("••4821");
    expect(maskNumber("900101-14-5678")).toBe("••5678");
  });

  it("builds two-letter initials", () => {
    expect(initials("Farah Hanis")).toBe("FH");
    expect(initials("Amir")).toBe("A");
    expect(initials("Nurul Aina binti Ahmad")).toBe("NA");
  });

  it("picks the greeting by Malaysia time", () => {
    expect(greetingPeriod(new Date("2026-10-30T01:00:00Z"))).toBe("morning");
    expect(greetingPeriod(new Date("2026-10-30T06:00:00Z"))).toBe("afternoon");
    expect(greetingPeriod(new Date("2026-10-30T11:00:00Z"))).toBe("evening");
  });
});

describe("Malaysian dates and clock times", () => {
  it("gives today's date in Malaysia, not UTC", () => {
    // 11:30 pm UTC on 1 Dec is already 2 Dec in Kuala Lumpur.
    expect(malaysiaToday(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02");
    expect(malaysiaToday(new Date("2026-12-01T10:00:00Z"))).toBe("2026-12-01");
  });

  it("formats Postgres dates on the right day", () => {
    expect(formatDate(dateFromIso("2026-12-08"), "en", "full")).toBe(
      "8 Dec 2026",
    );
  });

  it("formats stored opening times", () => {
    expect(formatClock("08:30", "en")).toBe("8:30 am");
    expect(formatClock("17:30", "en")).toBe("5:30 pm");
  });
});
