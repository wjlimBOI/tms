import { describe, it, expect } from "vitest";
import {
  hasRole,
  canEditSubmission,
  canViewTender,
  canEditTender,
  canDeleteTender,
  canViewTenderWithParticipation,
  canViewDraftTender,
} from "./permissions";
import { ROLE_IDS } from "./roles";

describe("hasRole", () => {
  it("matches a role in an array", () => {
    expect(hasRole([ROLE_IDS.ADMIN, ROLE_IDS.CONTRACTOR], ROLE_IDS.CONTRACTOR)).toBe(true);
  });

  it("matches a single numeric role", () => {
    expect(hasRole(ROLE_IDS.ADMIN, ROLE_IDS.ADMIN)).toBe(true);
  });

  it("does not match an absent role", () => {
    expect(hasRole([ROLE_IDS.ADMIN], ROLE_IDS.CONTRACTOR)).toBe(false);
  });

  it("treats undefined as no roles", () => {
    expect(hasRole(undefined, ROLE_IDS.ADMIN)).toBe(false);
  });
});

// These cover only the paths that short-circuit before hitting the DB —
// the DB-dependent branches need integration coverage against a real pool.
describe("permission short-circuits (no DB access required)", () => {
  it("canEditSubmission: admin can always edit", async () => {
    await expect(canEditSubmission(1, 999, ROLE_IDS.ADMIN)).resolves.toBe(true);
  });

  it("canEditSubmission: non-contractor, non-admin is denied", async () => {
    await expect(canEditSubmission(1, 999, ROLE_IDS.FINANCE_TEAM)).resolves.toBe(false);
  });

  it("canViewTender: admin can always view", async () => {
    await expect(canViewTender(1, 999, ROLE_IDS.ADMIN)).resolves.toBe(true);
  });

  it("canEditTender: admin can always edit", async () => {
    await expect(canEditTender(1, 999, ROLE_IDS.ADMIN)).resolves.toBe(true);
  });

  it("canEditTender: non-contractor, non-admin is denied", async () => {
    await expect(canEditTender(1, 999, ROLE_IDS.FINANCE_TEAM)).resolves.toBe(false);
  });

  it("canDeleteTender: only admin can delete", async () => {
    await expect(canDeleteTender(1, 999, ROLE_IDS.ADMIN)).resolves.toBe(true);
    await expect(canDeleteTender(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
  });

  it("canViewTenderWithParticipation: non-contractors can always view", async () => {
    await expect(canViewTenderWithParticipation(1, 999, ROLE_IDS.FINANCE_TEAM)).resolves.toBe(true);
  });

  it("canViewDraftTender: admin only by default", async () => {
    await expect(canViewDraftTender(ROLE_IDS.ADMIN)).resolves.toBe(true);
    await expect(canViewDraftTender(ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
  });
});
