import type { Config } from "tailwindcss";

/**
 * Haulora brand tokens.
 *   bitumen  warm, near-black neutral for text, dark surfaces and the grey scale
 *   rust     the single dominant accent (CTAs, the mark, active states)
 *   gum      supporting teal-green for success and "live"
 *   status.* load status colours used on the map legend and status chips
 */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bitumen: {
          DEFAULT: "#1C1A17",
          50:  "#FAF8F5",
          100: "#F3F0EB",
          200: "#E6E1D9",
          300: "#CFC8BD",
          400: "#A39C91",
          500: "#78716A",
          600: "#57524C",
          700: "#403C37",
          800: "#2A2724",
          900: "#1C1A17",
          950: "#121110",
        },
        rust: {
          DEFAULT: "#B4471C",
          50:  "#FBF1EA",
          100: "#F6DFCF",
          200: "#EDBFA0",
          300: "#E29A6E",
          400: "#D1703D",
          500: "#B4471C",
          600: "#963A16",
          700: "#782E12",
          800: "#5C230E",
          900: "#3F180A",
        },
        gum: {
          DEFAULT: "#178A6E",
          50:  "#EAF6F2",
          100: "#CFEBE1",
          200: "#A3D9C6",
          300: "#6DC0A5",
          400: "#3BA487",
          500: "#178A6E",
          600: "#0F6F59",
          700: "#0D5847",
          800: "#0B4538",
          900: "#08352B",
        },
        status: {
          enroute:  "#2563EB",
          planned:  "#8A8780",
          rerouted: "#178A6E",
          held:     "#D97706",
          delayed:  "#DC2626",
        },
        canvas: "#F7F4EE",
      },
      borderRadius: {
        "xl":  "0.75rem",
        "2xl": "1rem",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card:      "0 1px 2px rgba(28,26,23,0.05)",
        "card-lg": "0 6px 20px rgba(28,26,23,0.08)",
        glow:      "0 0 0 1px rgba(180,71,28,0.25), 0 10px 28px rgba(180,71,28,0.22)",
      },
      backgroundImage: {
        "grid-dark":
          "linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)",
        "hero-glow":
          "radial-gradient(ellipse 70% 60% at 15% 0%, rgba(180,71,28,0.28), transparent 60%), radial-gradient(ellipse 50% 45% at 100% 100%, rgba(23,138,110,0.18), transparent 60%)",
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
