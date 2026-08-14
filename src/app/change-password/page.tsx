"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import PasswordField from "@/components/ui/PasswordField";
import { validatePassword } from "@/lib/passwordRules";
import { useNotify } from "@/components/ui/notification-provider";

export default function ChangePasswordPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const toast = useNotify();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    // Only meant for the forced first-login reset — anyone who doesn't
    // actually need to change their password gets sent to the dashboard.
    if (!session.user.must_change_password) {
      router.push("/");
    }
  }, [session, status, router]);

  const { isValid, errors } = validatePassword(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      toast.error(errors[0] || "Password does not meet requirements");
      return;
    }
    if (!passwordsMatch) {
      toast.error("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password-first", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not update your password. Please try again.");
        setSubmitting(false);
        return;
      }
      toast.success("Password updated. Please log in again with your new password.");
      await signOut({ callbackUrl: "/login" });
    } catch {
      toast.error("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  if (status === "loading" || !session || !session.user.must_change_password) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/60 p-8">
        <h1 className="text-xl font-bold text-slate-900">Set a new password</h1>
        <p className="text-sm text-slate-600 mt-1.5">
          For security, you need to set your own password before continuing.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <PasswordField
            label="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter a new password"
            showToggle
            show={showPassword}
            setShow={setShowPassword}
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
            showToggle
            show={showPassword}
            setShow={setShowPassword}
          />

          {newPassword && (
            <ul className="text-xs space-y-1 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <li className={newPassword.length >= 15 && newPassword.length <= 64 ? "text-green-600" : "text-red-600"}>
                • 15–64 characters
              </li>
              <li className={/[A-Z]/.test(newPassword) ? "text-green-600" : "text-red-600"}>
                • One uppercase letter (A–Z)
              </li>
              <li className={/[a-z]/.test(newPassword) ? "text-green-600" : "text-red-600"}>
                • One lowercase letter (a–z)
              </li>
              <li className={/\d/.test(newPassword) ? "text-green-600" : "text-red-600"}>
                • One digit (0–9)
              </li>
              <li className={/[^A-Za-z0-9]/.test(newPassword) ? "text-green-600" : "text-red-600"}>
                • One special character (e.g., !@#$%^&amp;*)
              </li>
              {confirmPassword && (
                <li className={passwordsMatch ? "text-green-600" : "text-red-600"}>
                  • Passwords match
                </li>
              )}
            </ul>
          )}

          <button
            type="submit"
            disabled={submitting || !isValid || !passwordsMatch}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2"
          >
            {submitting && (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {submitting ? "Updating password..." : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
