import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="hud-label">SIGNAL LOST</p>
      <h1 className="font-display text-3xl tracking-[0.25em] text-hud-neon">
        ACCOUNT NOT FOUND
      </h1>
      <p className="text-sm text-hud-muted">
        Check the account number or open a different one.
      </p>
      <Link href="/dashboard" className="hud-button">← Back to index</Link>
    </main>
  );
}
