"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

// SG Gov password validator (same as profile page)
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

// Reusable password field with show/hide toggle
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
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    <div className="relative">
      <input
        type={showToggle && show ? "text" : "password"}
        required
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 pr-10 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-600 transition-colors"
      />
      {showToggle && (
        <button
          type="button"
          onClick={() => setShow?.(!show)}
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
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

export default function SetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validToken, setValidToken] = useState<boolean | null>(null);
  const [passwordValidation, setPasswordValidation] = useState({
    isValid: false,
    errors: [] as string[],
    score: 0,
  });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Validate token on page load
  useEffect(() => {
    if (!token) {
      setValidToken(false);
      return;
    }
    fetch("/api/auth/validate-password-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) setValidToken(true);
        else setValidToken(false);
      })
      .catch(() => setValidToken(false));
  }, [token]);

  const handlePasswordChange = (pwd: string) => {
    setNewPassword(pwd);
    const validation = validatePassword(pwd);
    setPasswordValidation(validation);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!passwordValidation.isValid) {
      setError("Please meet all password requirements");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/set-password-from-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/login?passwordSet=true"), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to set password");
      }
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (validToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">Verifying link...</p>
        </div>
      </div>
    );
  }

  if (validToken === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid or Expired Link</h1>
          <p className="text-gray-600 mb-6">
            The password set link is invalid, expired, or has already been used.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="px-5 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Password Set Successfully!</h1>
          <p className="text-gray-600 mb-6">
            You can now log in with your new password.
          </p>
          <div className="w-8 h-8 border-4 border-cyan-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-500 mt-3">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200 p-8">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Set Your Password</h1>
        <p className="text-gray-600 text-sm text-center mb-6">
          Choose a strong password to secure your account.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <PasswordField
              label="New Password"
              value={newPassword}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="Minimum 15 characters"
              showToggle
              show={showNewPassword}
              setShow={setShowNewPassword}
            />
            {newPassword && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
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
                  <span className="text-xs text-gray-600">
                    {passwordValidation.isValid
                      ? "Strong"
                      : passwordValidation.errors.length <= 2
                      ? "Weak"
                      : "Very weak"}
                  </span>
                </div>
                <div className="text-xs space-y-1">
                  <p className="text-gray-700 font-medium mb-1">
                    Password must have:
                  </p>
                  <ul className="space-y-0.5">
                    <li className={newPassword.length >= 15 ? "text-green-600" : "text-red-600"}>
                      ✓ At least 15 characters
                    </li>
                    <li className={newPassword.length <= 64 ? "text-green-600" : "text-red-600"}>
                      ✓ Maximum 64 characters
                    </li>
                    <li className={/[A-Z]/.test(newPassword) ? "text-green-600" : "text-red-600"}>
                      ✓ One uppercase letter (A–Z)
                    </li>
                    <li className={/[a-z]/.test(newPassword) ? "text-green-600" : "text-red-600"}>
                      ✓ One lowercase letter (a–z)
                    </li>
                    <li className={/\d/.test(newPassword) ? "text-green-600" : "text-red-600"}>
                      ✓ One digit (0–9)
                    </li>
                    <li className={/[^A-Za-z0-9]/.test(newPassword) ? "text-green-600" : "text-red-600"}>
                      ✓ One special character (e.g., !@#$%^&*)
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div>
            <PasswordField
              label="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
              showToggle
              show={showConfirmPassword}
              setShow={setShowConfirmPassword}
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-orange-600 mt-1">
                ✧ Passwords don’t match yet
              </p>
            )}
          </div>

          {error && (
            <div className="bg-red-100 border border-red-300 rounded-lg p-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              !newPassword ||
              !confirmPassword ||
              newPassword !== confirmPassword ||
              !passwordValidation.isValid
            }
            className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold py-2 rounded-lg transition transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {loading ? "Setting password..." : "Set Password"}
          </button>
        </form>
      </div>
    </div>
  );
}