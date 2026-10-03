export function Code({ code, lang }: { code: string; lang?: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-[#16181D] p-4 font-mono text-[13px] leading-[1.7] text-[#E6E6E1]" aria-label={lang ? `${lang} code` : "code"}>
      <code>{code}</code>
    </pre>
  );
}
