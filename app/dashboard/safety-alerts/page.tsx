"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type SafetyAlert = {
  id: string;
  category: string;
  description: string;
  status: string;
  location_precision: string;
  radius_meters: number;
  created_at: string;
};

/**
 * Safety-alert moderation queue (SRS FR-071-074; Phase 2 §7.4). Approving
 * here is the human-review gate before a community safety alert becomes
 * visible on the app/web alert page.
 */
export default function SafetyAlertsAdminPage() {
  const supabase = getSupabaseBrowser();
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function authHeaders() {
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    return {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/safety-alerts?status=pending", { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load safety alerts.");
      setAlerts(body.safety_alerts as SafetyAlert[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
  }, [load]);

  async function approve(id: string) {
    setBusyId(id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/safety-alerts/${id}/approve`, { method: "POST", headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to approve.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
          Human approval gate
        </div>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-semibold text-chekkam-ink">
          Safety alerts
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">
          Community safety reports — always a supplement to, never a replacement for, emergency services.
        </p>
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}
      {loading && <p className="text-sm text-chekkam-muted">Loading…</p>}

      <div className="flex flex-col gap-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-5 shadow-chekkam-sm"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-chekkam-tint px-2.5 py-0.5 text-xs font-medium text-chekkam-primary">
                {alert.category}
              </span>
              <span className="text-xs text-chekkam-faint">
                {alert.location_precision} · {alert.radius_meters}m radius
              </span>
            </div>
            <p className="text-sm text-chekkam-ink">{alert.description}</p>
            <button
              onClick={() => approve(alert.id)}
              disabled={busyId === alert.id}
              className="mt-3 rounded-[var(--radius-chekkam-sm)] bg-gradient-lagoon px-3.5 py-1.5 text-xs font-semibold text-white shadow-chekkam-sm disabled:opacity-60"
            >
              {busyId === alert.id ? "Approving…" : "Approve & notify"}
            </button>
          </div>
        ))}
        {!loading && alerts.length === 0 && (
          <p className="text-sm text-chekkam-muted">No pending safety reports.</p>
        )}
      </div>
    </div>
  );
}
