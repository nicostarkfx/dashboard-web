"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * AuthContainer — visual-only auth shell.
 *
 * One client component, three views (login / register / forgot) toggled
 * by internal state. No backend, no Supabase, no fetch — login and
 * register simply normalize the email and stash it in
 * sessionStorage("jarvis_user") before navigating to /dashboard.
 *
 * Submit-on-Enter is handled natively by <form onSubmit>; the primary
 * action button is type="submit" and secondary view-switch buttons are
 * explicitly type="button" so they don't accidentally submit the form.
 */
type View = "login" | "register" | "forgot";

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
    setView(next);
    setPassword("");
    setConfirm("");
    setError(null);
    setSuccess(null);
  }

  function persistAndEnter(rawEmail: string): void {
    const normalized = rawEmail.trim().toLowerCase();
    try {
      sessionStorage.setItem("jarvis_user", normalized);
    } catch {
      // SSR / storage disabled — ignore, still navigate.
    }
    router.push("/dashboard");
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (view === "login") {
      if (!email.trim() || !password) {
        setError("Email and password are required.");
        return;
      }
      setBusy(true);
      persistAndEnter(email);
      return;
    }

    if (view === "register") {
      if (!email.trim() || !password || !confirm) {
        setError("All fields are required.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords don't match.");
        return;
      }
      setBusy(true);
      persistAndEnter(email);
      return;
    }

    // forgot
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    setSuccess("Link enviado (mock)");
  }

  // ----- render --------------------------------------------------------
  const inputClass =
    "w-full bg-transparent border-b border-hud-muted/40 px-0 py-2 " +
    "font-mono text-hud-neon placeholder:text-hud-muted/40 " +
    "focus:outline-none focus:border-hud-neon transition";

  return (
    <main className="mx-auto flex min-h-[80vh] w-full max-w-md flex-col justify-center space-y-6 py-10">
      {/* Header --------------------------------------------------------- */}
      <header className="text-center">
        <p className="hud-label">ACCESS TERMINAL</p>
        <h1 className="font-display text-3xl tracking-[0.25em] text-hud-neon">
          JARVIS&nbsp;TRADING&nbsp;SYSTEM
        </h1>
        <p className="mt-2 text-xs uppercase tracking-[0.25em] text-hud-muted">
          {subtitleFor(view)}
        </p>
      </header>

      <div className="hud-divider" />

      {/* Panel ---------------------------------------------------------- */}
      <div className="hud-panel scanlines relative p-6">
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
              placeholder="operator@jarvis.io"
              className={inputClass}
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
                className={inputClass}
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
                className={inputClass}
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
            className="hud-button w-full justify-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            {view === "login"    && <>INGRESAR <span aria-hidden="true">→</span></>}
            {view === "register" && <>CREAR CUENTA <span aria-hidden="true">→</span></>}
            {view === "forgot"   && <>ENVIAR LINK <span aria-hidden="true">→</span></>}
          </button>
        </form>

        {/* Secondary navigation ---------------------------------------- */}
        <div className="mt-5 flex flex-col items-center gap-2 text-[11px] uppercase tracking-[0.25em]">
          {view === "login" && (
            <>
              <button
                type="button"
                onClick={() => goTo("register")}
                className="text-hud-muted transition hover:text-hud-neon"
              >
                Crear cuenta
              </button>
              <button
                type="button"
                onClick={() => goTo("forgot")}
                className="text-hud-muted transition hover:text-hud-neon"
              >
                Olvidé mi contraseña
              </button>
            </>
          )}
          {(view === "register" || view === "forgot") && (
            <button
              type="button"
              onClick={() => goTo("login")}
              className="text-hud-muted transition hover:text-hud-neon"
            >
              ← Volver a login
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
