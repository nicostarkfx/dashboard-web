import type { ReactNode } from "react";

interface HudPanelProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
  /**
   * Classes applied to the body wrapper that holds {children}.
   * The wrapper is always a `flex flex-1 min-h-0 flex-col` so descendants
   * can fill available vertical space when the panel itself has a bounded
   * height (e.g. via grid row height). Pass `"overflow-y-auto"` here when
   * the panel should scroll its body internally.
   */
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * The standard framed panel used everywhere on the dashboard. Adds the
 * decorative neon corners and an optional header with title/subtitle/action.
 *
 * Layout:
 *   - panel root is `flex flex-col` so its children stack vertically
 *   - header is `shrink-0` so it never collapses
 *   - body is `flex-1 min-h-0` so it claims all leftover height AND can be
 *     a scroll container (min-h-0 is the magic that lets a flex child
 *     overflow its parent instead of forcing its parent to grow)
 *
 * This makes side-by-side panels in a fixed-height grid row visually
 * symmetric: both fill the row, both can scroll their own bodies.
 */
export function HudPanel({
  title,
  subtitle,
  right,
  className = "",
  bodyClassName = "",
  children
}: HudPanelProps) {
  return (
    <div className={`hud-panel flex flex-col p-6 ${className}`}>
      <span className="hud-corner top-1 left-1  border-l-2 border-t-2" />
      <span className="hud-corner top-1 right-1 border-r-2 border-t-2" />
      <span className="hud-corner bottom-1 left-1  border-l-2 border-b-2" />
      <span className="hud-corner bottom-1 right-1 border-r-2 border-b-2" />

      {(title || right) && (
        <header className="mb-5 flex shrink-0 items-end justify-between gap-4">
          <div>
            {title && (
              <h3 className="text-sm font-medium uppercase tracking-[0.25em] text-hud-neon">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-2 text-xs text-hud-muted">{subtitle}</p>
            )}
          </div>
          {right}
        </header>
      )}

      <div className={`flex flex-1 min-h-0 flex-col ${bodyClassName}`}>
        {children}
      </div>
    </div>
  );
}
