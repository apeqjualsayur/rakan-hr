import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ms from "../../messages/ms.json";

// CLAUDE.md rule 8: every user-facing string exists in English and Bahasa Malaysia.
function keyPaths(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "object" && value !== null
      ? keyPaths(value, path)
      : [path];
  });
}

describe("message files", () => {
  it("English and Bahasa Malaysia have exactly the same keys", () => {
    expect(keyPaths(ms).sort()).toEqual(keyPaths(en).sort());
  });

  it("has no empty translations", () => {
    for (const messages of [en, ms]) {
      const empty = keyPaths(messages).filter((path) => {
        const value = path
          .split(".")
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown>)[key],
            messages,
          );
        return typeof value !== "string" || value.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });
});
