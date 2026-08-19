"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogClose, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/Button";
import type { DashboardNotification } from "@/types/dashboard";

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", minimumFractionDigits: 2 }).format(amount);
};

export default function NotificationDetailModal({
  notification,
  onClose,
}: {
  notification: DashboardNotification | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={notification !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl w-full rounded-lg p-0 gap-0 max-h-[90vh] overflow-y-auto sm:max-w-2xl"
      >
        {notification && (
          <>
            <div className="sticky top-0 z-10 bg-white px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-lg flex justify-between items-center">
              <DialogTitle className="text-lg font-semibold text-slate-900">
                {notification.type === "awarded" ? "Tender Award Details" : "BQ Submission Details"}
              </DialogTitle>
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Close dialog"
                  />
                }
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </DialogClose>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase">Event Type</label>
                <p className="text-sm font-semibold text-slate-900 mt-1 capitalize">{notification.type}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase">Message</label>
                <p className="text-sm text-slate-900 mt-1">{notification.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase">Tender Name</label>
                  <p className="text-sm text-slate-900 mt-1">{notification.tender_name || "—"}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase">Contractor</label>
                  <p className="text-sm text-slate-900 mt-1">{notification.contractor_name || "—"}</p>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase">
                  {notification.type === "awarded" ? "Contract Value" : "Details"}
                </label>
                {notification.type === "awarded" && typeof notification.contract_value === "number" ? (
                  <div className="mt-2 bg-slate-50 rounded-md p-3 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">{formatCurrency(notification.contract_value)}</p>
                    <p className="text-xs text-slate-500 mt-1">A full BQ line-item breakdown isn&apos;t available here — view the full tender page for details.</p>
                  </div>
                ) : notification.type === "submitted" ? (
                  <div className="mt-2 bg-slate-50 rounded-md p-3 text-sm text-slate-600">
                    <p>The contractor has submitted a BQ for this tender. Please review the details on the tender page.</p>
                  </div>
                ) : (
                  <div className="mt-2 bg-slate-50 rounded-md p-3 text-sm text-slate-600">
                    <p>No further details available.</p>
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                {notification.link && (
                  <Link href={notification.link} className={buttonVariants({ className: "bg-[#15406a] hover:bg-[#0d2d4a] text-white" })}>
                    Go to Tender Page
                  </Link>
                )}
                <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
