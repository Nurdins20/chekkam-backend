"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type VerifyResult = {
  status: "genuine" | "tampered" | "revoked" | "not_found";
  institution?: string | null;
  document_type?: string;
  verification_id?: string;
  reason?: string;
};

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  genuine: { label: "Genuine", className: "bg-status-success/10 text-status-success border-status-success/30" },
  tampered: { label: "Tampered", className: "bg-status-danger/10 text-status-danger border-status-danger/30" },
  revoked: { label: "Revoked", className: "bg-status-neutral/10 text-status-neutral border-status-neutral/30" },
  not_found: { label: "Not Found", className: "bg-status-neutral/10 text-status-neutral border-status-neutral/30" },
};

/**
 * Public web verification fallback for people without the Flutter app
 * (FR-044, SRS 3.2). Mirrors the mobile app's manual-PIN-entry flow.
 */
export default function VerifyPage() {
  const params = useParams<{ verificationId: string }>();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/documents/verify/${encodeURIComponent(params.verificationId)}?channel=web`
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message ?? "Verification failed.");
        setResult(body as VerifyResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [params.verificationId]);

  const style = result ? STATUS_STYLE[result.status] : null;

  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-tint-2 px-4 py-16">
      <div className="w-full max-w-md rounded-chekkam border border-black/5 bg-white p-8 text-center shadow-sm">
        <h1 className="font-[family-name:var(--font-heading)] text-xl font-bold text-chekkam-ink">
          Document verification
        </h1>
        <p className="mt-1 break-all text-xs text-chekkam-muted">{params.verificationId}</p>

        {loading && <p className="mt-6 text-sm text-chekkam-muted">Checking...</p>}
        {error && <p className="mt-6 text-sm text-status-danger">{error}</p>}

        {result && style && (
          <div className="mt-6">
            <span className={`inline-block rounded-full border px-4 py-1 text-sm font-semibold ${style.className}`}>
              {style.label}
            </span>
            {result.institution && (
              <p className="mt-4 text-sm text-chekkam-ink">
                Issued by <span className="font-semibold">{result.institution}</span>
                {result.document_type ? ` · ${result.document_type}` : ""}
              </p>
            )}
            {result.reason && <p className="mt-2 text-sm text-chekkam-muted">Reason: {result.reason}</p>}
            {result.status === "not_found" && (
              <p className="mt-4 text-sm text-chekkam-muted">
                No document matches this ID or PIN. Double check it, or contact the issuing institution.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
