"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [["system", "Auto"], ["light", "Light"], ["dark", "Dark"]] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-xl border border-border bg-surface p-1">
      {OPTIONS.map(([v, label]) => {
        const on = mounted && (theme ?? "system") === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setTheme(v)}
            className={`h-9 rounded-lg px-3 text-sm ${on ? "bg-ink font-semibold text-on-ink" : "text-muted"}`}>
            {label}
          </button>
        );
      })}
    </div>
  );
}
