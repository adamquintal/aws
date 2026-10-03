"use client";
import { useEffect, useState } from "react";

/** Hidden field pre-filled with the browser's timezone, so day boundaries match the learner's day. */
export function TimezoneField({ defaultValue }: { defaultValue?: string }) {
  const [tz, setTz] = useState(defaultValue ?? "UTC");
  useEffect(() => {
    if (!defaultValue || defaultValue === "UTC") setTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [defaultValue]);
  return <input type="hidden" name="timezone" value={tz} />;
}
