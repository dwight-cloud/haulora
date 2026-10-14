import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0B1E3F",
          50:  "#F2F5FA",
          100: "#E2E8F2",
          200: "#C2CEE1",
          300: "#93A6C4",
          400: "#5F78A1",
          500: "#37507E",
          600: "#243B63",
          700: "#162B4D",
          800: "#0B1E3F",
          900: "#061433",
          950: "#030B21",
        },
        // "Clear Path blue" — primary accent from the Gorilla Safety brand
        signal: {
          DEFAULT: "#1F8BFF",
          50:  "#EAF3FF",
          100: "#D0E3FF",
          200: "#A2C7FF",
          300: "#73ABFF",
          400: "#458FFF",
          500: "#1F8BFF",
          600: "#0B6FDE",
          700: "#0856AE",
          800: "#073E7D",
          900: "#04274E",
        },
        // Retained orange accent (matches the gorilla eye + CTA contrast)
        ember: {
          DEFAULT: "#FF6B1A",
          300: "#FFA166",
          500: "#FF6B1A",
          700: "#B34200",
        },
        offwhite: "#F7F5F0",
        // Neutral grayscale — used for text hierarchy, borders, surfaces.
        // Separate from `navy` (brand) so we don't have to express "muted text"
        // as `text-navy/60` everywhere. Close to Samsara/Linear neutrals.
        ink: {
          50:  "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
      },
      borderRadius: {
        "xl":  "0.75rem",   // 12px — cards
        "2xl": "1rem",      // 16px — hero cards
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Softer, closer to Samsara/Linear. Cards rely on the 1px border primarily.
        card:       "0 1px 2px rgba(15,23,42,0.04)",
        "card-lg":  "0 4px 16px rgba(15,23,42,0.06)",
        glow:       "0 0 0 1px rgba(31,139,255,0.20), 0 8px 24px rgba(31,139,255,0.22)",
        inset:      "inset 0 1px 0 rgba(255,255,255,0.08)",
      },
      backgroundImage: {
        "grid-navy":
          "linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)",
        "hero-glow":
          "radial-gradient(ellipse 80% 60% at 20% 0%, rgba(31,139,255,0.22), transparent 60%), radial-gradient(ellipse 60% 50% at 100% 100%, rgba(255,107,26,0.14), transparent 60%)",
      },
      keyframes: {
        "fade-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
