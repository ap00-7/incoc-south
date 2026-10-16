import { describe, expect, it } from "vitest";
import { parseDurationMinutes } from "./validation";

describe("parseDurationMinutes", () => {
  it("accepts empty values and whole non-negative minutes", () => {
    expect(parseDurationMinutes("")).toBeNull();
    expect(parseDurationMinutes("0")).toBe(0);
    expect(parseDurationMinutes("90")).toBe(90);
  });

  it("rejects negative, fractional, padded, and out-of-range input", () => {
    for (const value of ["-1", "1.5", " 5 ", "1441", "999999999999999999999"]) {
      expect(() => parseDurationMinutes(value)).toThrow();
    }
  });
});
