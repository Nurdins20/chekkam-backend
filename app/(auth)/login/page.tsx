"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!supabase) {
    return (
      <NoticeShell>
        Supabase is not configured yet. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in <code>.env.local</code>, then restart the dev
        server — see <code>docs/ENVIRONMENT.md</code>.
      </NoticeShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-tint-2 px-4 py-16">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-chekkam border border-black/5 bg-white p-8 shadow-sm"
      >
        <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-chekkam-ink">
          Chekkam staff sign-in
        </h1>
        <p className="mt-1 text-sm text-chekkam-muted">
          For analysts, institution officers, and admins.
        </p>

        <label className="mt-6 block text-sm font-medium text-chekkam-ink">Email</label>
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
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <Link href="/signup" className="mt-4 block text-center text-sm text-chekkam-muted">
          Register your institution
        </Link>
      </form>
    </div>
  );
}

function NoticeShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-chekkam-tint-2 px-4 py-16">
      <div className="max-w-md rounded-chekkam border border-black/5 bg-white p-6 text-sm text-chekkam-ink shadow-sm">
        {children}
      </div>
    </div>
  );
}
