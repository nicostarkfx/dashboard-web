import { HudPanel } from "@/components/HudPanel";
import { UserPicker } from "@/components/UserPicker";

/**
 * Access terminal — the new root route.
 *
 * Renders the HUD-styled multi-user picker. Selecting a user and
 * confirming routes to /dashboard (which still hosts what used to live
 * at "/"). No backend, no auth — see <UserPicker /> for the UX details.
 */
export default function AccessTerminal() {
  return (
    <main className="space-y-6">
      <header>
        <p className="hud-label">ACCESS TERMINAL</p>
        <h1 className="font-display text-3xl tracking-[0.25em] text-hud-neon">
          JARVIS&nbsp;TRADING&nbsp;SYSTEM
        </h1>
        <p className="mt-1 text-xs text-hud-muted">
          Select operator to enter the console
        </p>
      </header>

      <div className="hud-divider" />

      <HudPanel
        title="Operators"
        subtitle="Mock multi-user — no backend wired yet"
      >
        <UserPicker />
      </HudPanel>
    </main>
  );
}
