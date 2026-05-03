"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * AuthContainer — visual-only auth shell.
 *
 * One client component, three views (login / register / forgot) toggled
 * by internal state. No backend, no Supabase, no fetch — login and
 * register simply normalize the email and stash it in
 * sessionStorage("trading_user") before navigating to /dashboard.
 *
 * Submit-on-Enter is handled natively by <form onSubmit>; the primary
 * action button is type="submit" and secondary view-switch buttons are
 * explicitly type="button" so they don't accidentally submit the form.
 *
 * UX polish (mock-only):
 *   - Submit shows "Access granted" / "Link enviado (mock)" inline
 *   - 600ms delay before navigation so the user sees the confirmation
 *   - Button shows a busy label ("AUTHENTICATING…", etc.) during delay
 *   - The whole panel breathes subtly via .hud-panel-breathe
 */
type View = "login" | "register" | "forgot";

const REDIRECT_DELAY_MS = 600;

const subtitleFor = (view: View): string => {
  if (view === "login")    return "Operator login";
  if (view === "register") return "Create account";
  return "Password recovery";
};

const panelTitleFor = (view: View): string => {
  if (view === "login")    return "LOGIN";
  if (view === "register") return "REGISTER";
  return "RECOVERY";
};

const idleButtonLabel = (view: View): string => {
  if (view === "login")    return "INGRESAR";
  if (view === "register") return "CREAR CUENTA";
  return "ENVIAR LINK";
};

const busyButtonLabel = (view: View): string => {
  if (view === "login")    return "AUTHENTICATING…";
  if (view === "register") return "CREATING…";
  return "SENDING…";
};

export function AuthContainer() {
  const router = useRouter();

  const [view, setView]         = useState<View>("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  /**
   * Switch views. Clears password/confirm/error/success but preserves the
   * email so the user doesn't have to retype it when bouncing between
   * login ↔ register ↔ forgot.
   */
  function goTo(next: View): void {
    if (busy) return; // freeze view-switching during the redirect window
    setView(next);
    setPassword("");
    setConfirm("");
    setError(null);
    setSuccess(null);
  }

  function persistAndEnter(rawEmail: string): void {
    const normalized = rawEmail.trim().toLowerCase();
    try {
      sessionStorage.setItem("trading_user", normalized);
    } catch {
      // SSR / storage disabled — ignore, still navigate.
    }
    router.push("/dashboard");
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSuccess(null);

    if (view === "login") {
      if (!email.trim() || !password) {
        setError("All fields are required");
        return;
      }
      setBusy(true);
      setSuccess("Access granted");
      window.setTimeout(() => persistAndEnter(email), REDIRECT_DELAY_MS);
      return;
    }

    if (view === "register") {
      if (!email.trim() || !password || !confirm) {
        setError("All fields are required");
        return;
      }
      if (password !== confirm) {
        setError("Passwords don't match");
        return;
      }
      setBusy(true);
      setSuccess("Access granted");
      window.setTimeout(() => persistAndEnter(email), REDIRECT_DELAY_MS);
      return;
    }

    // forgot
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      setSuccess("Link enviado (mock)");
      setBusy(false);
    }, REDIRECT_DELAY_MS);
  }

  // ----- render --------------------------------------------------------
  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center space-y-6 py-10">
      {/* Header --------------------------------------------------------- */}
      <header className="text-center">
        <p className="hud-label">ACCESS TERMINAL</p>
        <h1 className="font-display text-3xl tracking-[0.25em] text-hud-neon">
          TRADING&nbsp;SYSTEM
        </h1>
        <p className="mt-2 text-xs uppercase tracking-[0.25em] text-hud-muted">
          {subtitleFor(view)}
        </p>
      </header>

      <div className="hud-divider" />

      {/* Panel ---------------------------------------------------------- */}
      <div className="hud-panel hud-panel-breathe scanlines relative p-6">
        <span className="hud-corner top-1 left-1  border-l-2 border-t-2" />
        <span className="hud-corner top-1 right-1 border-r-2 border-t-2" />
        <span className="hud-corner bottom-1 left-1  border-l-2 border-b-2" />
        <span className="hud-corner bottom-1 right-1 border-r-2 border-b-2" />

        <h3 className="mb-5 text-sm uppercase tracking-[0.25em] text-hud-neon">
          {panelTitleFor(view)}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Email — present in all 3 views */}
          <div>
            <label htmlFor="auth-email" className="hud-label block">
              EMAIL
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@system.io"
              disabled={busy}
              className="hud-input"
            />
          </div>

          {/* Password — login + register */}
          {(view === "login" || view === "register") && (
            <div>
              <label htmlFor="auth-password" className="hud-label block">
                PASSWORD
              </label>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={view === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={busy}
                className="hud-input"
              />
            </div>
          )}

          {/* Confirm — register only */}
          {view === "register" && (
            <div>
              <label htmlFor="auth-confirm" className="hud-label block">
                CONFIRM PASSWORD
              </label>
              <input
                id="auth-confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                disabled={busy}
                className="hud-input"
              />
            </div>
          )}

          {/* Inline messages */}
          {error && (
            <p className="text-xs uppercase tracking-[0.18em] text-hud-loss">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs uppercase tracking-[0.18em] text-hud-neon">
              › {success}
            </p>
          )}

          {/* Primary action */}
          <button
            type="submit"
            disabled={busy}
            className="hud-button w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              busyButtonLabel(view)
            ) : (
              <>
                {idleButtonLabel(view)} <span aria-hidden="true">→</span>
              </>
            )}
          </button>
        </form>

        {/* Secondary navigation ---------------------------------------- */}
        <div className="mt-5 flex flex-col items-center gap-2 text-[11px] uppercase tracking-[0.25em]">
          {view === "login" && (
            <>
              <button
                type="button"
                onClick={() => goTo("register")}
                disabled={busy}
                className="text-hud-muted transition hover:text-hud-neon disabled:opacity-40"
              >
                Crear cuenta
              </button>
              <button
                type="button"
                onClick={() => goTo("forgot")}
                disabled={busy}
                className="text-hud-muted transition hover:text-hud-neon disabled:opacity-40"
              >
                Olvidé mi contraseña
              </button>
            </>
          )}
          {(view === "register" || view === "forgot") && (
            <button
              type="button"
              onClick={() => goTo("login")}
              disabled={busy}
              className="text-hud-muted transition hover:text-hud-neon disabled:opacity-40"
            >
              ← Volver a login
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
