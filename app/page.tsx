import { serverClient } from "@/lib/supabase";
import { HudPanel } from "@/components/HudPanel";
import { AccountsList } from "@/components/AccountsList";
import type { Account } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Index of every account.
 *
 * Initial data is fetched on the server with serverClient(); the inner grid +
 * mutation UI lives in <AccountsList /> (a client component) which uses
 * browserClient() for inserts and deletes. router.refresh() re-runs this
 * server function after every mutation so we stay consistent.
 */
export default async function Home() {
  let data: Account[] = [];
  let errorMessage: string | null = null;

  try {
    const supabase = serverClient();
    const { data: rows, error } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[accounts] supabase error:", error.message, error);
      errorMessage = error.message;
    } else {
      data = (rows ?? []) as Account[];
    }
  } catch (e) {
    const err = e as Error & { cause?: unknown };
    const causeMsg =
      err.cause && typeof err.cause === "object" && "message" in err.cause
        ? String((err.cause as { message: unknown }).message)
        : err.cause
          ? String(err.cause)
          : null;
    console.error(
      "[accounts] fetch failed:",
      err.message,
      "cause:",
      err.cause
    );
    errorMessage = causeMsg ? `${err.message} — ${causeMsg}` : err.message;
  }

  return (
    <main className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="hud-label">SYSTEM ONLINE</p>
          <h1 className="font-display text-3xl tracking-[0.25em] text-hud-neon">
            TRADING&nbsp;HUD
          </h1>
          <p className="mt-1 text-xs text-hud-muted">Funded account control panel</p>
        </div>
      </header>

      <div className="hud-divider" />

      <HudPanel title="Accounts" subtitle="Select an account to enter its dashboard">
        <AccountsList initial={data} error={errorMessage} />
      </HudPanel>
    </main>
  );
}
