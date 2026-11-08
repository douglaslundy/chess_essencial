// Pure helpers of the openings study: PGN -> moves, the AI prompt and the spaced repetition.
export const OPENING_PROMPT_VERSION = 1;
export const OPENING_CHUNK_STEPS = 10;

/** "1. e4 c5 2. Nf3" -> ["e4", "c5", "Nf3"] */
export function pgnMoves(pgn: string): string[] {
  return pgn
    .split(/\s+/)
    .map((token) => token.replace(/^\d+\.+/, ''))
    .filter(Boolean);
}

export const OPENING_SYSTEM_PROMPT = `Você é um treinador de xadrez brasileiro que ensina aberturas a alunos de todos os níveis. Explique com clareza, sem jargão sem explicação, o PORQUÊ de cada lance: a ideia, o que ele controla ou prepara, e como ele se encaixa no plano da abertura.

Regras obrigatórias:
- Sempre diga o nome da peça e as casas por extenso: "o cavalo de g1 vai para f3". Nunca use só a notação.
- Os "Fatos do tabuleiro" de cada lance foram calculados e são verdadeiros: apoie-se neles e não os contradiga.
- Use SOMENTE o nome da abertura e as alternativas fornecidos nos dados. Não invente variantes, nomes, estatísticas nem partidas famosas.
- Quando um lance for a resposta do adversário, diga por que ele a joga e o que o estudante deve pensar em resposta.
- Português do Brasil, frases curtas, sem markdown, sem emojis, no máximo 40 palavras por lance.`;

export interface OpeningContext {
  alternatives: string[];
  eco: string;
  name: string;
  side: 'black' | 'white';
}

export function overviewPrompt(context: OpeningContext, moves: string[]): string {
  const side = context.side === 'white' ? 'brancas' : 'pretas';
  const alternatives =
    context.alternatives.length > 0
      ? ` Nesta posição, o adversário também pode seguir por: ${context.alternatives.join('; ')}.`
      : '';
  return `Abertura: ${context.name} (ECO ${context.eco}). Lado estudado: ${side}. Lances: ${moves.join(' ')}.${alternatives}

Escreva a visão geral (no máximo 110 palavras): a ideia central, quando vale escolher esta linha, o plano do lado estudado e o principal cuidado. Se houver alternativas do adversário, diga em uma frase como o estudante deve se adaptar quando o adversário sair desta linha. Responda só com o texto.`;
}

export interface SpacedState {
  ease: number;
  intervalDays: number;
  repetitions: number;
}

/** SM-2 style schedule: a right answer lengthens the interval, a wrong one brings it back soon. */
export function nextReview(
  state: SpacedState,
  correct: boolean,
  now: Date,
): SpacedState & { dueAt: Date } {
  if (!correct) {
    return {
      dueAt: new Date(now.getTime() + 10 * 60 * 1000),
      ease: Math.max(1.3, Math.round((state.ease - 0.2) * 100) / 100),
      intervalDays: 0,
      repetitions: 0,
    };
  }
  const repetitions = state.repetitions + 1;
  const intervalDays =
    repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(state.intervalDays * state.ease);
  return {
    dueAt: new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000),
    ease: Math.min(3, Math.round((state.ease + 0.1) * 100) / 100),
    intervalDays,
    repetitions,
  };
}
