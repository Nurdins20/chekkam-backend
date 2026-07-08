"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const NAV_ITEMS = [
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/alerts", label: "Public alerts" },
  { href: "/dashboard/safety-alerts", label: "Safety alerts" },
];

const ROLE_LABEL: Record<string, string> = {
  citizen: "Citizen",
  institution_officer: "Institution officer",
  analyst: "Analyst",
  admin: "Admin",
  super_admin: "Super admin",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, configured } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = getSupabaseBrowser();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !session) return;
    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setRole(data?.role ?? null));
  }, [supabase, session]);

  if (!configured) {
    return (
      <Shell>
        <p className="text-sm text-chekkam-ink">
          Supabase is not configured yet — set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code> to enable sign-in.
        </p>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-sm text-chekkam-muted">Loading…</p>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <p className="text-sm text-chekkam-ink">
          You need to{" "}
          <Link href="/login" className="font-medium text-chekkam-primary underline">
            sign in
          </Link>{" "}
          to view the dashboard.
        </p>
      </Shell>
    );
  }

  return (
    <div className="flex min-h-full flex-1">
      <aside className="flex w-56 flex-shrink-0 flex-col bg-gradient-lagoon px-4 py-6 text-white">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs">✓</span>
          <span className="font-[family-name:var(--font-heading)] text-base font-semibold">Chekkam</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[var(--radius-chekkam-sm)] px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white/90"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 pt-3">
          <div className="px-3 py-1 text-xs text-white/50">
            {session.user.email}
            {role && <div className="mt-0.5 font-medium text-white/75">{ROLE_LABEL[role] ?? role}</div>}
          </div>
          <button
            onClick={async () => {
              await supabase?.auth.signOut();
              router.push("/login");
            }}
            className="mt-1 w-full rounded-[var(--radius-chekkam-sm)] px-3 py-2 text-left text-sm font-medium text-white/50 transition hover:bg-white/8 hover:text-white/80"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-chekkam-surface p-8">{children}</main>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-surface px-4 py-16">
      <div className="max-w-md rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm">
        {children}
      </div>
    </div>
  );
}
