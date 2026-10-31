import { libraryReviewEntrySchema, type LibraryReviewEntry } from '@xadrez/contracts';
import { Chess } from 'chess.js';
import { z } from 'zod';

export const LIBRARY_REVIEW_SYSTEM_PROMPT = `Você é um treinador de xadrez brasileiro que comenta partidas históricas para estudo. Para cada lance pedido, explique o pensamento do jogador.

Regras obrigatórias:
- Português do Brasil, frases curtas e diretas, sem rodeios, sem markdown, sem emojis.
- Use SOMENTE as notações, peças e casas presentes nos dados fornecidos. Nunca invente variantes longas.
- Campos por lance (todos curtos):
  summary: narração falada do lance em até 30 palavras (o que foi jogado e a ideia principal).
  why: por que o jogador jogou isso e o que provavelmente previa (até 25 palavras).
  strength: ponto forte (até 15 palavras) ou null.
  weakness: o que o lance deixou vulnerável (até 15 palavras) ou null.
  better: SAN de um lance claramente mais eficiente na posição, ou null se o lance jogado já foi o melhor ou se você não tiver certeza.
  betterWhy: estratégia do lance melhor (até 20 palavras) ou null (obrigatório null se better for null).
  expect: o que se espera do adversário em resposta (até 15 palavras) ou null.
- Se não houver certeza sobre uma avaliação, seja honesto e use null em vez de inventar.
- Responda SOMENTE com um array JSON, um objeto por lance pedido, na mesma ordem: [{"ply":N,"summary":"","why":"","strength":null,"weakness":null,"better":null,"betterWhy":null,"expect":null}]`;

export interface ReviewGameHeader {
  black: string;
  event: string | null;
  openingName: string | null;
  playedOn: string | null;
  result: string;
  white: string;
}

export const CHUNK_PLIES = 10;

export function chunkEnd(totalPlies: number, from: number) {
  return Math.min(totalPlies, from + CHUNK_PLIES - 1);
}

export function buildChunkPrompt(header: ReviewGameHeader, moves: string[], from: number) {
  const chess = new Chess();
  const lines: string[] = [];
  const to = chunkEnd(moves.length, from);
  for (let i = 0; i < to; i += 1) {
    if (i + 1 >= from) {
      const color = i % 2 === 0 ? 'Brancas' : 'Pretas';
      lines.push(`ply ${i + 1} (${color}) ${moves[i]} | posição antes: ${chess.fen()}`);
    }
    chess.move(moves[i]!);
  }
  const numbered = moves.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' ');
  return `Partida: ${header.white} (brancas) x ${header.black} (pretas), ${header.event ?? 'evento n/d'}, ${header.playedOn ?? 'data n/d'}, resultado ${header.result}. Abertura: ${header.openingName ?? 'n/d'}.
Lances completos: ${numbered}

Comente exatamente estes lances:
${lines.join('\n')}`;
}

const rawEntrySchema = libraryReviewEntrySchema.partial({
  better: true,
  betterWhy: true,
  expect: true,
  strength: true,
  weakness: true,
});

function clip(value: string | null | undefined, max: number) {
  const text = value?.trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Parses the model output, drops unusable rows and rejects "better" moves that are not legal. */
export function parseChunkResponse(
  raw: string,
  moves: string[],
  from: number,
  to: number,
): LibraryReviewEntry[] {
  const json = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
  const parsed = z.array(rawEntrySchema).parse(JSON.parse(json));
  const out: LibraryReviewEntry[] = [];
  for (const item of parsed) {
    if (item.ply < from || item.ply > to) continue;
    const chess = new Chess();
    for (let i = 0; i < item.ply - 1; i += 1) chess.move(moves[i]!);
    let better = clip(item.better, 12);
    if (better) {
      try {
        const legal = chess.move(better).san;
        better = legal === moves[item.ply - 1] ? null : legal;
      } catch {
        better = null;
      }
    }
    out.push({
      better,
      betterWhy: better ? clip(item.betterWhy, 200) : null,
      expect: clip(item.expect, 160),
      ply: item.ply,
      strength: clip(item.strength, 160),
      summary: clip(item.summary, 280) ?? '',
      weakness: clip(item.weakness, 160),
      why: clip(item.why, 240) ?? '',
    });
  }
  return out.filter((entry) => entry.summary && entry.why);
}
