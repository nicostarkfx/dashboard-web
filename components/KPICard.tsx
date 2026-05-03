import type { ReactNode } from "react";
import { AnimatedValue } from "./AnimatedValue";

interface KPICardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "win" | "loss" | "warn";
  /** When true, the tile gets an extra pulsing aura — use for live/eligible states. */
  active?: boolean;
}

const toneClass: Record<NonNullable<KPICardProps["tone"]>, string> = {
  default: "text-hud-accent",
  win:     "text-hud-win",
  loss:    "text-hud-loss",
  warn:    "text-hud-warn"
};

// Tone-specific hover glow. These classes are defined as PLAIN CSS in
// globals.css so they don't depend on Tailwind regenerating arbitrary
// `hover:shadow-*` variants — guarantees the colored hover always works.
const toneHoverClass: Record<NonNullable<KPICardProps["tone"]>, string> = {
  default: "",
  win:     "hud-card-hover-win",
  loss:    "hud-card-hover-loss",
  warn:    ""
};

/**
 * Single KPI tile. Big neon value, tiny label above, optional hint below.
 *
 * Visual upgrades vs. the base panel:
 *   - hover lift + scale via .hud-card-hover (200ms ease-out)
 *   - tone-aware hover glow (cyan / green / red / yellow)
 *   - the numeric value is wrapped in <AnimatedValue> so it slides+fades
 *     whenever it changes (e.g. after a trade is logged or deleted)
 *   - optional steady pulse for active/eligible states
 */
export function KPICard({
  label,
  value,
  hint,
  tone = "default",
  active = false
}: KPICardProps) {
  return (
    <div
      className={
        "hud-panel hud-card-hover scanlines p-4 " +
        toneHoverClass[tone] +
        (active ? " hud-glow-pulse" : "")
      }
    >
      <span className="hud-corner top-1 left-1  border-l-2 border-t-2" />
      <span className="hud-corner top-1 right-1 border-r-2 border-t-2" />
      <span className="hud-corner bottom-1 left-1  border-l-2 border-b-2" />
      <span className="hud-corner bottom-1 right-1 border-r-2 border-b-2" />

      <p className="hud-label">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-semibold tracking-tight ${toneClass[tone]}`}>
        <AnimatedValue>{value}</AnimatedValue>
      </p>
      {hint && (
        <p className="mt-1 text-[11px] text-hud-muted">
          <AnimatedValue>{hint}</AnimatedValue>
        </p>
      )}
    </div>
  );
}
