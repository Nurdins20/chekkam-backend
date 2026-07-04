import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-chekkam-tint-2 px-6 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-chekkam-tint text-3xl text-chekkam-primary">
        ✓
      </span>
      <h1 className="mt-6 font-[family-name:var(--font-heading)] text-4xl font-bold text-chekkam-ink">
        Chekkam
      </h1>
      <p className="mt-2 max-w-md text-lg text-chekkam-muted">One check. Total trust.</p>
      <p className="mt-4 max-w-md text-sm text-chekkam-muted">
        This is the analyst/institution web dashboard and shared API. Citizens use the Chekkam
        mobile app to report suspicious content and verify documents.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-chekkam-primary px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Staff sign-in
        </Link>
      </div>
    </div>
  );
}
