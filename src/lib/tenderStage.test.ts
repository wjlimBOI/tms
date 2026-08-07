import { describe, it, expect } from "vitest";
import { ROLE_IDS } from "@/lib/roles";
import {
  getStatusCodeForStage,
  isFinalStage,
  isCancelledStage,
  isInitialStage,
  hasAdvancePermission,
  hasRevertPermission,
  awardBlocksRevert,
} from "./tenderStage";

const NON_ADMIN_ROLES = [ROLE_IDS.CONTRACTOR, ROLE_IDS.LEGAL_TEAM, ROLE_IDS.FM_REGIONAL_DIRECTOR];

describe("getStatusCodeForStage", () => {
  it("maps each defined stage to its status_code", () => {
    expect(getStatusCodeForStage(0)).toBe("Upcoming");
    expect(getStatusCodeForStage(1)).toBe("Open");
    expect(getStatusCodeForStage(2)).toBe("closed");
    expect(getStatusCodeForStage(3)).toBe("awarded");
  });

  it("falls back to 'Open' for any unmapped stage", () => {
    expect(getStatusCodeForStage(99)).toBe("Open");
    expect(getStatusCodeForStage(-1)).toBe("Open");
  });
});

describe("stage bound predicates", () => {
  it("isFinalStage is true only at or past Awarded(3)", () => {
    expect(isFinalStage(3)).toBe(true);
    expect(isFinalStage(4)).toBe(true);
    expect(isFinalStage(2)).toBe(false);
  });

  it("isCancelledStage is true only at -1", () => {
    expect(isCancelledStage(-1)).toBe(true);
    expect(isCancelledStage(0)).toBe(false);
  });

  it("isInitialStage is true at or before Upcoming(0)", () => {
    expect(isInitialStage(0)).toBe(true);
    expect(isInitialStage(-1)).toBe(true);
    expect(isInitialStage(1)).toBe(false);
  });
});

describe("hasAdvancePermission (security-critical: who can move a tender forward)", () => {
  it("allows Admin to advance from Upcoming(0) and Open(1)", () => {
    expect(hasAdvancePermission(0, [ROLE_IDS.ADMIN])).toBe(true);
    expect(hasAdvancePermission(1, [ROLE_IDS.ADMIN])).toBe(true);
  });

  it("denies every non-Admin role from advancing stages 0 and 1", () => {
    for (const roleId of NON_ADMIN_ROLES) {
      expect(hasAdvancePermission(0, [roleId])).toBe(false);
      expect(hasAdvancePermission(1, [roleId])).toBe(false);
    }
  });

  it("denies advancing out of Closed(2) for every role, including Admin — Closed -> Awarded is award-endpoint-only", () => {
    expect(hasAdvancePermission(2, [ROLE_IDS.ADMIN])).toBe(false);
    for (const roleId of NON_ADMIN_ROLES) {
      expect(hasAdvancePermission(2, [roleId])).toBe(false);
    }
  });

  it("denies advancing out of Awarded(3), the final stage, for every role", () => {
    expect(hasAdvancePermission(3, [ROLE_IDS.ADMIN])).toBe(false);
  });

  it("denies advancing a cancelled(-1) tender for every role", () => {
    expect(hasAdvancePermission(-1, [ROLE_IDS.ADMIN])).toBe(false);
  });

  it("fails closed when userRoleIds is empty or the stage is unmapped", () => {
    expect(hasAdvancePermission(0, [])).toBe(false);
    expect(hasAdvancePermission(99, [ROLE_IDS.ADMIN])).toBe(false);
  });
});

describe("hasRevertPermission (security-critical: who can move a tender backward)", () => {
  it("allows only Admin", () => {
    expect(hasRevertPermission([ROLE_IDS.ADMIN])).toBe(true);
  });

  it("denies every non-Admin role, even combined with other roles", () => {
    for (const roleId of NON_ADMIN_ROLES) {
      expect(hasRevertPermission([roleId])).toBe(false);
      expect(hasRevertPermission([roleId, ROLE_IDS.FINANCE_GENERAL_MANAGER])).toBe(false);
    }
  });

  it("fails closed on an empty role list", () => {
    expect(hasRevertPermission([])).toBe(false);
  });
});

describe("awardBlocksRevert (F14: stage and tender_award must never disagree)", () => {
  it("blocks reverting out of Awarded(3) when an award record exists", () => {
    expect(awardBlocksRevert(3, true)).toBe(true);
  });

  it("allows reverting out of Awarded(3) when no award record exists (data-repair path)", () => {
    expect(awardBlocksRevert(3, false)).toBe(false);
  });

  it("never blocks reverting from any non-final stage, award record or not", () => {
    expect(awardBlocksRevert(2, true)).toBe(false);
    expect(awardBlocksRevert(1, true)).toBe(false);
    expect(awardBlocksRevert(0, true)).toBe(false);
  });
});
