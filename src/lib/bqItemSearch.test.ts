import { describe, it, expect } from "vitest";
import { tokenize, scoreMatch } from "./bqItemSearch";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumeric characters", () => {
    expect(tokenize("Ceramic Tile, Flooring (20mm)")).toEqual([
      "ceramic",
      "tile",
      "flooring",
      "20mm",
    ]);
  });

  it("drops stopwords and single-character tokens", () => {
    expect(tokenize("supply and install a tile")).toEqual(["supply", "install", "tile"]);
  });

  it("returns an empty array for an empty or punctuation-only string", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("!!!")).toEqual([]);
  });
});

describe("scoreMatch", () => {
  it("scores a full word-overlap match higher than a partial one", () => {
    const full = scoreMatch("ceramic tile", { description: "Ceramic tile flooring", usageCount: 0 });
    const partial = scoreMatch("ceramic tile", { description: "Ceramic wall panel", usageCount: 0 });
    expect(full).toBeGreaterThan(partial);
  });

  it("returns 0 for a query with no matching words", () => {
    expect(scoreMatch("plumbing pipes", { description: "Ceramic tile flooring", usageCount: 5 })).toBe(0);
  });

  it("returns 0 for an empty query", () => {
    expect(scoreMatch("", { description: "Ceramic tile flooring", usageCount: 5 })).toBe(0);
  });

  it("matches via substring in either direction (e.g. 'tile' vs 'tiles')", () => {
    expect(scoreMatch("tile work", { description: "Supply and install ceramic tiles", usageCount: 0 })).toBeGreaterThan(0);
  });

  it("boosts a more-used item over an equally-relevant less-used one", () => {
    const popular = scoreMatch("ceramic tile", { description: "Ceramic tile flooring", usageCount: 20 });
    const rare = scoreMatch("ceramic tile", { description: "Ceramic tile flooring", usageCount: 1 });
    expect(popular).toBeGreaterThan(rare);
  });

  it("never lets popularity alone create a match when there's no word overlap", () => {
    expect(scoreMatch("plumbing", { description: "Ceramic tile flooring", usageCount: 1000 })).toBe(0);
  });
});
