import type { CourseActivity, CourseModule } from './course-types';

// Own texts and positions; the order of themes follows the Lichess "Aprenda" stages (idea only).
export const COURSE_MODULES: CourseModule[] = [
  {
    id: 'pecas-torre-bispo',
    level: 0,
    title: 'As peças: torre e bispo',
    activities: [
      {
        id: 'torre-1',
        title: 'A torre',
        steps: [
          {
            kind: 'info',
            say: 'Esta é a torre. Ela anda em linha reta: para a frente, para trás e para os lados, quantas casas quiser, desde que o caminho esteja livre.',
            fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1',
            show: { from: 'd4', to: 'd8' },
          },
          {
            kind: 'stars',
            say: 'Agora é com você. Leve a torre até a estrela.',
            fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1',
            stars: ['d7'],
            maxMoves: 1,
          },
          {
            kind: 'stars',
            say: 'Pegue as duas estrelas. A torre pode subir e depois andar para o lado.',
            fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1',
            stars: ['d7', 'g7'],
            maxMoves: 2,
          },
          {
            kind: 'stars',
            say: 'Três estrelas em três lances. Planeje o caminho antes de mover.',
            fen: '7k/8/8/8/8/8/1R6/K7 w - - 0 1',
            stars: ['b6', 'f6', 'f3'],
            maxMoves: 3,
          },
          {
            kind: 'move',
            say: 'A torre captura a peça adversária que estiver no caminho, ocupando a casa dela. Capture o cavalo preto.',
            fen: '7k/8/3n4/8/8/8/3R4/K7 w - - 0 1',
            accept: ['d2d6'],
          },
        ],
      },
      {
        id: 'bispo-1',
        title: 'O bispo',
        steps: [
          {
            kind: 'info',
            say: 'Este é o bispo. Ele anda só nas diagonais, quantas casas quiser. Por isso o bispo nunca muda a cor da casa em que está.',
            fen: '4k3/8/8/8/3B4/8/8/4K3 w - - 0 1',
            show: { from: 'd4', to: 'g7' },
          },
          {
            kind: 'stars',
            say: 'Leve o bispo até a estrela pela diagonal.',
            fen: '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1',
            stars: ['f4'],
            maxMoves: 1,
          },
          {
            kind: 'stars',
            say: 'Pegue as duas estrelas. Depois da primeira, troque de diagonal.',
            fen: '4k3/8/8/8/8/8/8/2B1K3 w - - 0 1',
            stars: ['f4', 'b8'],
            maxMoves: 2,
          },
          {
            kind: 'stars',
            say: 'Este bispo anda nas casas claras. Pegue as três estrelas em três lances.',
            fen: '4k3/8/8/8/8/8/8/4KB2 w - - 0 1',
            stars: ['c4', 'a6', 'c8'],
            maxMoves: 3,
          },
          {
            kind: 'move',
            say: 'O bispo também captura na diagonal. Capture o peão preto.',
            fen: '4k3/8/8/6p1/8/8/8/2B1K3 w - - 0 1',
            accept: ['c1g5'],
          },
        ],
      },
      {
        id: 'torre-bispo-mate',
        title: 'Primeiro xeque-mate',
        steps: [
          {
            kind: 'info',
            say: 'Quando uma peça ataca o rei, é xeque. Se o rei não tem como escapar, é xeque-mate, e a partida termina.',
            fen: '7k/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
            show: { from: 'a1', to: 'a8' },
          },
          {
            kind: 'mate',
            say: 'O rei preto está preso atrás dos próprios peões. Dê xeque-mate com a torre em um lance.',
            fen: '7k/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
          },
          {
            kind: 'mate',
            say: 'Agora a torre e o bispo trabalham juntos. Encontre o xeque-mate em um lance.',
            fen: '7k/7p/7B/8/8/8/8/4R1K1 w - - 0 1',
          },
        ],
      },
    ],
  },
];

export const COURSE_ACTIVITIES: CourseActivity[] = COURSE_MODULES.flatMap(
  (module) => module.activities,
);

export function findActivity(id: string) {
  const index = COURSE_ACTIVITIES.findIndex((activity) => activity.id === id);
  return index < 0
    ? null
    : { activity: COURSE_ACTIVITIES[index]!, next: COURSE_ACTIVITIES[index + 1] ?? null };
}
