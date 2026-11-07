import type { PlayerMetrics } from '@xadrez/contracts';

export interface InsightInput {
  analyzedGames: number;
  /** Mistakes (imprecisão, erro, gafe) of the player by game phase. */
  badByPhase: { endgame: number; middlegame: number; opening: number };
  draws: number;
  gamesPlayed: number;
  losses: number;
  lossesOnTime: number;
  quality: PlayerMetrics['quality'];
  wins: number;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const PHASE_LABEL = {
  endgame: 'no final de partida',
  middlegame: 'no meio-jogo',
  opening: 'na abertura',
} as const;

/** Strong points, weak points and a summary, derived only from the player's own figures. */
export function buildInsights(
  input: InsightInput,
): Pick<PlayerMetrics, 'strengths' | 'summary' | 'weaknesses'> {
  const { quality } = input;
  const moves =
    quality.otimo +
    quality.excelente +
    quality.bom +
    quality.imprecisao +
    quality.erro +
    quality.gafe;
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (input.gamesPlayed === 0) {
    return {
      strengths: [],
      summary:
        'Você ainda não terminou nenhuma partida. Jogue algumas para ver suas métricas aqui.',
      weaknesses: [],
    };
  }

  const winRate = pct(input.wins, input.gamesPlayed);
  if (input.gamesPlayed >= 5 && winRate >= 55) {
    strengths.push(`Você vence ${winRate}% das partidas (${input.wins} de ${input.gamesPlayed}).`);
  }

  if (moves >= 20) {
    const great = pct(quality.otimo + quality.excelente, moves);
    const solid = pct(quality.otimo + quality.excelente + quality.bom, moves);
    if (great >= 40) {
      strengths.push(`Precisão: ${great}% dos seus lances foram ótimos ou excelentes.`);
    } else if (solid >= 75) {
      strengths.push(`Lances sólidos: ${solid}% dos seus lances foram bons ou melhores.`);
    }
    const gafeRate = pct(quality.gafe, moves);
    if (quality.gafe === 0) {
      strengths.push(
        'Nenhuma gafe nas partidas analisadas: você cuida bem da segurança dos lances.',
      );
    } else if (gafeRate >= 4) {
      weaknesses.push(
        `Gafes: ${quality.gafe} nas partidas analisadas (${gafeRate}% dos lances). Antes de jogar, veja capturas, xeques e ameaças do adversário.`,
      );
    }
    if (quality.erro + quality.gafe >= 5 && pct(quality.erro, moves) >= 5) {
      weaknesses.push(
        `Erros: ${quality.erro} lances perderam bastante vantagem. Calcule a resposta do adversário antes de confirmar.`,
      );
    }
    if (quality.missedWin >= 3) {
      weaknesses.push(
        `Oportunidades perdidas: ${quality.missedWin} vezes havia um lance muito melhor. Treine táticas (garfos, cravadas, mates).`,
      );
    }
    const phases = Object.entries(input.badByPhase) as Array<
      [keyof InsightInput['badByPhase'], number]
    >;
    const [worst, count] = phases.sort((a, b) => b[1] - a[1])[0]!;
    const totalBad = phases.reduce((sum, [, value]) => sum + value, 0);
    if (totalBad >= 5 && pct(count, totalBad) >= 50) {
      weaknesses.push(
        `Suas imprecisões se concentram ${PHASE_LABEL[worst]} (${pct(count, totalBad)}% delas).`,
      );
    }
  }

  if (input.losses >= 3 && pct(input.lossesOnTime, input.losses) >= 30) {
    weaknesses.push(
      `Tempo: ${input.lossesOnTime} das suas ${input.losses} derrotas foram por tempo. Jogue um pouco mais rápido nas posições fáceis.`,
    );
  }

  const parts = [
    `Você terminou ${input.gamesPlayed} ${input.gamesPlayed === 1 ? 'partida' : 'partidas'}: ${input.wins} ${input.wins === 1 ? 'vitória' : 'vitórias'}, ${input.draws} ${input.draws === 1 ? 'empate' : 'empates'} e ${input.losses} ${input.losses === 1 ? 'derrota' : 'derrotas'}.`,
  ];
  if (input.analyzedGames === 0) {
    parts.push(
      'Ainda não há partidas analisadas pelo motor, por isso a qualidade dos lances aparece depois.',
    );
  } else {
    parts.push(
      weaknesses.length === 0
        ? 'Nas partidas analisadas, não há um ponto fraco claro: continue jogando e revisando.'
        : `Para evoluir, foque primeiro em: ${weaknesses[0]!.split(':')[0]!.toLowerCase()}.`,
    );
  }
  return { strengths, summary: parts.join(' '), weaknesses };
}
