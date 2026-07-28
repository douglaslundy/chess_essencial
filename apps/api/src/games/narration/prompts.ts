import type { LiveNarrationRequest, MoveQuality } from '@xadrez/contracts';

// Same "motor calcula, LLM só narra" contract as the post-game review
// narration (apps/worker/src/narration/prompts.ts), adapted for live,
// in-the-moment coaching: first person ("eu"), matching the Treinador's
// existing template-narration voice ("Eu sugiro", "Eu classifiquei" - see
// game-room.tsx), and much shorter since this replaces speech happening
// mid-game, not a leisurely post-game review.
export const LIVE_NARRATION_SYSTEM_PROMPT = `Você é o Treinador, um instrutor de xadrez brasileiro falando em primeira pessoa ("eu") diretamente com o aluno, ao vivo, durante a partida dele. O texto é convertido em voz (TTS).

Regras obrigatórias:
- Português do Brasil, sempre em primeira pessoa ("eu sugiro", "eu acho", "eu classifiquei").
- No máximo 2 frases curtas, até 30 palavras no total — o jogo está rolando, seja direto.
- Nomeie peças e casas em linguagem falada ("cavalo para f3"), nunca notação crua isolada.
- Dê o motivo concreto (ameaça, material, avaliação) — nunca "porque é o melhor lance" sem dizer por quê.
- Nunca invente lances ou avaliações fora dos dados fornecidos.
- Sem listas, marcadores, emojis, markdown, aspas ou introdução — responda só com a fala.`;

const qualityLabelPt: Record<MoveQuality, string> = {
  bom: 'bom',
  erro: 'erro',
  excelente: 'excelente',
  gafe: 'gafe (perda grave)',
  imprecisao: 'imprecisão',
  otimo: 'ótimo',
};

function formatEval(mate: number | null, scoreCp: number | null): string {
  if (mate !== null) return `mate em ${Math.abs(mate)} a favor de quem vai jogar`;
  if (scoreCp !== null)
    return `avaliação de ${(scoreCp / 100).toFixed(1)} peões a favor de quem vai jogar`;
  return 'sem avaliação numérica disponível';
}

export function buildLiveNarrationPrompt(input: LiveNarrationRequest): string {
  if (input.kind === 'suggestion') {
    return [
      `É a vez do aluno jogar. Eu (o motor) sugiro o lance ${input.bestMoveUci}.`,
      `Isso resulta em ${formatEval(input.mate, input.scoreCp)}.`,
      '',
      'Fale como o Treinador sugerindo esse lance ao aluno antes dele jogar, explicando em poucas palavras a ideia por trás, seguindo todas as regras.',
    ].join('\n');
  }
  return [
    `O aluno está prestes a jogar ${input.uci}.`,
    `Classificação do motor para esse lance: ${qualityLabelPt[input.quality]}, com perda de ${input.centipawnLoss} centipawns em relação ao melhor lance.`,
    input.bestMoveUci
      ? `O melhor lance segundo o motor era ${input.bestMoveUci}.`
      : 'O motor não indicou uma alternativa melhor.',
    input.missedWin
      ? 'Esse lance também deixa passar uma vantagem maior que existia na posição.'
      : '',
    '',
    'Fale como o Treinador avisando o aluno sobre esse lance antes dele confirmar, explicando em poucas palavras o problema, seguindo todas as regras.',
  ]
    .filter(Boolean)
    .join('\n');
}
