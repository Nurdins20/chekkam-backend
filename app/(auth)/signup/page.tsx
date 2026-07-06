"use client";

import { useState } from "react";
import Link from "next/link";

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
      <div className="flex flex-1 items-center justify-center bg-chekkam-tint-2 px-4 py-16">
        <div className="w-full max-w-sm rounded-chekkam border border-black/5 bg-white p-8 text-sm text-chekkam-ink shadow-sm">
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-chekkam-ink">
            Registered
          </h1>
          <p className="mt-3 text-chekkam-muted">{successMessage}</p>
          <Link href="/login" className="mt-6 inline-block text-sm font-medium text-chekkam-primary">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-tint-2 px-4 py-16">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-chekkam border border-black/5 bg-white p-8 shadow-sm"
      >
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-chekkam-ink">
          Register your institution
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">
          Onboarding only — an admin must activate your institution before it can sign documents.
        </p>

        <label className="mt-6 block text-sm font-medium text-chekkam-ink">Institution name</label>
        <input
          required
          value={institutionName}
          onChange={(e) => setInstitutionName(e.target.value)}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm focus:border-chekkam-primary focus:outline-none focus:ring-2 focus:ring-chekkam-primary/30"
        />

        <label className="mt-4 block text-sm font-medium text-chekkam-ink">Institution type</label>
        <select
          required
          value={institutionType}
          onChange={(e) => setInstitutionType(e.target.value)}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm focus:border-chekkam-primary focus:outline-none focus:ring-2 focus:ring-chekkam-primary/30"
        >
          {INSTITUTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-sm font-medium text-chekkam-ink">Your name</label>
        <input
          required
          value={officerName}
          onChange={(e) => setOfficerName(e.target.value)}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm focus:border-chekkam-primary focus:outline-none focus:ring-2 focus:ring-chekkam-primary/30"
        />

        <label className="mt-4 block text-sm font-medium text-chekkam-ink">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm focus:border-chekkam-primary focus:outline-none focus:ring-2 focus:ring-chekkam-primary/30"
        />

        <label className="mt-4 block text-sm font-medium text-chekkam-ink">Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-black/10 px-3 py-2 text-sm focus:border-chekkam-primary focus:outline-none focus:ring-2 focus:ring-chekkam-primary/30"
        />

        {error && <p className="mt-3 text-sm text-status-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-chekkam-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Registering..." : "Register institution"}
        </button>

        <Link href="/login" className="mt-4 block text-center text-sm text-chekkam-muted">
          Already have an account? Sign in
        </Link>
      </form>
    </div>
  );
}
