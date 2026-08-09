import { describe, it, expect } from "vitest";
import { highlightMatches, isCostQuery, getSmartKeywords } from "./search-utils";

describe("highlightMatches", () => {
  it("returns an empty string for empty text", () => {
    expect(highlightMatches("", ["foo"])).toBe("");
  });

  it("HTML-escapes plain text even with no keywords", () => {
    expect(highlightMatches("<b>raw</b>", [])).toBe("&lt;b&gt;raw&lt;/b&gt;");
  });

  it("wraps a matching keyword in a <mark> tag, case-insensitively", () => {
    expect(highlightMatches("Reception Counter", ["counter"])).toBe(
      'Reception <mark class="bg-yellow-300/70 text-gray-900 px-0.5 rounded">Counter</mark>'
    );
  });

  it("this is the regression test for the confirmed stored-XSS fix: a malicious description is fully escaped, never rendered as live HTML, even when it also contains a keyword match", () => {
    // Reproduces the exact payload live-verified against the dev DB earlier
    // this session (src/app/api/bq/items/route.ts's write-side sanitizes
    // this away entirely before storage, but this function is the second,
    // independent layer - the render-side escape - and must hold on its
    // own even if unsanitized text ever reaches it by some other path).
    const payload = "<img src=x onerror=alert(1)>Normal text<script>alert(2)</script>";
    const result = highlightMatches(payload, ["normal"]);
    // The dangerous part is live "<" / ">" reaching the DOM as real markup -
    // those are gone, escaped to entities. The literal word "onerror=" is
    // still present as inert text, which is fine: it's just a string now,
    // not inside a real tag, so it can't execute anything.
    expect(result).not.toContain("<img");
    expect(result).not.toContain("<script>");
    expect(result).toBe(
      '&lt;img src=x onerror=alert(1)&gt;<mark class="bg-yellow-300/70 text-gray-900 px-0.5 rounded">Normal</mark> text&lt;script&gt;alert(2)&lt;/script&gt;'
    );
  });

  it("escapes regex special characters in a keyword instead of treating them as regex syntax", () => {
    // A keyword like "a.b" must only match the literal string "a.b", not
    // "a" followed by any character followed by "b".
    expect(highlightMatches("acb should not match", ["a.b"])).toBe(
      "acb should not match"
    );
    expect(highlightMatches("a.b should match", ["a.b"])).toBe(
      '<mark class="bg-yellow-300/70 text-gray-900 px-0.5 rounded">a.b</mark> should match'
    );
  });

  it("matches a keyword against its own escaped form when the keyword contains an HTML-sensitive character", () => {
    // Both the source text and the keywords go through the same escaping
    // step before the regex is built, specifically so a keyword like
    // "R&D" can still match "R&D" in the (now-escaped-to-&amp;) source text.
    const result = highlightMatches("Cost for R&D work", ["r&d"]);
    expect(result).toContain(
      '<mark class="bg-yellow-300/70 text-gray-900 px-0.5 rounded">R&amp;D</mark>'
    );
  });

  it("highlights every occurrence of every keyword, not just the first", () => {
    const result = highlightMatches("tile floor, tile wall", ["tile"]);
    const markCount = (result.match(/<mark/g) || []).length;
    expect(markCount).toBe(2);
  });
});

describe("isCostQuery", () => {
  it("recognizes common cost-related phrases, case-insensitively", () => {
    expect(isCostQuery("How much is this?")).toBe(true);
    expect(isCostQuery("What's the PRICE")).toBe(true);
    expect(isCostQuery("total cost estimate")).toBe(true);
  });

  it("returns false for a query with no cost-related phrase", () => {
    expect(isCostQuery("screeding for the reception area")).toBe(false);
  });
});

describe("getSmartKeywords", () => {
  it("filters out stop words and short tokens, keeping meaningful terms", () => {
    // loadSynonyms() is never called in this test, so synonymMap/phraseMap
    // stay empty - this documents the deterministic "cold start" behavior
    // (plain stemming + stop-word filtering only, no synonym expansion)
    // rather than depending on the async fetch-then-fallback path.
    const keywords = getSmartKeywords("what is the reception counter and the screeding");
    expect(keywords).not.toContain("what");
    expect(keywords).not.toContain("is");
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("and");
    expect(keywords).toContain("reception");
    expect(keywords).toContain("counter");
    expect(keywords).toContain("screed"); // "screeding" stemmed via the "-ing" suffix rule
  });

  it("also treats cost-related words (price, cost, expensive, ...) as stop words - getSmartKeywords is for finding ITEMS, isCostQuery handles the cost-phrase intent separately", () => {
    const keywords = getSmartKeywords("what is the price of screeding");
    expect(keywords).not.toContain("price");
    expect(keywords).toContain("screed");
  });

  it("deduplicates repeated keywords", () => {
    const keywords = getSmartKeywords("tile tile tile");
    expect(keywords).toEqual(["tile"]);
  });
});
