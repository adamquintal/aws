"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      className="btn-ghost min-h-10 px-3 text-sm"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {mounted ? (dark ? "☀︎ Light" : "☾ Dark") : "Theme"}
    </button>
  );
}
