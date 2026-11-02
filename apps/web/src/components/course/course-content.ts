import type { CourseActivity, CourseModule } from './course-types';

// Own texts and positions; the order of themes follows the Lichess "Aprenda" stages (idea only).
export const COURSE_MODULES: CourseModule[] = [
  {
    id: 'pecas-torre-bispo',
    level: 0,
    title: 'As peÃ§as: torre e bispo',
    activities: [
      {
        id: 'torre-1',
        title: 'A torre',
        steps: [
          {
            kind: 'info',
            say: 'Esta Ã© a torre. Ela anda em linha reta: para a frente, para trÃ¡s e para os lados, quantas casas quiser, desde que o caminho esteja livre.',
            fen: '7k/8/8/8/3R4/8/8/K7 w - - 0 1',
            show: { from: 'd4', to: 'd8' },
          },
          {
            kind: 'stars',
            say: 'Agora Ã© com vocÃª. Leve a torre atÃ© a estrela.',
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
            say: 'TrÃªs estrelas em trÃªs lances. Planeje o caminho antes de mover.',
            fen: '7k/8/8/8/8/8/1R6/K7 w - - 0 1',
            stars: ['b6', 'f6', 'f3'],
            maxMoves: 3,
          },
          {
            kind: 'move',
            say: 'A torre captura a peÃ§a adversÃ¡ria que estiver no caminho, ocupando a casa dela. Capture o cavalo preto.',
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
            say: 'Este Ã© o bispo. Ele anda sÃ³ nas diagonais, quantas casas quiser. Por isso o bispo nunca muda a cor da casa em que estÃ¡.',
            fen: '4k3/8/8/8/3B4/8/8/4K3 w - - 0 1',
            show: { from: 'd4', to: 'g7' },
          },
          {
            kind: 'stars',
            say: 'Leve o bispo atÃ© a estrela pela diagonal.',
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
            say: 'Este bispo anda nas casas claras. Pegue as trÃªs estrelas em trÃªs lances.',
            fen: '4k3/8/8/8/8/8/8/4KB2 w - - 0 1',
            stars: ['c4', 'a6', 'c8'],
            maxMoves: 3,
          },
          {
            kind: 'move',
            say: 'O bispo tambÃ©m captura na diagonal. Capture o peÃ£o preto.',
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
            say: 'Quando uma peÃ§a ataca o rei, Ã© xeque. Se o rei nÃ£o tem como escapar, Ã© xeque-mate, e a partida termina.',
            fen: '7k/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
            show: { from: 'a1', to: 'a8' },
          },
          {
            kind: 'mate',
            say: 'O rei preto estÃ¡ preso atrÃ¡s dos prÃ³prios peÃµes. DÃª xeque-mate com a torre em um lance.',
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
  {
    id: 'pecas-dama-rei-cavalo-peao',
    level: 0,
    title: 'As peÃ§as: dama, rei, cavalo e peÃ£o',
    activities: [
      {
        id: 'dama-1',
        title: 'A dama',
        steps: [
          {
            kind: 'info',
            say: 'Esta Ã© a dama, a peÃ§a mais forte. Ela anda como a torre e como o bispo juntos: em linha reta e nas diagonais, quantas casas quiser.',
            fen: '7k/8/8/8/3Q4/8/8/K7 w - - 0 1',
            show: { from: 'd4', to: 'a7' },
          },
          {
            kind: 'stars',
            say: 'Pegue as duas estrelas. Primeiro em linha reta, depois na diagonal.',
            fen: '7k/8/8/8/3Q4/8/8/K7 w - - 0 1',
            stars: ['d7', 'a4'],
            maxMoves: 2,
          },
          {
            kind: 'stars',
            say: 'TrÃªs estrelas em trÃªs lances, sÃ³ pelas diagonais.',
            fen: '7k/8/8/8/3Q4/8/8/K7 w - - 0 1',
            stars: ['b6', 'f2', 'h4'],
            maxMoves: 3,
          },
          {
            kind: 'move',
            say: 'Capture a torre preta com a dama.',
            fen: '7k/8/8/8/6r1/8/8/K2Q4 w - - 0 1',
            accept: ['d1g4'],
          },
        ],
      },
      {
        id: 'rei-1',
        title: 'O rei',
        steps: [
          {
            kind: 'info',
            say: 'Este Ã© o rei, a peÃ§a mais importante. Ele anda sÃ³ uma casa, em qualquer direÃ§Ã£o. Perder o rei Ã© perder a partida.',
            fen: '7k/8/8/8/3K4/8/8/8 w - - 0 1',
            show: { from: 'd4', to: 'e5' },
          },
          {
            kind: 'stars',
            say: 'Leve o rei pelas trÃªs estrelas, uma casa por vez.',
            fen: '7k/8/8/8/8/8/8/4K3 w - - 0 1',
            stars: ['e2', 'f3', 'f4'],
            maxMoves: 3,
          },
          {
            kind: 'move',
            say: 'O rei tambÃ©m captura. O peÃ£o preto estÃ¡ sozinho: capture-o.',
            fen: '7k/8/8/3p4/3K4/8/8/8 w - - 0 1',
            accept: ['d4d5'],
          },
        ],
      },
      {
        id: 'cavalo-1',
        title: 'O cavalo',
        steps: [
          {
            kind: 'info',
            say: 'Este Ã© o cavalo. Ele anda em L: duas casas para um lado e uma para o outro. Ã‰ a Ãºnica peÃ§a que pula por cima das outras.',
            fen: '7k/8/8/8/3N4/8/8/K7 w - - 0 1',
            show: { from: 'd4', to: 'e6' },
          },
          {
            kind: 'stars',
            say: 'Leve o cavalo atÃ© a estrela com um pulo em L.',
            fen: '7k/8/8/8/3N4/8/8/K7 w - - 0 1',
            stars: ['e6'],
            maxMoves: 1,
          },
          {
            kind: 'stars',
            say: 'Pegue as trÃªs estrelas em trÃªs pulos.',
            fen: '7k/8/8/8/8/8/8/KN6 w - - 0 1',
            stars: ['c3', 'e4', 'f6'],
            maxMoves: 3,
          },
          {
            kind: 'move',
            say: 'Capture o bispo preto com o cavalo.',
            fen: '7k/8/8/8/8/4b3/8/K4N2 w - - 0 1',
            accept: ['f1e3'],
          },
        ],
      },
      {
        id: 'peao-1',
        title: 'O peÃ£o',
        steps: [
          {
            kind: 'info',
            say: 'Este Ã© o peÃ£o. Ele anda sÃ³ para a frente, uma casa. No primeiro lance pode andar duas. Ele nunca volta.',
            fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1',
            show: { from: 'e2', to: 'e4' },
          },
          {
            kind: 'stars',
            say: 'Avance o peÃ£o duas casas de uma vez atÃ© a estrela.',
            fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1',
            stars: ['e4'],
            maxMoves: 1,
          },
          {
            kind: 'move',
            say: 'O peÃ£o captura de um jeito diferente: uma casa na diagonal, para a frente. Capture o peÃ£o preto.',
            fen: '7k/8/8/3p4/4P3/8/8/K7 w - - 0 1',
            accept: ['e4d5'],
          },
          {
            kind: 'move',
            say: 'Quando o peÃ£o chega Ã  Ãºltima fileira, ele vira outra peÃ§a, quase sempre uma dama. Promova o peÃ£o.',
            fen: 'k7/4P3/8/8/8/8/8/7K w - - 0 1',
            accept: ['e7e8q'],
          },
        ],
      },
    ],
  },
  {
    id: 'regras',
    level: 0,
    title: 'As regras especiais',
    activities: [
      {
        id: 'posicao-inicial',
        title: 'A posiÃ§Ã£o inicial',
        steps: [
          {
            kind: 'info',
            say: 'Esta Ã© a posiÃ§Ã£o inicial. A casa do canto Ã  direita de cada jogador Ã© clara. A dama comeÃ§a na casa da sua cor, e o rei ao lado dela.',
          },
          {
            kind: 'move',
            say: 'As brancas sempre comeÃ§am. Avance o peÃ£o do rei duas casas.',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            accept: ['e2e4'],
            reply: 'e7e5',
          },
          {
            kind: 'move',
            say: 'As pretas responderam. Agora tire o cavalo do rei para a casa f3.',
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            accept: ['g1f3'],
          },
        ],
      },
      {
        id: 'roque',
        title: 'O roque',
        steps: [
          {
            kind: 'info',
            say: 'O roque Ã© um lance especial do rei com a torre. O rei anda duas casas para o lado e a torre pula por cima dele. Serve para proteger o rei.',
            fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
            show: { from: 'e1', to: 'g1' },
          },
          {
            kind: 'move',
            say: 'FaÃ§a o roque pequeno: leve o rei duas casas para a direita.',
            fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
            accept: ['e1g1'],
          },
          {
            kind: 'move',
            say: 'Agora o roque grande: leve o rei duas casas para a esquerda.',
            fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
            accept: ['e1c1'],
          },
          {
            kind: 'move',
            say: 'O rei nÃ£o pode rocar em xeque nem passar por uma casa atacada. A torre preta vigia f1. FaÃ§a o roque que ainda Ã© possÃ­vel.',
            fen: '4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1',
            accept: ['e1c1'],
          },
        ],
      },
      {
        id: 'en-passant',
        title: 'O en passant',
        steps: [
          {
            kind: 'info',
            say: 'O peÃ£o preto acabou de andar duas casas e parou ao lado do seu. SÃ³ neste lance, seu peÃ£o pode capturÃ¡-lo como se ele tivesse andado uma casa. Isso se chama en passant.',
            fen: '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1',
            show: { from: 'e5', to: 'd6' },
          },
          {
            kind: 'move',
            say: 'Capture en passant: o seu peÃ£o vai para d6 e o peÃ£o preto sai do tabuleiro.',
            fen: '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1',
            accept: ['e5d6'],
          },
          {
            kind: 'move',
            say: 'De novo, agora do outro lado. Capture o peÃ£o que acabou de passar.',
            fen: '7k/8/8/pP6/8/8/8/K7 w - a6 0 1',
            accept: ['b5a6'],
          },
        ],
      },
      {
        id: 'afogamento',
        title: 'O afogamento',
        steps: [
          {
            kind: 'info',
            say: 'Ã‰ a vez das pretas, o rei nÃ£o estÃ¡ em xeque, mas nÃ£o tem nenhum lance. Isso Ã© afogamento, e a partida termina empatada.',
            fen: 'k7/8/1Q6/8/8/8/8/7K b - - 0 1',
          },
          {
            kind: 'mate',
            say: 'Cuidado para nÃ£o afogar. DÃª xeque-mate com a dama em um lance.',
            fen: 'k7/8/1K6/8/8/8/8/6Q1 w - - 0 1',
          },
        ],
      },
    ],
  },
  {
    id: 'combate',
    level: 0,
    title: 'Combate',
    activities: [
      {
        id: 'captura',
        title: 'Capturar com seguranÃ§a',
        steps: [
          {
            kind: 'move',
            say: 'Capture a peÃ§a que ninguÃ©m defende. O cavalo estÃ¡ protegido pelo peÃ£o.',
            fen: 'k7/8/2p5/3n4/8/8/8/K2R3b w - - 0 1',
            accept: ['d1h1'],
          },
        ],
      },
      {
        id: 'protecao',
        title: 'Proteger as peÃ§as',
        steps: [
          {
            kind: 'info',
            say: 'Uma peÃ§a estÃ¡ protegida quando outra peÃ§a sua pode recapturar se ela for tomada.',
            fen: 'k3r3/8/8/4N3/8/8/3P1P2/K7 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'A torre preta ataca o seu cavalo. Proteja o cavalo avanÃ§ando um peÃ£o.',
            fen: 'k3r3/8/8/4N3/8/8/3P1P2/K7 w - - 0 1',
            accept: ['d2d4', 'f2f4'],
          },
        ],
      },
      {
        id: 'valor',
        title: 'O valor das peÃ§as',
        steps: [
          {
            kind: 'info',
            say: 'Cada peÃ§a tem um valor: peÃ£o vale 1, cavalo e bispo valem 3, torre vale 5 e dama vale 9. O rei nÃ£o tem preÃ§o.',
          },
          {
            kind: 'move',
            say: 'A dama pode capturar o cavalo ou a torre. Escolha a peÃ§a que vale mais.',
            fen: 'k7/8/1n6/8/3Q4/7K/8/6r1 w - - 0 1',
            accept: ['d4g1'],
          },
        ],
      },
      {
        id: 'garfo',
        title: 'O garfo',
        steps: [
          {
            kind: 'info',
            say: 'Garfo Ã© quando uma peÃ§a ataca duas peÃ§as adversÃ¡rias ao mesmo tempo. O adversÃ¡rio sÃ³ consegue salvar uma.',
            fen: '7k/8/2r1r3/8/3N4/8/8/K7 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'Pule com o cavalo para atacar o rei e a dama ao mesmo tempo.',
            fen: 'q3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
            accept: ['b5c7'],
          },
          {
            kind: 'move',
            say: 'O peÃ£o tambÃ©m dÃ¡ garfo. Avance o peÃ£o para atacar os dois cavalos.',
            fen: 'k7/8/2n1n3/8/3P4/8/8/K7 w - - 0 1',
            accept: ['d4d5'],
          },
        ],
      },
    ],
  },
  {
    id: 'xeque-mate',
    level: 0,
    title: 'Xeque e xeque-mate',
    activities: [
      {
        id: 'xeque',
        title: 'Sair do xeque',
        steps: [
          {
            kind: 'info',
            say: 'Quando o seu rei estÃ¡ em xeque, vocÃª precisa resolver: capturar a peÃ§a que ataca, bloquear o ataque ou fugir com o rei.',
            fen: 'k7/8/8/8/4r3/8/8/4K3 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'Seu rei estÃ¡ em xeque. Capture a torre que dÃ¡ o xeque.',
            fen: 'k7/8/8/8/4r3/8/2B5/4K3 w - - 0 1',
            accept: ['c2e4'],
          },
          {
            kind: 'move',
            say: 'Agora bloqueie o xeque colocando a sua torre no caminho.',
            fen: 'k3r3/8/8/8/8/8/R7/4K3 w - - 0 1',
            accept: ['a2e2'],
          },
          {
            kind: 'move',
            say: 'Aqui nÃ£o dÃ¡ para capturar nem bloquear. Fuja com o rei para uma casa segura.',
            fen: 'k7/8/8/8/1b6/8/8/4K3 w - - 0 1',
            accept: ['e1d1', 'e1e2', 'e1f1', 'e1f2'],
          },
        ],
      },
      {
        id: 'mate-em-1',
        title: 'Mate em um lance',
        steps: [
          {
            kind: 'mate',
            say: 'O rei preto estÃ¡ preso atrÃ¡s dos peÃµes. DÃª xeque-mate com a dama.',
            fen: '6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1',
          },
          {
            kind: 'mate',
            say: 'O seu rei ajuda a dama. Encontre o xeque-mate.',
            fen: 'k7/2K5/8/8/8/8/8/1Q6 w - - 0 1',
          },
          {
            kind: 'mate',
            say: 'O rei preto estÃ¡ cercado pelas prÃ³prias peÃ§as. DÃª xeque-mate com o cavalo.',
            fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
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
