import type { Config } from "tailwindcss";

/**
 * HUD design tokens for the trading dashboard.
 *
 * Palette is intentionally narrow: a deep navy/black canvas, a single neon
 * cyan as the primary, electric blue as the secondary, plus three semantic
 * tones (win / loss / warn). All animations are CSS-only — no runtime libs.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        display: ["Orbitron", "ui-sans-serif", "system-ui"]
      },
      colors: {
        hud: {
          bg:       "#04070d",
          panel:    "#0a121f",
          border:   "#0e2236",
          grid:     "#0f223a",
          text:     "#cfeefb",
          muted:    "#5d7891",
          neon:     "#22d3ee",   // cyan
          neon2:    "#3b82f6",   // electric blue
          accent:   "#7df9ff",
          win:      "#39ff8b",
          loss:     "#ff5577",
          warn:     "#facc15"
        }
      },
      boxShadow: {
        neon:        "0 0 12px rgba(34, 211, 238, 0.45), inset 0 0 12px rgba(34, 211, 238, 0.08)",
        "neon-soft": "0 0 8px rgba(34, 211, 238, 0.25)",
        "neon-hover":"0 0 28px rgba(34, 211, 238, 0.55), 0 0 60px rgba(59, 130, 246, 0.20), inset 0 0 16px rgba(34, 211, 238, 0.12)",
        "neon-pink": "0 0 12px rgba(255, 85, 119, 0.45)",
        "neon-win":  "0 0 14px rgba(57, 255, 139, 0.40)",
        "neon-loss": "0 0 14px rgba(255, 85, 119, 0.40)"
      },
      backgroundImage: {
        "hud-grid":
          "linear-gradient(rgba(34,211,238,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.07) 1px, transparent 1px)"
      },
      backgroundSize: { "hud-grid": "32px 32px" },
      keyframes: {
        // Existing scan + glow
        scan: {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" }
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 8px rgba(34,211,238,0.25)" },
          "50%":      { boxShadow: "0 0 18px rgba(34,211,238,0.6)" }
        },
        // Slow background grid drift — one full 32px cell over 40s so it loops
        // seamlessly with the underlying repeating pattern.
        "grid-drift": {
          "0%":   { transform: "translate3d(0, 0, 0)" },
          "100%": { transform: "translate3d(32px, 32px, 0)" }
        },
        // Stronger pulse for active/eligible elements.
        "pulse-glow": {
          "0%, 100%": {
            boxShadow:
              "0 0 8px rgba(34,211,238,0.30), 0 0 0 0 rgba(34,211,238,0.20)"
          },
          "50%": {
            boxShadow:
              "0 0 22px rgba(34,211,238,0.65), 0 0 36px rgba(59,130,246,0.30)"
          }
        },
        // New row arrival in the trade ledger / fresh KPI render.
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        // Number/value change animation — bigger slide, quicker.
        "value-flash": {
          "0%":   { opacity: "0", transform: "translateY(-4px)" },
          "60%":  { opacity: "1" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        scan:         "scan 6s linear infinite",
        glow:         "glow 2.5s ease-in-out infinite",
        "grid-drift": "grid-drift 40s linear infinite",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        "fade-up":    "fade-up 220ms ease-out both",
        "value-flash":"value-flash 260ms ease-out both"
      }
    }
  },
  plugins: []
};

export default config;
