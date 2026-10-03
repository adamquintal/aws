import Link from "next/link";
import { IconBack, IconClose } from "./Icons";

/** Minimal top bar for focus screens (lesson, session, explain): one way out, a centred label. */
export function FocusHeader({ href, label, close = false }: { href: string; label?: string; close?: boolean }) {
  const link = (
    <Link href={href} aria-label={close ? "Close" : "Back"} className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center">
      {close ? <IconClose size={20} /> : <IconBack />}
    </Link>
  );
  if (!label) return link;
  return (
    <div className="flex items-center justify-between">
      {link}
      {label && <span className="text-[13px] text-muted">{label}</span>}
      <span className="w-11" />
    </div>
  );
}
