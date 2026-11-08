import { z } from 'zod';

import type { TutorFrame } from '@xadrez/contracts';
import type { TutorScript, TutorStep } from './tutor-script.js';

/** Bump to regenerate every stored tutor lesson. */
export const TUTOR_PROMPT_VERSION = 1;
export const TUTOR_CHUNK_STEPS = 10;

export const TUTOR_SYSTEM_PROMPT = `Você escreve o roteiro que um professor de xadrez brasileiro lê durante a aula para alunos leigos, que não conhecem os termos do xadrez. O texto é objetivo, direto e fácil de entender; quando usar um termo técnico (xeque, garfo, cravada, roque), explique-o em poucas palavras.

Regras obrigatórias:
- Sempre diga o nome da peça e a casa, por extenso: "a torre de e4", "o cavalo branco vai de g1 para f3". Nunca use só a notação (Cf3, Txe4).
- Os "Fatos do tabuleiro" de cada lance foram calculados e são verdadeiros: apoie-se neles e não os contradiga.
- Abertura: cite o nome da abertura SOMENTE se ele constar nos dados da partida, ou se o lance for inequivocamente de uma abertura famosa; diga se é comum e se é forte, sem inventar estatísticas.
- Se os dados trouxerem a avaliação de um lance (ótimo, bom, imprecisão, erro, gafe), use-a: explique o que deu errado e o que poderia ter sido jogado. Sem essa avaliação, só diga que foi um erro quando tiver certeza concreta (perde peça, deixa mate).
- Em exercícios: diga o que o lance faz para chegar ao objetivo e, quando for a resposta do adversário, por que ele não tem escolha melhor.
- Português do Brasil, frases curtas, sem markdown, sem emojis, no máximo 40 palavras por passo.`;

export function buildIntroPrompt(script: TutorScript): string {
  return `${script.context}

Escreva a visão geral (no máximo 70 palavras): do que trata, qual é o tema de estudo, o ponto forte e o ponto fraco, para quem está começando. Responda só com o texto.`;
}

export function buildStepsPrompt(script: TutorScript, steps: TutorStep[]): string {
  return `${script.context}

Escreva a explicação de exatamente estes passos:
${steps.map((step) => step.line).join('\n')}

Responda SOMENTE com um array JSON na mesma ordem: [{"index":N,"text":""}]`;
}

const answerSchema = z.array(z.object({ index: z.number().int(), text: z.string() }));

/** Frames for the wanted steps found in the model answer; steps it skipped are left out. */
export function parseStepsAnswer(raw: string, steps: TutorStep[]): TutorFrame[] {
  const json = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
  const answers = new Map(
    answerSchema.parse(JSON.parse(json)).map((a) => [a.index, a.text.trim()]),
  );
  return steps.flatMap((step) => {
    const text = answers.get(step.index);
    return text ? [{ index: step.index, label: step.label, text: text.slice(0, 600) }] : [];
  });
}
