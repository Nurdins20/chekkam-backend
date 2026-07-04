"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/hooks/useSession";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, configured } = useSession();
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  if (!configured) {
    return (
      <Shell>
        <p className="text-sm text-chekkam-ink">
          Supabase is not configured yet — set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code> (see
          <code> docs/ENVIRONMENT.md</code>) to enable sign-in.
        </p>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-sm text-chekkam-muted">Loading...</p>
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
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/5 bg-white px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-chekkam-primary">
            Chekkam
          </span>
          <nav className="flex gap-4 text-sm text-chekkam-ink">
            <Link href="/dashboard/analyst" className="hover:text-chekkam-primary">
              Analyst
            </Link>
            <Link href="/dashboard/institution" className="hover:text-chekkam-primary">
              Institution
            </Link>
          </nav>
        </div>
        <button
          onClick={async () => {
            await supabase?.auth.signOut();
            router.push("/login");
          }}
          className="text-sm font-medium text-chekkam-muted hover:text-chekkam-ink"
        >
          Sign out
        </button>
      </header>
      <main className="flex-1 bg-chekkam-tint-2 p-6">{children}</main>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-tint-2 px-4 py-16">
      <div className="max-w-md rounded-chekkam border border-black/5 bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
