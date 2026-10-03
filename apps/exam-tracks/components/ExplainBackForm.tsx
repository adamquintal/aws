"use client";
import { useState } from "react";
import { explainBack } from "@/app/actions";

const RATINGS = [
  ["matches", "I covered the main ideas"],
  ["partly", "I got some of it"],
  ["missed", "I missed a key idea. Good to know now"],
] as const;

export function ExplainBackForm(p: { topicId: string; title: string; prompt: string; modelAnswer: string }) {
  const [text, setText] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [rating, setRating] = useState<string>("matches");
  return (
    <form action={explainBack} id="main" className="page flex flex-col gap-6 pb-36 pt-9">
      <input type="hidden" name="topicId" value={p.topicId} />
      <input type="hidden" name="selfRating" value={rating} />
      <div className="flex flex-col gap-3">
        <p className="eyebrow">{p.title}</p>
        <h1 className="font-serif text-[30px] font-normal leading-[1.2]">{p.prompt}</h1>
        <p className="text-[16px] leading-relaxed text-soft">Write it as if explaining to a friend. There’s no grade. Putting it in your own words is what makes it stick.</p>
      </div>
      <label htmlFor="text" className="sr-only">Your explanation</label>
      <textarea
        id="text" name="text" value={text} onChange={(e) => setText(e.target.value)} readOnly={revealed} required minLength={20}
        placeholder="In my own words…"
        className="min-h-48 w-full rounded-2xl border border-border bg-surface p-4 text-[17px] leading-relaxed text-fg placeholder:text-muted read-only:opacity-80"
      />
      {revealed && (
        <>
          <section aria-labelledby="model" className="flex flex-col gap-2">
            <h2 id="model" className="eyebrow">Model answer</h2>
            <p className="m-0 font-serif text-[20px] leading-[1.45] text-fg">{p.modelAnswer}</p>
          </section>
          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-2 text-[15px] font-semibold">How close was yours?</legend>
            <div className="border-t border-border">
              {RATINGS.map(([v, label]) => (
                <label key={v} className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border text-[16px]">
                  <input type="radio" name="rating-ui" checked={rating === v} onChange={() => setRating(v)} className="h-5 w-5 accent-[rgb(var(--accent))]" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="page py-4">
          {!revealed ? (
            <button key="compare" type="button" className="btn-primary w-full" disabled={text.trim().length < 20}
              onClick={(e) => { e.preventDefault(); setRevealed(true); }}>
              Compare with a model answer
            </button>
          ) : (
            // Distinct key: React must not reuse the "compare" button, or the same tap submits the form.
            <button key="submit" type="submit" className="btn-primary w-full">Done · mark topic mastered</button>
          )}
        </div>
      </div>
    </form>
  );
}
