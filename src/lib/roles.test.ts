import { describe, it, expect } from "vitest";
import { ROLE_IDS, isSuperUser, isSuperViewer } from "./roles";

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

describe("isSuperUser", () => {
  it("Admin and Developer pass, everyone else doesn't", () => {
    expect(isSuperUser(ROLE_IDS.ADMIN)).toBe(true);
    expect(isSuperUser(ROLE_IDS.DEVELOPER)).toBe(true);
    expect(isSuperUser(ROLE_IDS.EXECUTIVE_DIRECTOR)).toBe(false);
    expect(isSuperUser(ROLE_IDS.CONTRACTOR)).toBe(false);
    expect(isSuperUser(undefined)).toBe(false);
    expect(isSuperUser([ROLE_IDS.CONTRACTOR, ROLE_IDS.DEVELOPER])).toBe(true);
  });
});

describe("isSuperViewer", () => {
  it("Admin, Developer, and Executive Director pass; others don't", () => {
    expect(isSuperViewer(ROLE_IDS.ADMIN)).toBe(true);
    expect(isSuperViewer(ROLE_IDS.DEVELOPER)).toBe(true);
    expect(isSuperViewer(ROLE_IDS.EXECUTIVE_DIRECTOR)).toBe(true);
    expect(isSuperViewer(ROLE_IDS.CONTRACTOR)).toBe(false);
    expect(isSuperViewer(undefined)).toBe(false);
  });
});
