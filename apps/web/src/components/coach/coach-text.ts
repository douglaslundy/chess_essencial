/**
 * Splits a Treinador message into a short lead (first sentences, capped in length)
 * and the rest, so the balloon stays compact and the rest opens on "ver mais".
 */
export function splitCoachText(
  text: string,
  maxSentences = 2,
  maxChars = 220,
): { lead: string; rest: string } {
  const clean = text.replace(/\s+/g, ' ').trim();
  const boundary = /[.!?…]+(?=\s|$)/g;
  let end = clean.length;
  for (let count = 1, match = boundary.exec(clean); match; match = boundary.exec(clean), count++) {
    if (count === maxSentences) {
      end = match.index + match[0].length;
      break;
    }
  }
  if (end > maxChars) {
    const cut = clean.lastIndexOf(' ', maxChars);
    end = cut > 0 ? cut : maxChars;
  }
  const lead = clean.slice(0, end).trim();
  const rest = clean.slice(end).trim();
  return { lead: rest && !/[.!?…]$/.test(lead) ? `${lead}…` : lead, rest };
}
