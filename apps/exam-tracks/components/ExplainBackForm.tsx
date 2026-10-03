"use client";
import { useState } from "react";
import { explainBack } from "@/app/actions";

export function ExplainBackForm(p: { topicId: string; title: string; prompt: string; modelAnswer: string }) {
  const [text, setText] = useState("");
  const [revealed, setRevealed] = useState(false);
  return (
    <form action={explainBack} className="mx-auto max-w-2xl space-y-5">
      <input type="hidden" name="topicId" value={p.topicId} />
      <div>
        <p className="text-sm text-muted">Explain it back · {p.title}</p>
        <h1 className="mt-1 text-xl font-semibold">{p.prompt}</h1>
        <p className="mt-2 text-muted">Write it as if you were explaining it to a friend. There's no grade. Putting it into your own words is what makes it stick.</p>
      </div>
      <label htmlFor="text" className="sr-only">Your explanation</label>
      <textarea id="text" name="text" value={text} onChange={(e) => setText(e.target.value)} readOnly={revealed}
        className="input min-h-40" placeholder="In my own words…" minLength={20} required />
      {!revealed ? (
        <button type="button" className="btn-primary" disabled={text.trim().length < 20} onClick={() => setRevealed(true)}>
          Compare with a model answer
        </button>
      ) : (
        <>
          <section className="card" aria-labelledby="model">
            <h2 id="model" className="label">Model answer</h2>
            <p className="mt-1">{p.modelAnswer}</p>
          </section>
          <fieldset className="space-y-2">
            <legend className="font-medium">How close was yours?</legend>
            {[
              ["matches", "I covered the main ideas"],
              ["partly", "I got some of it. I'll keep the rest in mind"],
              ["missed", "I missed a key idea. Good to know now"],
            ].map(([v, label], k) => (
              <label key={v} className="card flex cursor-pointer items-center gap-3 py-3 has-[:checked]:border-accent">
                <input type="radio" name="selfRating" value={v} defaultChecked={k === 0} /> {label}
              </label>
            ))}
          </fieldset>
          <button className="btn-primary">Done. Mark topic as mastered</button>
        </>
      )}
    </form>
  );
}
