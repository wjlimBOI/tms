import { describe, it, expect } from "vitest";
import { ROLE_IDS } from "./roles";

describe("ROLE_IDS", () => {
  // Regression guard: role_id 13 is "Legal Team", not Contractor. Every
  // contractor-only check in the app used to compare against 13 by mistake
  // (see docs/rbac.md). Contractor is 22.
  it("CONTRACTOR is 22, not 13", () => {
    expect(ROLE_IDS.CONTRACTOR).toBe(22);
    expect(ROLE_IDS.LEGAL_TEAM).toBe(13);
    expect(ROLE_IDS.CONTRACTOR).not.toBe(ROLE_IDS.LEGAL_TEAM);
  });

  it("has no duplicate role IDs", () => {
    const values = Object.values(ROLE_IDS);
    expect(new Set(values).size).toBe(values.length);
  });
});
