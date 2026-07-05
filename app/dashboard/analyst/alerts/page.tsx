"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type PublicAlert = {
  id: string;
  title: string;
  body: string;
  alert_type: string;
  severity: string;
  published: boolean;
  published_at: string | null;
  created_at: string;
};

/**
 * Public alerts management (Phase 2 §7.3, §7.5). Lists both drafts and
 * published alerts, lets an analyst edit a draft, then publish it — the
 * final, deliberate human-approval step before anything is public.
 */
export default function PublicAlertsAdminPage() {
  const supabase = getSupabaseBrowser();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const [alerts, setAlerts] = useState<PublicAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, Partial<PublicAlert>>>({});
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
      const res = await fetch("/api/public-alerts?scope=drafts", { headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load alerts.");
      setAlerts(body.alerts as PublicAlert[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function field(alert: PublicAlert, key: keyof PublicAlert): string {
    return (editing[alert.id]?.[key] as string) ?? (alert[key] as string);
  }

  function setField(alertId: string, key: keyof PublicAlert, value: string) {
    setEditing((prev) => ({ ...prev, [alertId]: { ...prev[alertId], [key]: value } }));
  }

  async function saveEdits(alert: PublicAlert) {
    const changes = editing[alert.id];
    if (!changes) return;
    setBusyId(alert.id);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/public-alerts/${alert.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(changes),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to save changes.");
      setEditing((prev) => {
        const next = { ...prev };
        delete next[alert.id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusyId(null);
    }
  }

  async function publish(alertId: string) {
    setBusyId(alertId);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/public-alerts/${alertId}/publish`, { method: "POST", headers });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to publish.");
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
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-chekkam-ink">
          Public alerts
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">
          Nothing here reaches citizens until you press Publish.
        </p>
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}
      {loading && <p className="text-sm text-chekkam-muted">Loading...</p>}

      <div className="flex flex-col gap-4">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`rounded-chekkam border bg-white p-4 shadow-sm ${
              alert.id === highlightId ? "border-chekkam-primary" : "border-black/5"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  alert.published
                    ? "bg-status-success/10 text-status-success"
                    : "bg-status-neutral/10 text-status-neutral"
                }`}
              >
                {alert.published ? "Published" : "Draft"}
              </span>
              <span className="text-xs text-chekkam-muted">
                {alert.alert_type} · {alert.severity}
              </span>
            </div>

            <label className="mb-2 block">
              <span className="text-xs font-medium text-chekkam-muted">Title</span>
              <input
                value={field(alert, "title")}
                onChange={(e) => setField(alert.id, "title", e.target.value)}
                disabled={alert.published}
                className="mt-1 w-full rounded-md border border-black/10 px-2 py-1 text-sm disabled:bg-chekkam-tint-2"
              />
            </label>

            <label className="mb-3 block">
              <span className="text-xs font-medium text-chekkam-muted">Body</span>
              <textarea
                value={field(alert, "body")}
                onChange={(e) => setField(alert.id, "body", e.target.value)}
                disabled={alert.published}
                rows={3}
                className="mt-1 w-full rounded-md border border-black/10 px-2 py-1 text-sm disabled:bg-chekkam-tint-2"
              />
            </label>

            {!alert.published && (
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdits(alert)}
                  disabled={busyId === alert.id || !editing[alert.id]}
                  className="rounded-md border border-chekkam-primary px-3 py-1 text-xs font-semibold text-chekkam-primary disabled:opacity-50"
                >
                  Save changes
                </button>
                <button
                  onClick={() => publish(alert.id)}
                  disabled={busyId === alert.id}
                  className="rounded-md bg-chekkam-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {busyId === alert.id ? "Publishing..." : "Publish"}
                </button>
              </div>
            )}
          </div>
        ))}
        {!loading && alerts.length === 0 && (
          <p className="text-sm text-chekkam-muted">
            No alerts yet — promote a report from the review queue to get started.
          </p>
        )}
      </div>
    </div>
  );
}
