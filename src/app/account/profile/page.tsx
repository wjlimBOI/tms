"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ROLE_IDS } from "@/lib/roles";
import { validatePassword } from "@/lib/passwordRules";
import PasswordField from "@/components/ui/PasswordField";
import { Button } from "@/components/ui/Button";
import { useNotify } from "@/components/ui/notification-provider";

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
  display_name: string | null;
  company_name: string | null;
  phone: string | null;
}

interface NotificationPreferences {
  newTenders: boolean;
  statusChanges: boolean;
  announcements: boolean;
  alerts: boolean;
}

// Same CTA treatment as the public expressInterest page's "Submit Interest"
// button (rounded-md, bold, hover lift + shadow) — see src/app/contractor/expressInterest/page.tsx.
const PRIMARY_BUTTON_CLASS =
  "h-auto gap-2 rounded-md bg-[#15406a] px-5 py-2.5 text-sm font-bold tracking-wide text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#0d2d4a] hover:shadow-lg";
const SECONDARY_BUTTON_CLASS =
  "h-auto rounded-md border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const notify = useNotify();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    display_name: "",
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

  // Notification preferences state
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    newTenders: true,
    statusChanges: true,
    announcements: true,
    alerts: true,
  });
  const [savingPreferences, setSavingPreferences] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (session?.user) {
      fetchProfile();
      fetchPreferences();
    }
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
      notify.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const fetchPreferences = async () => {
    try {
      const res = await fetch("/api/user/preferences");
      if (res.ok) {
        const data = await res.json();
        // Assuming the API returns an object with notification preferences
        if (data.notifications) {
          setPreferences(data.notifications);
        }
      }
    } catch (err) {
      console.error("Failed to load notification preferences:", err);
      // Keep defaults
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = {
      full_name: formData.full_name,
      display_name: formData.display_name,
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
        notify.success("Profile updated");
        setIsEditingProfile(false);
        await update();
        fetchProfile();
      } else {
        const err = await res.json();
        notify.error(err.error || "Update failed");
      }
    } catch (err) {
      notify.error("Network error");
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const { current_password, new_password, confirm_password } = passwordForm;

    if (new_password !== confirm_password) {
      notify.error("New passwords do not match");
      return;
    }

    const { isValid, errors } = validatePassword(new_password);
    if (!isValid) {
      notify.error(errors[0] || "Password does not meet requirements");
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
        notify.success("Password changed. Please log in again with your new password.");
        setPasswordForm({
          current_password: "",
          new_password: "",
          confirm_password: "",
        });
        setPasswordValidation({ isValid: false, errors: [], score: 0 });
        setIsChangingPassword(false);
        await signOut({ callbackUrl: "/login" });
      } else {
        const err = await res.json();
        notify.error(err.error || "Password change failed");
      }
    } catch (err) {
      notify.error("Network error");
    }
  };

  // Save notification preferences
  const savePreferences = async (updated: NotificationPreferences) => {
    setSavingPreferences(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifications: updated }),
      });
      if (res.ok) {
        notify.success("Notification preferences updated");
      } else {
        const err = await res.json();
        notify.error(err.error || "Failed to save preferences");
      }
    } catch (err) {
      notify.error("Network error");
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleTogglePreference = (key: keyof NotificationPreferences) => {
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    savePreferences(updated);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f4ee]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#15406a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const isContractor = profile.role_id === ROLE_IDS.CONTRACTOR;

  return (
    <div className="min-h-screen bg-[#f7f4ee] font-sans text-slate-900 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8 text-center sm:text-left">
          <h1 className="font-serif text-3xl font-bold text-slate-900 tracking-tight">
            Account Settings
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Manage your personal information and preferences
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 md:p-8">
            {/* Profile section */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900">
                Personal Information
              </h2>
              {!isEditingProfile && (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="text-sm text-[#15406a] hover:text-[#0d2d4a] font-medium transition"
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
                <div>
                  <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Display Name
                  </label>
                  <p className="mt-1 text-sm text-slate-900">
                    {profile.display_name || profile.username}
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
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#15406a] focus:border-transparent"
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
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#15406a] focus:border-transparent"
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
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#15406a] focus:border-transparent"
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
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#15406a] focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditingProfile(false)} className={SECONDARY_BUTTON_CLASS}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="default" className={PRIMARY_BUTTON_CLASS}>
                    Save Changes
                  </Button>
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
                    className="text-sm text-[#15406a] hover:text-[#0d2d4a] font-medium transition"
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
                        Passwords don’t match yet
                      </p>
                    )}

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsChangingPassword(false);
                        setPasswordForm({
                          current_password: "",
                          new_password: "",
                          confirm_password: "",
                        });
                        setPasswordValidation({ isValid: false, errors: [], score: 0 });
                      }}
                      className={SECONDARY_BUTTON_CLASS}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="default"
                      disabled={
                        !passwordForm.current_password ||
                        !passwordForm.new_password ||
                        passwordForm.new_password !== passwordForm.confirm_password ||
                        !passwordValidation.isValid
                      }
                      className={PRIMARY_BUTTON_CLASS}
                    >
                      Update Password
                    </Button>
                  </div>
                </form>
              )}
            </div>

            <div className="my-8 border-t border-slate-200" />

            {/* Notification Preferences */}
            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-4">
                Email Notifications
              </h2>
              <p className="text-sm text-slate-600 mb-4">
                Choose which email notifications you'd like to receive.
              </p>

              <div className="space-y-3">
                {[
                  { key: 'newTenders', label: 'New Tenders', description: 'Get notified when new tenders are published.' },
                  { key: 'statusChanges', label: 'Status Changes', description: 'Get notified when tender statuses change.' },
                  { key: 'announcements', label: 'Announcements', description: 'Receive important announcements from the admin.' },
                  { key: 'alerts', label: 'Alerts', description: 'Receive alerts about deadlines and submissions.' },
                ].map(({ key, label, description }) => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition">
                    <div>
                      <label className="text-sm font-medium text-slate-900 block">
                        {label}
                      </label>
                      <span className="text-xs text-slate-500">{description}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences[key as keyof NotificationPreferences]}
                        onChange={() => handleTogglePreference(key as keyof NotificationPreferences)}
                        disabled={savingPreferences}
                        aria-label={label}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#15406a] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#15406a] peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
                    </label>
                  </div>
                ))}
              </div>

              {savingPreferences && (
                <p className="text-xs text-slate-400 mt-2">Saving preferences...</p>
              )}
            </div>

            {/* Contractor account validity */}
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