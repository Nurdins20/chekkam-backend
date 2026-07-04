"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type SignResult = {
  id: string;
  verification_id: string;
  pin_code: string;
  qr_payload: string;
  qr_image: string;
  status: string;
};

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
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-chekkam-ink">
          Sign a document
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">
          Requires your account to be a member of the institution (institution_members).
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-chekkam border border-black/5 bg-white p-6 shadow-sm"
      >
        <Field label="Institution ID (uuid)">
          <input
            required
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            placeholder="a1c2d3e4-...."
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm focus:border-chekkam-primary focus:outline-none focus:ring-2 focus:ring-chekkam-primary/30"
          />
        </Field>

        <Field label="Document type">
          <input
            required
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm focus:border-chekkam-primary focus:outline-none focus:ring-2 focus:ring-chekkam-primary/30"
          />
        </Field>

        <Field label="Recipient name (optional)">
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="w-full rounded-md border border-black/10 px-3 py-2 text-sm focus:border-chekkam-primary focus:outline-none focus:ring-2 focus:ring-chekkam-primary/30"
          />
        </Field>

        <Field label="Document file">
          <input
            required
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </Field>

        {error && <p className="text-sm text-status-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-chekkam-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Signing..." : "Sign document"}
        </button>
      </form>

      {result && (
        <div className="flex flex-col items-start gap-4 rounded-chekkam border border-status-success/30 bg-status-success/10 p-6 sm:flex-row sm:items-center">
          <img src={result.qr_image} alt="Verification QR code" className="h-40 w-40 rounded-md bg-white p-2" />
          <dl className="text-sm text-chekkam-ink">
            <dt className="font-semibold">Verification ID</dt>
            <dd className="mb-2 font-mono">{result.verification_id}</dd>
            <dt className="font-semibold">PIN</dt>
            <dd className="mb-2 font-mono">{result.pin_code}</dd>
            <dt className="font-semibold">Verify URL</dt>
            <dd className="break-all font-mono text-xs">{result.qr_payload}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-chekkam-ink">{label}</span>
      {children}
    </label>
  );
}
