import { describe, it, expect } from "vitest";
import { sanitize, sanitizeObject, sanitizeEmail, sanitizePhone } from "./sanitize";

describe("sanitize", () => {
  it("strips script tags entirely, including their content", () => {
    expect(sanitize("Hello<script>alert(1)</script>World")).toBe("HelloWorld");
  });

  it("strips an unknown/unwhitelisted tag but keeps its text content", () => {
    expect(sanitize("<b>Bold</b> text")).toBe("Bold text");
  });

  it("strips an img tag with an onerror payload entirely", () => {
    expect(sanitize('<img src=x onerror=alert(1)>Normal text')).toBe("Normal text");
  });

  it("passes through plain text unchanged (aside from trimming)", () => {
    expect(sanitize("  Plain contractor description  ")).toBe("Plain contractor description");
  });

  it("returns an empty string for empty/non-string input", () => {
    expect(sanitize("")).toBe("");
    expect(sanitize(null as unknown as string)).toBe("");
    expect(sanitize(undefined as unknown as string)).toBe("");
  });

  it("documents current (surprising, security-relevant) behavior: content between a bare '<' and '>' is deleted outright, not just escaped - this is the exact mechanism that broke password hashing before that bug was fixed (sanitize() was removed from the password path)", () => {
    // '<123>' is treated as an unrecognized tag and stripped completely,
    // not turned into the literal text "<123>" or the escaped "&lt;123&gt;".
    expect(sanitize("MyPassword<123>&'stuff\"")).toBe("MyPassword&'stuff\"");
  });
});

describe("sanitizeObject", () => {
  it("sanitizes every string value in a flat object", () => {
    const result = sanitizeObject({ name: "<script>alert(1)</script>Bob", age: 30 });
    expect(result).toEqual({ name: "Bob", age: 30 });
  });

  it("recurses into nested objects", () => {
    const result = sanitizeObject({
      user: { bio: "<img src=x onerror=alert(1)>Hi" },
    });
    expect(result).toEqual({ user: { bio: "Hi" } });
  });

  it("documents current (real gap) behavior: a plain array of raw strings is NOT sanitized - only string VALUES OF OBJECT PROPERTIES are", () => {
    // sanitizeObject's first line is `if (obj === null || typeof obj !==
    // 'object') return obj` - a bare string element inside an array hits
    // that check before the array-mapping branch gets a chance to sanitize
    // it, since typeof "some string" is 'string', not 'object'. Only the
    // `Object.entries` loop (for object property values) has an explicit
    // `typeof value === 'string' -> sanitize(value)` branch. Any route that
    // relies on sanitizeObject to clean a top-level array of raw strings
    // (as opposed to an array of objects with string properties) would be
    // silently unprotected - worth knowing before assuming this function
    // covers every string-bearing shape.
    const result = sanitizeObject(["<b>a</b>", "<i>b</i>"]);
    expect(result).toEqual(["<b>a</b>", "<i>b</i>"]);

    // ...but an array of OBJECTS with string properties is sanitized correctly,
    // since each object element goes through the Object.entries path.
    const objectArrayResult = sanitizeObject([{ note: "<b>a</b>" }, { note: "<i>b</i>" }]);
    expect(objectArrayResult).toEqual([{ note: "a" }, { note: "b" }]);
  });

  it("leaves non-string values (numbers, booleans, null) untouched", () => {
    const result = sanitizeObject({ count: 5, active: true, note: null });
    expect(result).toEqual({ count: 5, active: true, note: null });
  });

  it("returns primitives and null unchanged when passed directly (not wrapped in an object)", () => {
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject(42)).toBe(42);
    expect(sanitizeObject("<script>x</script>raw string")).toBe("<script>x</script>raw string");
  });
});

describe("sanitizeEmail", () => {
  it("trims and lowercases", () => {
    expect(sanitizeEmail("  John.Doe@Example.COM  ")).toBe("john.doe@example.com");
  });

  it("returns an empty string for empty/non-string input", () => {
    expect(sanitizeEmail("")).toBe("");
    expect(sanitizeEmail(null as unknown as string)).toBe("");
  });
});

describe("sanitizePhone", () => {
  it("keeps digits, spaces, plus, and hyphen; strips everything else including letters", () => {
    expect(sanitizePhone("+65 1234-5678")).toBe("+65 1234-5678");
    expect(sanitizePhone("+65 (1234) 5678 ext.9")).toBe("+65 1234 5678 9");
  });

  it("returns an empty string for empty/non-string input", () => {
    expect(sanitizePhone("")).toBe("");
    expect(sanitizePhone(null as unknown as string)).toBe("");
  });
});
