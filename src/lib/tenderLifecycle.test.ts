import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const sendStageNotificationEmailMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock("@/lib/email", () => ({
  sendStageNotificationEmail: (...args: unknown[]) => sendStageNotificationEmailMock(...args),
}));

import {
  autoOpenScheduledTenders,
  autoCloseExpiredTenders,
  applyScheduledTenderTransitions,
} from "./tenderLifecycle";

beforeEach(() => {
  queryMock.mockReset();
  sendStageNotificationEmailMock.mockReset();
  sendStageNotificationEmailMock.mockResolvedValue(undefined);
});

describe("autoOpenScheduledTenders", () => {
  it("does nothing further if the 'Open' status_id can't be resolved", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await autoOpenScheduledTenders();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("issues no UPDATE-triggered notification when no tender is due to open", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status_id: 2 }] })
      .mockResolvedValueOnce({ rows: [] });
    await autoOpenScheduledTenders();
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(sendStageNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("transitions a due tender to stage 1, Upcoming(0)->Open, using the resolved status_id", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status_id: 42 }] })
      .mockResolvedValueOnce({ rows: [{ tender_id: 7, tender_name: "Test Tender" }] })
      .mockResolvedValueOnce({ rows: [] });

    await autoOpenScheduledTenders();

    const [updateSql, updateParams] = queryMock.mock.calls[1];
    expect(updateSql).toMatch(/SET stage = 1/);
    expect(updateSql).toMatch(/WHERE stage = 0/);
    expect(updateSql).toMatch(/tender_date < NOW\(\)/);
    expect(updateParams).toEqual([42]);
  });

  it("emails recipients and creates an in-app notification with newStage 1 when a tender auto-opens", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status_id: 42 }] })
      .mockResolvedValueOnce({ rows: [{ tender_id: 7, tender_name: "Test Tender" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 3, email: "fmrd@example.com", name: "FM RD" }] })
      .mockResolvedValueOnce({ rows: [] }); // notifyUsers INSERT

    await autoOpenScheduledTenders();

    await vi.waitFor(() => {
      expect(sendStageNotificationEmailMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenCalledTimes(4);
    });
    expect(sendStageNotificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "fmrd@example.com",
        tenderId: 7,
        tenderName: "Test Tender",
        newStage: 1,
      })
    );
    const [insertSql, insertParams] = queryMock.mock.calls[3];
    expect(insertSql).toMatch(/INSERT INTO notifications/);
    expect(insertParams).toEqual([3, "Tender moved to Open", expect.stringContaining("Test Tender"), "/tenders/7"]);
  });
});

describe("autoCloseExpiredTenders", () => {
  it("does nothing further if the 'closed' status_id can't be resolved", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await autoCloseExpiredTenders();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("transitions a due tender to stage 2, Open(1)->Closed, using the resolved status_id", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ tender_id: 9, tender_name: "Closing Tender" }] })
      .mockResolvedValueOnce({ rows: [] });

    await autoCloseExpiredTenders();

    const [updateSql, updateParams] = queryMock.mock.calls[1];
    expect(updateSql).toMatch(/SET stage = 2/);
    expect(updateSql).toMatch(/WHERE stage = 1/);
    expect(updateSql).toMatch(/closing_date < NOW\(\)/);
    expect(updateParams).toEqual([5]);
  });

  it("emails recipients and creates an in-app notification with newStage 2 when a tender auto-closes", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status_id: 5 }] })
      .mockResolvedValueOnce({ rows: [{ tender_id: 9, tender_name: "Closing Tender" }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 4, email: "financegm@example.com", name: "Finance GM" }] })
      .mockResolvedValueOnce({ rows: [] }); // notifyUsers INSERT

    await autoCloseExpiredTenders();

    await vi.waitFor(() => {
      expect(sendStageNotificationEmailMock).toHaveBeenCalledTimes(1);
      expect(queryMock).toHaveBeenCalledTimes(4);
    });
    expect(sendStageNotificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "financegm@example.com",
        tenderId: 9,
        newStage: 2,
      })
    );
    const [insertSql, insertParams] = queryMock.mock.calls[3];
    expect(insertSql).toMatch(/INSERT INTO notifications/);
    expect(insertParams[0]).toBe(4);
  });
});

describe("applyScheduledTenderTransitions", () => {
  it("checks Open-eligibility (tender_date) before Closed-eligibility (closing_date), in that order", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // autoOpen: 'Open' status lookup, nothing due
      .mockResolvedValueOnce({ rows: [] }); // autoClose: 'closed' status lookup, nothing due

    await applyScheduledTenderTransitions();

    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[0][0]).toMatch(/status_code = 'Open'/);
    expect(queryMock.mock.calls[1][0]).toMatch(/status_code = 'closed'/);
  });

  it("resolves both an open and a close in a single call (e.g. a short/backdated window)", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status_id: 42 }] }) // 'Open' status lookup
      .mockResolvedValueOnce({ rows: [{ tender_id: 1, tender_name: "Short Window" }] }) // opened
      .mockResolvedValueOnce({ rows: [] }) // open notify recipients
      .mockResolvedValueOnce({ rows: [{ status_id: 5 }] }) // 'closed' status lookup
      .mockResolvedValueOnce({ rows: [{ tender_id: 1, tender_name: "Short Window" }] }) // closed
      .mockResolvedValueOnce({ rows: [] }); // close notify recipients

    await applyScheduledTenderTransitions();

    expect(queryMock).toHaveBeenCalledTimes(6);
  });
});
