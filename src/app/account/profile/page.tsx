"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ROLE_IDS } from "@/lib/roles";

interface UserProfile {
  user_id: number;
  username: string;
  email: string;
  role_id: number;
  role_name: string;
  is_active: boolean;
  is_approved: boolean;
  access_start_date: string | null;
  access_end_date: string | null;
  is_team_member: boolean;
  employee_code: string | null;
  job_title: string | null;
  full_name: string | null;
  display_name: string | null; // NEW
  company_name: string | null;
  phone: string | null;
}

const showToast = (message: string, type: "success" | "error" = "success") => {
  const toast = document.createElement("div");
  toast.className = `fixed bottom-4 right-4 z-50 px-4 py-2 rounded-md shadow-lg text-white text-sm ${
    type === "success" ? "bg-green-600" : "bg-red-600"
  }`;
  toast.innerText = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
};

// Moved OUTSIDE the main component to prevent remounting on each render
const PasswordField = ({
  label,
  value,
  onChange,
  placeholder,
  showToggle,
  show,
  setShow,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  showToggle?: boolean;
  show?: boolean;
  setShow?: (val: boolean) => void;
}) => (
  <div>
    <label className="block text-sm font-medium text-slate-700">
      {label}
    </label>
    <div className="relative mt-1">
      <input
        type={showToggle && show ? "text" : "password"}
        required
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
      />
      {showToggle && (
        <button
          type="button"
          onClick={() => setShow?.(!show)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-700"
        >
          {show ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          )}
        </button>
      )}
    </div>
  </div>
);

