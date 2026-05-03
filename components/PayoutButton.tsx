"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  accountNumber: string;
  eligible: boolean;
  blockedReasons: string[];
}

/**
 * "REQUEST PAYOUT" — calls the API route which closes the active cycle and
 * opens a new one. After success it refreshes the route so the equity curve
 * and trade table reset to the brand-new (empty) cycle.
 */
export function PayoutButton({ accountNumber, eligible, blockedReasons }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function submit() {
    setError(null);
    const res = await fetch(`/api/payout/${accountNumber}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Unknown error" }));
      setError(body.error ?? "Payout failed");
      return;
    }
    setConfirming(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {!confirming ? (
        <button
          className={`hud-button ${eligible ? "animate-glow" : ""}`}
          onClick={() => setConfirming(true)}
          disabled={!eligible || pending}
          title={eligible ? "Close cycle and request payout" : blockedReasons.join(" ")}
        >
          {pending ? "Processing…" : "▶ Request Payout"}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            className="hud-button hud-button-danger"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "Closing cycle…" : "Confirm payout"}
          </button>
          <button
            className="hud-button"
            onClick={() => setConfirming(false)}
            disabled={pending}
          >
            Cancel
          </button>
        </div>
      )}

      {!eligible && blockedReasons.length > 0 && (
        <ul className="text-right text-[11px] text-hud-muted">
          {blockedReasons.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      )}
      {error && <p className="text-[11px] text-hud-loss">{error}</p>}
    </div>
  );
}
