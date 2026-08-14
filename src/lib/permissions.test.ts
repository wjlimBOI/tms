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
  canAccessTenderMessages,
  canAccessTenderDocuments,
  canViewBranches,
  canManageBranches,
  canManageProjectManagers,
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

  it("canEditSubmission: developer can always edit, executive director cannot", async () => {
    await expect(canEditSubmission(1, 999, ROLE_IDS.DEVELOPER)).resolves.toBe(true);
    await expect(canEditSubmission(1, 999, ROLE_IDS.EXECUTIVE_DIRECTOR)).resolves.toBe(false);
  });

  it("canEditSubmission: non-contractor, non-admin is denied", async () => {
    await expect(canEditSubmission(1, 999, ROLE_IDS.FINANCE_TEAM)).resolves.toBe(false);
  });
});

describe("canEditSubmission (contractor branch, mocked pool)", () => {
  it("owner can edit their own latest Draft while the tender is Open", async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ tender_id: 1, status: "Draft", round_no: 1, contractor_id: 999, status_code: "Open", max_round: 1 }],
    });
    await expect(canEditSubmission(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(true);
    expect(poolQueryMock).toHaveBeenCalledTimes(1); // Open — no need to check for a resubmission grant
  });

  it("owner cannot edit or submit a Draft once the tender has closed, with no resubmission grant", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ tender_id: 1, status: "Draft", round_no: 1, contractor_id: 999, status_code: "closed", max_round: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(canEditSubmission(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
  });

  it("owner cannot edit once the tender is awarded either, with no resubmission grant", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ tender_id: 1, status: "Draft", round_no: 1, contractor_id: 999, status_code: "awarded", max_round: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(canEditSubmission(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
  });

  it("owner CAN edit a closed tender's Draft when a matching resubmission_request grants exactly this round", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ tender_id: 1, status: "Draft", round_no: 2, contractor_id: 999, status_code: "closed", max_round: 2 }] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(canEditSubmission(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(true);
  });
});

describe("permission short-circuits (no DB access required), continued", () => {
  it("canViewTender: admin, developer, and executive director can always view", async () => {
    await expect(canViewTender(1, 999, ROLE_IDS.ADMIN)).resolves.toBe(true);
    await expect(canViewTender(1, 999, ROLE_IDS.DEVELOPER)).resolves.toBe(true);
    await expect(canViewTender(1, 999, ROLE_IDS.EXECUTIVE_DIRECTOR)).resolves.toBe(true);
  });

  it("canEditTender: admin and developer can always edit, executive director cannot", async () => {
    await expect(canEditTender(1, 999, ROLE_IDS.ADMIN)).resolves.toBe(true);
    await expect(canEditTender(1, 999, ROLE_IDS.DEVELOPER)).resolves.toBe(true);
    await expect(canEditTender(1, 999, ROLE_IDS.EXECUTIVE_DIRECTOR)).resolves.toBe(false);
  });

  it("canEditTender: non-contractor, non-admin is denied", async () => {
    await expect(canEditTender(1, 999, ROLE_IDS.FINANCE_TEAM)).resolves.toBe(false);
  });

  it("canDeleteTender: admin and developer only", async () => {
    await expect(canDeleteTender(1, 999, ROLE_IDS.ADMIN)).resolves.toBe(true);
    await expect(canDeleteTender(1, 999, ROLE_IDS.DEVELOPER)).resolves.toBe(true);
    await expect(canDeleteTender(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
    await expect(canDeleteTender(1, 999, ROLE_IDS.EXECUTIVE_DIRECTOR)).resolves.toBe(false);
  });

  it("canViewTenderWithParticipation: non-contractors can always view", async () => {
    await expect(canViewTenderWithParticipation(1, 999, ROLE_IDS.FINANCE_TEAM)).resolves.toBe(true);
  });

  it("canViewDraftTender: admin and developer always pass without a DB lookup, executive director also passes", async () => {
    await expect(canViewDraftTender(999, ROLE_IDS.ADMIN)).resolves.toBe(true);
    await expect(canViewDraftTender(999, ROLE_IDS.DEVELOPER)).resolves.toBe(true);
    await expect(canViewDraftTender(999, ROLE_IDS.EXECUTIVE_DIRECTOR)).resolves.toBe(true);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });
});

describe("canAccessTenderMessages (short-circuits)", () => {
  it("admin and developer get full staff access without a DB lookup", async () => {
    await expect(canAccessTenderMessages(1, 999, "a@x.com", ROLE_IDS.ADMIN)).resolves.toEqual({ allowed: true, isStaff: true });
    await expect(canAccessTenderMessages(1, 999, "a@x.com", ROLE_IDS.DEVELOPER)).resolves.toEqual({ allowed: true, isStaff: true });
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("executive director can view (allowed) but not post (isStaff: false), without a DB lookup", async () => {
    await expect(canAccessTenderMessages(1, 999, "a@x.com", ROLE_IDS.EXECUTIVE_DIRECTOR)).resolves.toEqual({ allowed: true, isStaff: false });
    expect(poolQueryMock).not.toHaveBeenCalled();
  });
});

describe("canAccessTenderMessages (contractor branch, mocked pool)", () => {
  it("once awarded, the winning contractor keeps chat access", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ created_by: 1, project_manager_email: null }] })
      .mockResolvedValueOnce({ rows: [{ winning_contractor_id: 999 }] });
    await expect(
      canAccessTenderMessages(1, 999, "c@x.com", ROLE_IDS.CONTRACTOR, 999)
    ).resolves.toEqual({ allowed: true, isStaff: false });
  });

  it("once awarded, a non-winning contractor loses chat access even if they participated", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ created_by: 1, project_manager_email: null }] })
      .mockResolvedValueOnce({ rows: [{ winning_contractor_id: 111 }] });
    await expect(
      canAccessTenderMessages(1, 999, "c@x.com", ROLE_IDS.CONTRACTOR, 999)
    ).resolves.toEqual({ allowed: false, isStaff: false });
  });

  it("before any award, a participating contractor can still chat", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ created_by: 1, project_manager_email: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(
      canAccessTenderMessages(1, 999, "c@x.com", ROLE_IDS.CONTRACTOR, 999)
    ).resolves.toEqual({ allowed: true, isStaff: false });
  });
});

