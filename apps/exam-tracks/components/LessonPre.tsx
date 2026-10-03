import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import { parse } from "@/lib/promql/parse";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** Lesson code block. PromQL examples that parse as one query get a "Try it" link to the playground. */
export function LessonPre({ children, ...rest }: { children?: ReactNode }) {
  const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : null;
  const isPromql = code?.props.className?.includes("language-promql");
  let queries: string[] = [];
  if (isPromql) {
    const text = textOf(code!.props.children).trim();
    const ok = (q: string) => { try { parse(q); return true; } catch { return false; } };
    // A block is either one query, or several one-line examples (with # comments).
    if (ok(text)) queries = [text];
    else queries = text.split("\n").map((l) => l.replace(/\s+#.*$/, "").trim()).filter((l) => l && !l.startsWith("#") && ok(l)).slice(0, 6);
  }
  return (
    <div className="my-4">
      <pre {...rest}>{children}</pre>
      {queries.length === 1 && (
        <Link href={`/playground?q=${encodeURIComponent(queries[0])}`} className="mt-1.5 inline-block text-[13px] font-medium text-accent underline-offset-4 hover:underline">
          Try it in the playground →
        </Link>
      )}
      {queries.length > 1 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px]">
          <span className="text-muted">Try:</span>
          {queries.map((q) => (
            <Link key={q} href={`/playground?q=${encodeURIComponent(q)}`} className="max-w-full truncate rounded-md border border-border bg-surface px-2 py-0.5 font-mono text-[12px] text-accent hover:border-muted">{q}</Link>
          ))}
        </div>
      )}
    </div>
  );
}
