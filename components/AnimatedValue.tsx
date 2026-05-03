"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  /** The value to render. When this changes, the wrapper replays the flash animation. */
  children: ReactNode;
  className?: string;
}

/**
 * Lightweight wrapper that re-runs a CSS animation whenever its rendered
 * value changes. Achieved by keying the inner span on a counter that
 * increments on each prop change — React unmounts/remounts the span, which
 * resets the CSS animation cleanly without any animation library.
 *
 * Compare via the rendered string so that ReactNode children are diffed
 * by their visible representation, not by referential identity.
 */
export function AnimatedValue({ children, className = "" }: Props) {
  const [pulseKey, setPulseKey] = useState(0);
  const prevRef = useRef<string>(stringify(children));

  useEffect(() => {
    const next = stringify(children);
    if (next !== prevRef.current) {
      prevRef.current = next;
      setPulseKey((k) => k + 1);
    }
  }, [children]);

  return (
    <span
      key={pulseKey}
      className={`inline-block animate-value-flash will-change-transform ${className}`}
    >
      {children}
    </span>
  );
}

function stringify(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(stringify).join("");
  // For React elements we fall back to JSON of props.children when present.
  if (typeof node === "object" && "props" in (node as any)) {
    return stringify((node as any).props?.children);
  }
  return "";
}
