"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";

const INSTITUTION_TYPES = [
  { value: "ministry", label: "Ministry" },
  { value: "exam_board", label: "Exam board" },
  { value: "school", label: "School" },
  { value: "university", label: "University" },
  { value: "company", label: "Company" },
  { value: "ngo", label: "NGO" },
  { value: "media", label: "Media" },
  { value: "civil_registry", label: "Civil registry" },
  { value: "other", label: "Other" },
];

const inputClass =
  "w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20";

export default function SignupPage() {
  const [institutionName, setInstitutionName] = useState("");
  const [institutionType, setInstitutionType] = useState("school");
  const [officerName, setOfficerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution_name: institutionName,
          institution_type: institutionType,
          officer_name: officerName,
          email,
          password,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message ?? "Something went wrong. Please try again.");
      }
      setSuccessMessage(body.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (successMessage) {
    return (
      <AuthShell eyebrow="Institution registration" title="Registered">
        <p className="text-sm text-chekkam-muted">{successMessage}</p>
        <Link
          href="/login"
          className="mt-5 inline-block text-sm font-semibold text-chekkam-primary hover:underline"
        >
          Back to sign in →
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Institution registration"
      title="Register your institution"
      subtitle="Pilot onboarding — an admin activates your institution before it can sign documents."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">Institution name</span>
          <input
            required
            value={institutionName}
            onChange={(e) => setInstitutionName(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">Institution type</span>
          <select
            required
            value={institutionType}
            onChange={(e) => setInstitutionType(e.target.value)}
            className={inputClass}
          >
            {INSTITUTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">Your name</span>
          <input
            required
            value={officerName}
            onChange={(e) => setOfficerName(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-chekkam-ink">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {error && <p className="text-sm text-status-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-[var(--radius-chekkam-sm)] bg-gradient-lagoon px-4 py-2.5 text-sm font-semibold text-white shadow-chekkam-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Registering…" : "Register institution"}
        </button>

        <Link href="/login" className="text-center text-sm font-medium text-chekkam-muted hover:text-chekkam-primary">
          Already have an account? Sign in
        </Link>
      </form>
    </AuthShell>
  );
}