describe("canAccessTenderDocuments", () => {
  it("staff (non-contractor) always pass without a DB lookup", async () => {
    await expect(canAccessTenderDocuments(1, 999, ROLE_IDS.FINANCE_TEAM)).resolves.toBe(true);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("a participating contractor can access documents while the tender is Open", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ status_code: "Open" }] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(canAccessTenderDocuments(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(true);
  });

  it("even a past participant (including the eventual winner) loses document access once the tender is closed", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ status_code: "closed" }] });
    await expect(canAccessTenderDocuments(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
    expect(poolQueryMock).toHaveBeenCalledTimes(1); // no participation lookup needed — status alone decides it
  });

  it("loses document access once the tender is awarded too, no exception for the winner", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ status_code: "awarded" }] });
    await expect(canAccessTenderDocuments(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
  });

  it("a non-participating contractor is denied even while the tender is Open", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ status_code: "Open" }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(canAccessTenderDocuments(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
  });

  it("returns false when the tender doesn't exist", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(canAccessTenderDocuments(1, 999, ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
  });
});

describe("branch/project-manager reference-data management", () => {
  it("canViewBranches: admin, developer, and executive director pass without a DB lookup", async () => {
    await expect(canViewBranches(999, ROLE_IDS.ADMIN)).resolves.toBe(true);
    await expect(canViewBranches(999, ROLE_IDS.DEVELOPER)).resolves.toBe(true);
    await expect(canViewBranches(999, ROLE_IDS.EXECUTIVE_DIRECTOR)).resolves.toBe(true);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });

  it("canManageBranches: admin and developer pass without a DB lookup; executive director needs the permission matrix", async () => {
    await expect(canManageBranches(999, ROLE_IDS.ADMIN)).resolves.toBe(true);
    await expect(canManageBranches(999, ROLE_IDS.DEVELOPER)).resolves.toBe(true);
    poolQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(canManageBranches(999, ROLE_IDS.EXECUTIVE_DIRECTOR)).resolves.toBe(false);
  });

  it("canManageProjectManagers: admin and developer pass without a DB lookup", async () => {
    await expect(canManageProjectManagers(999, ROLE_IDS.ADMIN)).resolves.toBe(true);
    await expect(canManageProjectManagers(999, ROLE_IDS.DEVELOPER)).resolves.toBe(true);
    expect(poolQueryMock).not.toHaveBeenCalled();
  });
});

describe("canViewDraftTender (permission-matrix branch, mocked pool)", () => {
  it("denies a role with no matching role_permissions row", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [] });
    await expect(canViewDraftTender(999, ROLE_IDS.CONTRACTOR)).resolves.toBe(false);
  });

  it("allows a role granted view_draft_tenders via the permission matrix", async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    await expect(canViewDraftTender(999, ROLE_IDS.FM_REGIONAL_DIRECTOR)).resolves.toBe(true);
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

  it("blocks a contractor from an awarded tender they never participated in", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ status_code: "awarded" }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      canViewTenderWithParticipation(1, 999, ROLE_IDS.CONTRACTOR)
    ).resolves.toBe(false);
  });

  it("allows a contractor to view an awarded tender they expressed interest in (even if they didn't win)", async () => {
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ status_code: "awarded" }] })
      .mockResolvedValueOnce({ rows: [{ exists: 1 }] });
    await expect(
      canViewTenderWithParticipation(1, 999, ROLE_IDS.CONTRACTOR)
    ).resolves.toBe(true);
  });
});
