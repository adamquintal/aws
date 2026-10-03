import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        soft: "rgb(var(--soft) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        track: "rgb(var(--track) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        good: "rgb(var(--accent) / <alpha-value>)",
        gentle: "rgb(var(--gentle) / <alpha-value>)",
        trap: "rgb(var(--trap) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "on-ink": "rgb(var(--on-ink) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["'Instrument Sans'", "system-ui", "sans-serif"],
        serif: ["'Instrument Serif'", "Georgia", "serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
