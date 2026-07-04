"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Report = {
  id: string;
  content_type: string;
  raw_content: string | null;
  risk_level: string | null;
  risk_score: number | null;
  category: string | null;
  status: string;
  ai_reasons: string[] | null;
  recommended_action: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  "pending",
  "analyzed",
  "under_review",
  "verified_threat",
  "false_report",
  "dismissed",
];

const RISK_COLOR: Record<string, string> = {
  low: "bg-status-success/10 text-status-success",
  medium: "bg-status-warning/10 text-status-warning",
  high: "bg-status-danger/10 text-status-danger",
  critical: "bg-status-danger/10 text-status-danger",
};

/** Analyst review queue (SRS FR-081-083). Human review before publish, in one screen. */
export default function AnalystDashboardPage() {
  const supabase = getSupabaseBrowser();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
      const res = await fetch("/api/reports", {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load reports.");
      setReports(body.reports as Report[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function updateStatus(id: string, status: string) {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ status }),
    });
    loadReports();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-chekkam-ink">
          Report review queue
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">
          Every AI result here is advisory (needs_human_review) until you set a final status.
        </p>
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}
      {loading && <p className="text-sm text-chekkam-muted">Loading...</p>}

      <div className="flex flex-col gap-3">
        {reports.map((report) => (
          <div key={report.id} className="rounded-chekkam border border-black/5 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {report.risk_level && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_COLOR[report.risk_level] ?? "bg-status-neutral/10 text-status-neutral"}`}
                    >
                      {report.risk_level}
                    </span>
                  )}
                  <span className="text-xs text-chekkam-muted">{report.category ?? "uncategorized"}</span>
                  <span className="text-xs text-chekkam-muted">· {report.status}</span>
                </div>
                <p className="mt-2 truncate text-sm text-chekkam-ink">
                  {report.raw_content ?? "(no text content)"}
                </p>
                {report.ai_reasons && (
                  <ul className="mt-2 list-inside list-disc text-xs text-chekkam-muted">
                    {report.ai_reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
              <select
                value={report.status}
                onChange={(e) => updateStatus(report.id, e.target.value)}
                className="shrink-0 rounded-md border border-black/10 px-2 py-1 text-xs"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {!loading && reports.length === 0 && (
          <p className="text-sm text-chekkam-muted">No reports yet.</p>
        )}
      </div>
    </div>
  );
}
