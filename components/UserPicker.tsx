"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MOCK_USERS, type MockUser } from "@/lib/mockUsers";

/**
 * Access terminal at "/".
 *
 * Visual-only multi-user picker — no auth, no Supabase. The selected
 * user's id is stashed in sessionStorage("jarvis_user") so future per-user
 * filtering can read it; today /dashboard ignores the value.
 *
 * UX:
 *   - Click an unselected card → select it (neon ring)
 *   - Click the already-selected card → enter (same as ENTRAR)
 *   - Click the ENTRAR button → enter
 *   - Enter key on a focused card → enter (keyboard parity)
 *
 * "Enter" = persist + router.push("/dashboard").
 */
export function UserPicker() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function enter(user: MockUser) {
    try {
      sessionStorage.setItem("jarvis_user", user.id);
    } catch {
      // SSR / disabled storage — just navigate without persistence.
    }
    router.push("/dashboard");
  }

  function handleCardClick(user: MockUser) {
    if (selectedId === user.id) {
      enter(user);
    } else {
      setSelectedId(user.id);
    }
  }

  function handleEnter() {
    const user = MOCK_USERS.find((u) => u.id === selectedId);
    if (user) enter(user);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_USERS.map((u) => {
          const isSelected = selectedId === u.id;
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => handleCardClick(u)}
              aria-pressed={isSelected}
              className={[
                "hud-panel hud-card-hover scanlines relative p-5 text-left transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-hud-neon",
                isSelected
                  ? "ring-2 ring-hud-neon shadow-[0_0_24px_rgba(0,255,200,0.18)]"
                  : "",
              ].join(" ")}
            >
              <span className="hud-corner top-1 left-1  border-l-2 border-t-2" />
              <span className="hud-corner top-1 right-1 border-r-2 border-t-2" />
              <span className="hud-corner bottom-1 left-1  border-l-2 border-b-2" />
              <span className="hud-corner bottom-1 right-1 border-r-2 border-b-2" />

              <div className="flex items-center gap-4">
                <div
                  className={[
                    "flex h-14 w-14 items-center justify-center rounded-full border font-mono text-lg tracking-[0.15em]",
                    isSelected
                      ? "border-hud-neon text-hud-neon"
                      : "border-hud-muted/40 text-hud-muted",
                  ].join(" ")}
                >
                  {u.initials}
                </div>
                <div>
                  <p className="hud-label">{u.role}</p>
                  <p className="mt-1 font-display text-lg tracking-[0.15em] text-hud-neon">
                    {u.name}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-hud-muted">
                    {isSelected ? "Click again to enter" : "Click to select"}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          className="hud-button disabled:cursor-not-allowed disabled:opacity-40"
          onClick={handleEnter}
          disabled={!selectedId}
        >
          ENTRAR <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
