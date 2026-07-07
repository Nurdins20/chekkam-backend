"use client";

import { useState } from "react";
import Image from "next/image";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type SignResult = {
  id: string;
  verification_id: string;
  pin_code: string;
  qr_payload: string;
  qr_image: string;
  status: string;
};

const inputClass =
  "w-full rounded-[var(--radius-chekkam-sm)] border border-chekkam-border bg-chekkam-tint px-3.5 py-2.5 text-sm text-chekkam-ink outline-none transition focus:border-chekkam-primary focus:bg-chekkam-surface-raised focus:ring-2 focus:ring-chekkam-primary/20";

/**
 * Institution officer document-signing screen (SRS FR-040, 6.4). This is the
 * highest-confidence-to-effort demo vertical slice per the Project Overview
 * (§8): sign here, then verify from the Flutter app's scan/PIN screen or the
 * public /verify page.
 */
export default function InstitutionDashboardPage() {
  const supabase = getSupabaseBrowser();
  const [institutionId, setInstitutionId] = useState("");
  const [documentType, setDocumentType] = useState("certificate");
  const [recipientName, setRecipientName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a file to sign.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

      const form = new FormData();
      form.set("institution_id", institutionId);
      form.set("document_type", documentType);
      form.set("recipient_name", recipientName);
      form.set("file", file);

      const res = await fetch("/api/documents/sign", {
        method: "POST",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        body: form,
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message ?? "Failed to sign document.");
      }
      setResult(body as SignResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
          Institution officer
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
          Sign a document
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">
          Requires your account to be a member of the institution.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-7 shadow-chekkam-sm"
      >
        <Field label="Institution ID (uuid)">
          <input
            required
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            placeholder="a1c2d3e4-...."
            className={`${inputClass} font-[family-name:var(--font-data)]`}
          />
        </Field>

        <Field label="Document type">
          <input
            required
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Recipient name (optional)">
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Document file">
          <input
            required
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-chekkam-muted file:mr-3 file:rounded-[var(--radius-chekkam-sm)] file:border-0 file:bg-chekkam-tint file:px-3 file:py-2 file:text-sm file:font-medium file:text-chekkam-ink"
          />
        </Field>

        {error && <p className="text-sm text-status-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-[var(--radius-chekkam-sm)] bg-gradient-lagoon px-4 py-2.5 text-sm font-semibold text-white shadow-chekkam-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "Signing…" : "Sign document"}
        </button>
      </form>

      {result && (
        <div className="flex flex-col items-start gap-5 rounded-[var(--radius-chekkam)] bg-gradient-seal p-7 text-chekkam-lagoon shadow-chekkam-md sm:flex-row sm:items-center">
          <Image
            src={result.qr_image}
            alt="Verification QR code"
            width={144}
            height={144}
            unoptimized
            className="h-36 w-36 rounded-[var(--radius-chekkam-sm)] bg-white p-2 shadow-chekkam-sm"
          />
          <dl className="text-sm">
            <dt className="text-xs font-semibold uppercase tracking-wider opacity-70">Verification ID</dt>
            <dd className="mb-3 font-[family-name:var(--font-data)] text-base font-medium">
              {result.verification_id}
            </dd>
            <dt className="text-xs font-semibold uppercase tracking-wider opacity-70">PIN</dt>
            <dd className="mb-3 font-[family-name:var(--font-data)] text-base font-medium">{result.pin_code}</dd>
            <dt className="text-xs font-semibold uppercase tracking-wider opacity-70">Verify URL</dt>
            <dd className="break-all font-[family-name:var(--font-data)] text-xs">{result.qr_payload}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-chekkam-ink">{label}</span>
      {children}
    </label>
  );
}
