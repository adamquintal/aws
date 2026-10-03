/** Plain-language wording for a pass probability. Calm and honest: no false precision. */
export function passPhrase(p: number): string {
  if (p >= 0.9) return "Very likely to pass";
  if (p >= 0.7) return "Likely to pass";
  if (p >= 0.4) return "Could go either way";
  if (p >= 0.15) return "Not likely yet";
  return "Not there yet";
}
