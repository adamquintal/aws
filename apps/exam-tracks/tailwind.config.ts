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
        muted: "rgb(var(--muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        good: "rgb(var(--good) / <alpha-value>)",
        gentle: "rgb(var(--gentle) / <alpha-value>)",
      },
    },
  },
  plugins: [],
} satisfies Config;
