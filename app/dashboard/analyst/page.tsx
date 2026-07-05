"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Report = {
  id: string;
  channel: string;
  content_type: string;
  raw_content: string | null;
  risk_level: string | null;
  risk_score: number | null;
  category: string | null;
  status: string;
  ai_reasons: string[] | null;
  ai_indicators: { source?: string } | null;
  confidence: string | null;
  recommended_action: string | null;
  campaign_id: string | null;
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

const CHANNEL_OPTIONS = ["mobile", "web", "whatsapp", "telegram", "api", "extension", "share_intent"];
const RISK_OPTIONS = ["low", "medium", "high", "critical"];

const RISK_COLOR: Record<string, string> = {
  low: "bg-status-success/10 text-status-success",
  medium: "bg-status-warning/10 text-status-warning",
  high: "bg-status-danger/10 text-status-danger",
  critical: "bg-status-danger/10 text-status-danger",
};

/** Analyst review queue (SRS FR-081-083; Phase 2 §7.1-7.2). Human review before publish, in one screen. */
export default function AnalystDashboardPage() {
  const supabase = getSupabaseBrowser();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: "", channel: "", risk_level: "", category: "" });

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.channel) params.set("channel", filters.channel);
      if (filters.risk_level) params.set("risk_level", filters.risk_level);
      if (filters.category) params.set("category", filters.category);

      const res = await fetch(`/api/reports?${params.toString()}`, {
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
  }, [supabase, filters]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function authHeaders() {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify({ status }),
    });
    loadReports();
  }

  async function promoteToAlert(report: Report) {
    setPromoting(report.id);
    try {
      const res = await fetch("/api/public-alerts/from-report", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(
          report.campaign_id ? { campaign_id: report.campaign_id } : { report_id: report.id }
        ),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to promote this report.");
      window.location.href = `/dashboard/analyst/alerts?highlight=${body.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-chekkam-ink">
            Report review queue
          </h1>
          <p className="mt-1 text-sm text-chekkam-muted">
            Every AI result here is advisory (needs_human_review) until you set a final status.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/dashboard/analyst/alerts" className="font-medium text-chekkam-primary hover:underline">
            Public alerts →
          </Link>
          <Link
            href="/dashboard/analyst/safety-alerts"
            className="font-medium text-chekkam-primary hover:underline"
          >
            Safety alerts →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-chekkam border border-black/5 bg-white p-3 shadow-sm">
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="rounded-md border border-black/10 px-2 py-1 text-xs"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.channel}
          onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
          className="rounded-md border border-black/10 px-2 py-1 text-xs"
        >
          <option value="">All channels</option>
          {CHANNEL_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filters.risk_level}
          onChange={(e) => setFilters((f) => ({ ...f, risk_level: e.target.value }))}
          className="rounded-md border border-black/10 px-2 py-1 text-xs"
        >
          <option value="">All risk levels</option>
          {RISK_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          placeholder="category (e.g. phishing)"
          className="rounded-md border border-black/10 px-2 py-1 text-xs"
        />
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}
      {loading && <p className="text-sm text-chekkam-muted">Loading...</p>}

      <div className="flex flex-col gap-3">
        {reports.map((report) => (
          <div key={report.id} className="rounded-chekkam border border-black/5 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {report.risk_level && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RISK_COLOR[report.risk_level] ?? "bg-status-neutral/10 text-status-neutral"}`}
                    >
                      {report.risk_level}
                    </span>
                  )}
                  <span className="rounded-full bg-chekkam-tint px-2 py-0.5 text-xs font-medium text-chekkam-primary">
                    {report.channel}
                  </span>
                  <span className="text-xs text-chekkam-muted">{report.category ?? "uncategorized"}</span>
                  <span className="text-xs text-chekkam-muted">· {report.status}</span>
                  {report.confidence && (
                    <span className="text-xs text-chekkam-muted">
                      · confidence: {report.confidence} ({report.ai_indicators?.source ?? "n/a"})
                    </span>
                  )}
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
              <div className="flex shrink-0 flex-col items-end gap-2">
                <select
                  value={report.status}
                  onChange={(e) => updateStatus(report.id, e.target.value)}
                  className="rounded-md border border-black/10 px-2 py-1 text-xs"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => promoteToAlert(report)}
                  disabled={promoting === report.id}
                  className="rounded-md bg-chekkam-primary px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {promoting === report.id ? "Promoting..." : "Promote to alert"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {!loading && reports.length === 0 && (
          <p className="text-sm text-chekkam-muted">No reports match these filters.</p>
        )}
      </div>
    </div>
  );
}