// SG Gov password validator
const validatePassword = (password: string) => {
  const errors: string[] = [];
  if (password.length < 15) errors.push("At least 15 characters");
  if (password.length > 64) errors.push("Maximum 64 characters");
  if (!/[A-Z]/.test(password)) errors.push("One uppercase letter (A–Z)");
  if (!/[a-z]/.test(password)) errors.push("One lowercase letter (a–z)");
  if (!/\d/.test(password)) errors.push("One digit (0–9)");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("One special character (e.g., !@#$%^&*)");
  return {
    isValid: errors.length === 0,
    errors,
    score: errors.length === 0 ? 3 : errors.length <= 2 ? 1 : 0,
  };
};

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    display_name: "", // NEW
    company_name: "",
    phone: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [passwordValidation, setPasswordValidation] = useState({
    isValid: false,
    errors: [] as string[],
    score: 0,
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user) fetchProfile();
  }, [session, status, router]);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/user/profile");
      const data = await res.json();
      setProfile(data);
      setFormData({
        full_name: data.full_name || "",
        display_name: data.display_name || "",
        company_name: data.company_name || "",
        phone: data.phone || "",
      });
    } catch (err) {
      console.error(err);
      showToast("Failed to load profile", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      full_name: formData.full_name,
      display_name: formData.display_name, // NEW
      phone: formData.phone,
    };
    if (isContractor) {
      payload.company_name = formData.company_name;
    }
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast("Profile updated", "success");
        setIsEditingProfile(false);
        // Refresh the session so the navbar shows the new display name immediately
        await update();
        fetchProfile();
      } else {
        const err = await res.json();
        showToast(err.error || "Update failed", "error");
      }
    } catch (err) {
      showToast("Network error", "error");
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const { current_password, new_password, confirm_password } = passwordForm;

    if (new_password !== confirm_password) {
      showToast("New passwords do not match", "error");
      return;
    }

    const { isValid, errors } = validatePassword(new_password);
    if (!isValid) {
      showToast(errors[0] || "Password does not meet requirements", "error");
      return;
    }

    try {
      const res = await fetch("/api/user/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password,
          new_password,
        }),
      });
      if (res.ok) {
        showToast("Password changed. Please log in again with your new password.", "success");
        setPasswordForm({
          current_password: "",
          new_password: "",
          confirm_password: "",
        });
        setPasswordValidation({ isValid: false, errors: [], score: 0 });
        setIsChangingPassword(false);
        // Changing the password invalidates the current session token server-side,
        // so sign out immediately for a clean re-login instead of a confusing
        // failure on the next request.
        await signOut({ callbackUrl: "/login" });
      } else {
        const err = await res.json();
        showToast(err.error || "Password change failed", "error");
      }
    } catch (err) {
      showToast("Network error", "error");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const isContractor = profile.role_id === ROLE_IDS.CONTRACTOR;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Account Settings
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Manage your personal information and password
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8">
            {/* Profile section */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">
                Personal Information
              </h2>
              {!isEditingProfile && (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="text-sm text-cyan-600 hover:text-cyan-700 font-medium transition"
                >
                  Edit
                </button>
              )}
            </div>

            {!isEditingProfile ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Username
                  </label>
                  <p className="mt-1 text-sm text-slate-900">
                    {profile.username}
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Email
                  </label>
                  <p className="mt-1 text-sm text-slate-900">
                    {profile.email}
                  </p>
                </div>
                {/* NEW: Display Name */}
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Display Name
                  </label>
                  <p className="mt-1 text-sm text-slate-900">
                    {profile.display_name || profile.username}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Shown in the dashboard greeting
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Full Name
                  </label>
                  <p className="mt-1 text-sm text-slate-900">
                    {profile.full_name || "—"}
                  </p>
                </div>
                {isContractor && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Company / Organization
                    </label>
                    <p className="mt-1 text-sm text-slate-900">
                      {profile.company_name || "—"}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Phone
                  </label>
                  <p className="mt-1 text-sm text-slate-900">
                    {profile.phone || "—"}
                  </p>
                </div>
                {profile.job_title && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Job Title
                    </label>
                    <p className="mt-1 text-sm text-slate-900">
                      {profile.job_title}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleProfileUpdate} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* NEW: Display Name field */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={formData.display_name}
                      onChange={(e) =>
                        setFormData({ ...formData, display_name: e.target.value })
                      }
                      placeholder="e.g., John Doe"
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Will appear in the dashboard greeting. Leave blank to use your username.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) =>
                        setFormData({ ...formData, full_name: e.target.value })
                      }
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                  {isContractor && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700">
                        Company / Organization
                      </label>
                      <input
                        type="text"
                        value={formData.company_name}
                        onChange={(e) =>
                          setFormData({ ...formData, company_name: e.target.value })
                        }
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg text-sm font-medium transition shadow-sm"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            <div className="my-8 border-t border-slate-200" />

            {/* Password section */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-slate-900">
                  Password
                </h2>
                {!isChangingPassword && (
                  <button
                    onClick={() => setIsChangingPassword(true)}
                    className="text-sm text-cyan-600 hover:text-cyan-700 font-medium transition"
                  >
                    Change Password
                  </button>
                )}
              </div>

              {!isChangingPassword ? (
                <p className="text-sm text-slate-600">
                  Keep your account secure with a strong password. Click "Change Password" to update it.
                </p>
              ) : (
                <form onSubmit={handlePasswordChange} className="space-y-5 max-w-md">
                  <PasswordField
                    label="Current Password"
                    value={passwordForm.current_password}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, current_password: e.target.value })
                    }
                    placeholder="Enter current password"
                    showToggle
                    show={showCurrentPassword}
                    setShow={setShowCurrentPassword}
                  />

                  <div>
                    <PasswordField
                      label="New Password"
                      value={passwordForm.new_password}
                      onChange={(e) => {
                        const newPwd = e.target.value;
                        setPasswordForm({ ...passwordForm, new_password: newPwd });
                        const validation = validatePassword(newPwd);
                        setPasswordValidation(validation);
                      }}
                      placeholder="Choose a new password"
                      showToggle
                      show={showNewPassword}
                      setShow={setShowNewPassword}
                    />
                    {passwordForm.new_password && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                passwordValidation.score === 0
                                  ? "w-0"
                                  : passwordValidation.score === 1
                                  ? "w-1/3 bg-red-500"
                                  : passwordValidation.score === 2
                                  ? "w-2/3 bg-yellow-500"
                                  : "w-full bg-green-500"
                              }`}
                            />
                          </div>
                          <span className="text-xs text-slate-600">
                            {passwordValidation.isValid
                              ? "Strong"
                              : passwordValidation.errors.length <= 2
                              ? "Weak"
                              : "Very weak"}
                          </span>
                        </div>
                        <div className="text-xs space-y-1">
                          <p className="text-slate-600 font-medium mb-1">
                            Password must have:
                          </p>
                          <ul className="space-y-0.5">
                            <li className={passwordForm.new_password.length >= 15 ? "text-green-600" : "text-red-600"}>
                              ✓ At least 15 characters
                            </li>
                            <li className={passwordForm.new_password.length <= 64 ? "text-green-600" : "text-red-600"}>
                              ✓ Maximum 64 characters
                            </li>
                            <li className={/[A-Z]/.test(passwordForm.new_password) ? "text-green-600" : "text-red-600"}>
                              ✓ One uppercase letter (A–Z)
                            </li>
                            <li className={/[a-z]/.test(passwordForm.new_password) ? "text-green-600" : "text-red-600"}>
                              ✓ One lowercase letter (a–z)
                            </li>
                            <li className={/\d/.test(passwordForm.new_password) ? "text-green-600" : "text-red-600"}>
                              ✓ One digit (0–9)
                            </li>
                            <li className={/[^A-Za-z0-9]/.test(passwordForm.new_password) ? "text-green-600" : "text-red-600"}>
                              ✓ One special character (e.g., !@#$%^&*)
                            </li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  <PasswordField
                    label="Confirm New Password"
                    value={passwordForm.confirm_password}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, confirm_password: e.target.value })
                    }
                    placeholder="Confirm your new password"
                    showToggle
                    show={showConfirmPassword}
                    setShow={setShowConfirmPassword}
                  />
                  {passwordForm.confirm_password &&
                    passwordForm.new_password !== passwordForm.confirm_password && (
                      <p className="text-xs text-orange-600 -mt-2">
                        ✧ Passwords don’t match yet
                      </p>
                    )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsChangingPassword(false);
                        setPasswordForm({
                          current_password: "",
                          new_password: "",
                          confirm_password: "",
                        });
                        setPasswordValidation({ isValid: false, errors: [], score: 0 });
                      }}
                      className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={
                        !passwordForm.current_password ||
                        !passwordForm.new_password ||
                        passwordForm.new_password !== passwordForm.confirm_password ||
                        !passwordValidation.isValid
                      }
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm ${
                        !(
                          !passwordForm.current_password ||
                          !passwordForm.new_password ||
                          passwordForm.new_password !== passwordForm.confirm_password ||
                          !passwordValidation.isValid
                        )
                          ? "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      Update Password
                    </button>
                  </div>
                </form>
              )}
            </div>

            {isContractor && (
              <div className="mt-8 pt-6 border-t border-slate-200">
                <h3 className="text-sm font-medium text-slate-700 mb-3">
                  Account Validity
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Valid from:</span>
                    <span className="ml-2 text-slate-900">
                      {formatDate(profile.access_start_date)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Valid until:</span>
                    <span className="ml-2 text-slate-900">
                      {formatDate(profile.access_end_date)}
                    </span>
                  </div>
                </div>
                {profile.is_active === false && (
                  <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                    Your account is currently inactive. Please contact support.
                  </p>
                )}
                {profile.is_approved === false && (
                  <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    Your account is pending approval.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}