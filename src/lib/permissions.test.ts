import { describe, it, expect, vi, beforeEach } from "vitest";

const poolQueryMock = vi.fn();

vi.mock("@/lib/db", () => ({
  default: { query: (...args: unknown[]) => poolQueryMock(...args) },
}));

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

beforeEach(() => {
  poolQueryMock.mockReset();
});

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

// These cover only the paths that short-circuit before hitting the DB.
// canViewTenderWithParticipation's DB-dependent branches are covered
// separately below, against a mocked pool.
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

// canViewTenderWithParticipation is the security-critical gate behind both
// the tender detail page and the BQ template endpoint
// (src/app/api/tenders/[id]/bq-template/route.ts): a contractor can view any
// tender except a closed one they never actually participated in.
describe("canViewTenderWithParticipation (DB-dependent branches, mocked pool)", () => {
  it("returns false when the tender doesn't exist", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(
      canViewTenderWithParticipation(1, 999, ROLE_IDS.CONTRACTOR)
    ).resolves.toBe(false);
  });

  it("allows a contractor to view an Open tender", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ status_code: "Open" }] });
    await expect(
      canViewTenderWithParticipation(1, 999, ROLE_IDS.CONTRACTOR)
    ).resolves.toBe(true);
    expect(poolQueryMock).toHaveBeenCalledTimes(1); // no participation lookup needed
  });

  it("allows a contractor to view an Upcoming tender (only 'closed' is gated)", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ status_code: "Upcoming" }] });
    await expect(
      canViewTenderWithParticipation(1, 999, ROLE_IDS.CONTRACTOR)
    ).resolves.toBe(true);
  });

  it("blocks a contractor from a closed tender they never submitted to", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ status_code: "closed" }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      canViewTenderWithParticipation(1, 999, ROLE_IDS.CONTRACTOR)
    ).resolves.toBe(false);
  });

  it("allows a contractor to view a closed tender they did submit to", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ status_code: "closed" }] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(
      canViewTenderWithParticipation(1, 999, ROLE_IDS.CONTRACTOR)
    ).resolves.toBe(true);
  });
});
