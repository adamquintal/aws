export function Code({ code, lang }: { code: string; lang?: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-border bg-bg p-3 text-sm leading-snug" aria-label={lang ? `${lang} code` : "code"}>
      <code>{code}</code>
    </pre>
  );
}
