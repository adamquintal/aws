import Link from "next/link";
import { IconExam, IconPath, IconProgress, IconStudy } from "./Icons";

const TABS = [
  { key: "study", href: "/today", label: "Study", Icon: IconStudy },
  { key: "path", href: "/topics", label: "Path", Icon: IconPath },
  { key: "exams", href: "/exams", label: "Exams", Icon: IconExam },
  { key: "progress", href: "/dashboard", label: "Progress", Icon: IconProgress },
] as const;

/** Bottom tab bar for the home screens. Fixed to the bottom, safe-area aware. */
export function TabBar({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <>
      <div aria-hidden className="h-[calc(84px+env(safe-area-inset-bottom))]" />
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid h-[72px] max-w-xl grid-cols-4">
          {TABS.map(({ key, href, label, Icon }) => {
            const on = key === active;
            return (
              <li key={key}>
                <Link href={href} aria-current={on ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-1 text-xs ${on ? "font-semibold text-fg" : "text-muted"}`}>
                  <Icon />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
