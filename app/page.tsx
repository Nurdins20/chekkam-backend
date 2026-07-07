import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="relative overflow-hidden bg-gradient-lagoon px-6 py-28 text-center text-white">
        <div className="relative mx-auto max-w-2xl">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/12 text-3xl shadow-chekkam-lg mx-auto">
            ✓
          </span>
          <h1 className="mt-7 font-[family-name:var(--font-heading)] text-5xl font-semibold tracking-tight">
            Chekkam
          </h1>
          <p className="mt-3 font-[family-name:var(--font-heading)] text-xl italic text-chekkam-bright">
            One check. Total trust.
          </p>
          <p className="mx-auto mt-6 max-w-md text-white/70">
            The analyst and institution dashboard behind Chekkam&rsquo;s citizen tools — document
            signing, report review, and public alerts, all requiring a human before anything
            publishes.
          </p>
          <div className="mt-9 flex justify-center gap-3">
            <Link
              href="/login"
              className="rounded-[var(--radius-chekkam-sm)] bg-white px-6 py-2.5 text-sm font-semibold text-chekkam-lagoon shadow-chekkam-md transition hover:brightness-95"
            >
              Staff sign-in
            </Link>
            <Link
              href="/signup"
              className="rounded-[var(--radius-chekkam-sm)] border border-white/25 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Register an institution
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-5 px-6 py-16 sm:grid-cols-3">
        {[
          { label: "Citizens", detail: "Check messages and verify documents from the Chekkam mobile app — free, no account needed." },
          { label: "Institutions", detail: "Sign official documents with a cryptographic seal, QR code, and PIN. Revoke instantly if needed." },
          { label: "Analysts", detail: "Every report is human-reviewed before anything is published or escalated." },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[var(--radius-chekkam)] border border-chekkam-border bg-chekkam-surface-raised p-6 shadow-chekkam-sm"
          >
            <div className="text-xs font-semibold uppercase tracking-wider text-chekkam-primary">
              {item.label}
            </div>
            <p className="mt-2 text-sm text-chekkam-muted">{item.detail}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
