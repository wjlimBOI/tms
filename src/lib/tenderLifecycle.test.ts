import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const sendStageNotificationEmailMock = vi.fn();
const sendDlpReminderEmailMock = vi.fn();
const sendSubmissionDeadlineReminderEmailMock = vi.fn();

vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.mock("@/lib/email", () => ({
  sendStageNotificationEmail: (...args: unknown[]) => sendStageNotificationEmailMock(...args),
  sendDlpReminderEmail: (...args: unknown[]) => sendDlpReminderEmailMock(...args),
  sendSubmissionDeadlineReminderEmail: (...args: unknown[]) => sendSubmissionDeadlineReminderEmailMock(...args),
}));

import {
  autoOpenScheduledTenders,
  autoCloseExpiredTenders,
  applyScheduledTenderTransitions,
  sendDueDlpReminders,
  sendUpcomingSubmissionDeadlineReminders,
} from "./tenderLifecycle";

// Finds the query() call whose SQL matches `pattern`, regardless of position
// - sendDueDlpReminders/sendUpcomingSubmissionDeadlineReminders route email
// through sendTrackedEmail(), which makes its own query() calls (settings
// lookup, email_notification_log insert) interleaved with this module's own,
// so asserting by call index like the auto-open/close tests above would be
// brittle here.
function findQueryCall(pattern: RegExp) {
  return queryMock.mock.calls.find(([sql]) => pattern.test(sql as string));
}

beforeEach(() => {
  queryMock.mockReset();
  sendStageNotificationEmailMock.mockReset();
  sendStageNotificationEmailMock.mockResolvedValue(undefined);
  sendDlpReminderEmailMock.mockReset();
  sendDlpReminderEmailMock.mockResolvedValue(undefined);
  sendSubmissionDeadlineReminderEmailMock.mockReset();
  sendSubmissionDeadlineReminderEmailMock.mockResolvedValue(undefined);
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

describe("sendDueDlpReminders", () => {
  it("does nothing further when no tender's DLP is due", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await sendDueDlpReminders();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(sendDlpReminderEmailMock).not.toHaveBeenCalled();
  });

  it("notifies and emails every active admin, and marks the reminder sent, for a due tender", async () => {
    // due_date comes back from pg as a native Date object (no custom type
    // parser is registered - see src/lib/db.ts's own comment on this exact
    // issue), which is the regression this test guards: interpolating a
    // Date directly into notification/email text used to throw inside
    // escapeHtml(), silently swallowed by sendTrackedEmail, so the email
    // never sent - toDateOnly() must be applied first.
    const dueDate = new Date("2026-09-12T00:00:00Z");
    queryMock
      .mockResolvedValueOnce({
        rows: [{ tender_id: 7, tender_name: "Test Tender", branch_name: "Test Branch", due_date: dueDate }],
      }) // dueRes
      .mockResolvedValueOnce({
        rows: [{ user_id: 1, email: "admin1@example.com", name: "Admin One" }],
      }) // adminRes
      .mockResolvedValue({ rows: [] }); // notifyUsers insert, sendTrackedEmail's settings lookup + log insert, final UPDATE

    await sendDueDlpReminders();

    const notifyCall = findQueryCall(/INSERT INTO notifications/);
    expect(notifyCall).toBeDefined();
    expect(notifyCall![1]).toEqual([1, "DLP expiring soon: Test Tender", expect.stringContaining("2026-09-12"), "/tenders/7"]);
    expect(notifyCall![1][2]).not.toMatch(/GMT|\[object/);

    expect(sendDlpReminderEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin1@example.com",
        recipientName: "Admin One",
        tenderName: "Test Tender",
        tenderId: 7,
        dueDate: "2026-09-12",
      })
    );

    const updateCall = findQueryCall(/UPDATE tender SET dlp_reminder_sent_at = NOW\(\)/);
    expect(updateCall).toBeDefined();
    expect(updateCall![1]).toEqual([7]);
  });

  it("still marks the reminder sent even if the email fails", async () => {
    sendDlpReminderEmailMock.mockRejectedValue(new Error("SMTP down"));
    queryMock
      .mockResolvedValueOnce({
        rows: [{ tender_id: 7, tender_name: "Test Tender", branch_name: "Test Branch", due_date: "2026-09-12" }],
      })
      .mockResolvedValueOnce({ rows: [{ user_id: 1, email: "admin1@example.com", name: "Admin One" }] })
      .mockResolvedValue({ rows: [] });

    await sendDueDlpReminders();

    const updateCall = findQueryCall(/UPDATE tender SET dlp_reminder_sent_at = NOW\(\)/);
    expect(updateCall).toBeDefined();
  });
});

describe("sendUpcomingSubmissionDeadlineReminders", () => {
  it("does nothing further when there are no candidates", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await sendUpcomingSubmissionDeadlineReminders();
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(sendSubmissionDeadlineReminderEmailMock).not.toHaveBeenCalled();
  });

  it("does not throw, and sends nothing further, if the candidate query itself fails", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection reset"));
    await expect(sendUpcomingSubmissionDeadlineReminders()).resolves.toBeUndefined();
    expect(sendSubmissionDeadlineReminderEmailMock).not.toHaveBeenCalled();
  });

  it("notifies and emails a contractor with interest but no real submission as the deadline approaches", async () => {
    // closing_date has the same pg-Date-object regression risk as
    // sendDueDlpReminders' due_date above.
    const closingDate = new Date("2026-08-15T00:00:00Z");
    queryMock
      .mockResolvedValueOnce({
        rows: [{ contractor_id: 22, username: "novelty", email: "novelty@example.com", tender_id: 3, tender_name: "Test Tender", closing_date: closingDate }],
      })
      .mockResolvedValue({ rows: [] });

    await sendUpcomingSubmissionDeadlineReminders();

    const notifyCall = findQueryCall(/INSERT INTO notifications/);
    expect(notifyCall).toBeDefined();
    expect(notifyCall![1]).toEqual([22, "Submission deadline approaching", expect.stringContaining("2026-08-15"), "/tenders/3"]);

    expect(sendSubmissionDeadlineReminderEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "novelty@example.com",
        recipientName: "novelty",
        tenderName: "Test Tender",
        tenderId: 3,
        closingDate: "2026-08-15",
      })
    );
  });
});
