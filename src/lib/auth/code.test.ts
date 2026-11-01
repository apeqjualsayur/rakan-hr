import { describe, expect, it } from "vitest";
import { sanitizeCode } from "./code";

describe("sanitizeCode", () => {
  it("keeps digits only, so pasted codes with spaces or dashes work", () => {
    expect(sanitizeCode("123 456")).toBe("123456");
    expect(sanitizeCode("123-456")).toBe("123456");
    expect(sanitizeCode(" 12a3")).toBe("123");
  });
  it("caps at 6 digits", () => {
    expect(sanitizeCode("12345678")).toBe("123456");
  });
});
