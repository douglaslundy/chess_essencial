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
  {
    id: 'pecas-dama-rei-cavalo-peao',
    level: 0,
    title: 'As peças: dama, rei, cavalo e peão',
    activities: [
      {
        id: 'dama-1',
        title: 'A dama',
        steps: [
          {
            kind: 'info',
            say: 'Esta é a dama, a peça mais forte. Ela anda como a torre e como o bispo juntos: em linha reta e nas diagonais, quantas casas quiser.',
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
            say: 'Três estrelas em três lances, só pelas diagonais.',
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
            say: 'Este é o rei, a peça mais importante. Ele anda só uma casa, em qualquer direção. Perder o rei é perder a partida.',
            fen: '7k/8/8/8/3K4/8/8/8 w - - 0 1',
            show: { from: 'd4', to: 'e5' },
          },
          {
            kind: 'stars',
            say: 'Leve o rei pelas três estrelas, uma casa por vez.',
            fen: '7k/8/8/8/8/8/8/4K3 w - - 0 1',
            stars: ['e2', 'f3', 'f4'],
            maxMoves: 3,
          },
          {
            kind: 'move',
            say: 'O rei também captura. O peão preto está sozinho: capture-o.',
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
            say: 'Este é o cavalo. Ele anda em L: duas casas para um lado e uma para o outro. É a única peça que pula por cima das outras.',
            fen: '7k/8/8/8/3N4/8/8/K7 w - - 0 1',
            show: { from: 'd4', to: 'e6' },
          },
          {
            kind: 'stars',
            say: 'Leve o cavalo até a estrela com um pulo em L.',
            fen: '7k/8/8/8/3N4/8/8/K7 w - - 0 1',
            stars: ['e6'],
            maxMoves: 1,
          },
          {
            kind: 'stars',
            say: 'Pegue as três estrelas em três pulos.',
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
        title: 'O peão',
        steps: [
          {
            kind: 'info',
            say: 'Este é o peão. Ele anda só para a frente, uma casa. No primeiro lance pode andar duas. Ele nunca volta.',
            fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1',
            show: { from: 'e2', to: 'e4' },
          },
          {
            kind: 'stars',
            say: 'Avance o peão duas casas de uma vez até a estrela.',
            fen: '7k/8/8/8/8/8/4P3/K7 w - - 0 1',
            stars: ['e4'],
            maxMoves: 1,
          },
          {
            kind: 'move',
            say: 'O peão captura de um jeito diferente: uma casa na diagonal, para a frente. Capture o peão preto.',
            fen: '7k/8/8/3p4/4P3/8/8/K7 w - - 0 1',
            accept: ['e4d5'],
          },
          {
            kind: 'move',
            say: 'Quando o peão chega à última fileira, ele vira outra peça, quase sempre uma dama. Promova o peão.',
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
        title: 'A posição inicial',
        steps: [
          {
            kind: 'info',
            say: 'Esta é a posição inicial. A casa do canto à direita de cada jogador é clara. A dama começa na casa da sua cor, e o rei ao lado dela.',
          },
          {
            kind: 'move',
            say: 'As brancas sempre começam. Avance o peão do rei duas casas.',
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
            say: 'O roque é um lance especial do rei com a torre. O rei anda duas casas para o lado e a torre pula por cima dele. Serve para proteger o rei.',
            fen: '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
            show: { from: 'e1', to: 'g1' },
          },
          {
            kind: 'move',
            say: 'Faça o roque pequeno: leve o rei duas casas para a direita.',
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
            say: 'O rei não pode rocar em xeque nem passar por uma casa atacada. A torre preta vigia f1. Faça o roque que ainda é possível.',
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
            say: 'O peão preto acabou de andar duas casas e parou ao lado do seu. Só neste lance, seu peão pode capturá-lo como se ele tivesse andado uma casa. Isso se chama en passant.',
            fen: '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1',
            show: { from: 'e5', to: 'd6' },
          },
          {
            kind: 'move',
            say: 'Capture en passant: o seu peão vai para d6 e o peão preto sai do tabuleiro.',
            fen: '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1',
            accept: ['e5d6'],
          },
          {
            kind: 'move',
            say: 'De novo, agora do outro lado. Capture o peão que acabou de passar.',
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
            say: 'É a vez das pretas, o rei não está em xeque, mas não tem nenhum lance. Isso é afogamento, e a partida termina empatada.',
            fen: 'k7/8/1Q6/8/8/8/8/7K b - - 0 1',
          },
          {
            kind: 'mate',
            say: 'Cuidado para não afogar. Dê xeque-mate com a dama em um lance.',
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
        title: 'Capturar com segurança',
        steps: [
          {
            kind: 'move',
            say: 'Capture a peça que ninguém defende. O cavalo está protegido pelo peão.',
            fen: 'k7/8/2p5/3n4/8/8/8/K2R3b w - - 0 1',
            accept: ['d1h1'],
          },
        ],
      },
      {
        id: 'protecao',
        title: 'Proteger as peças',
        steps: [
          {
            kind: 'info',
            say: 'Uma peça está protegida quando outra peça sua pode recapturar se ela for tomada.',
            fen: 'k3r3/8/8/4N3/8/8/3P1P2/K7 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'A torre preta ataca o seu cavalo. Proteja o cavalo avançando um peão.',
            fen: 'k3r3/8/8/4N3/8/8/3P1P2/K7 w - - 0 1',
            accept: ['d2d4', 'f2f4'],
          },
        ],
      },
      {
        id: 'valor',
        title: 'O valor das peças',
        steps: [
          {
            kind: 'info',
            say: 'Cada peça tem um valor: peão vale 1, cavalo e bispo valem 3, torre vale 5 e dama vale 9. O rei não tem preço.',
          },
          {
            kind: 'move',
            say: 'A dama pode capturar o cavalo ou a torre. Escolha a peça que vale mais.',
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
            say: 'Garfo é quando uma peça ataca duas peças adversárias ao mesmo tempo. O adversário só consegue salvar uma.',
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
            say: 'O peão também dá garfo. Avance o peão para atacar os dois cavalos.',
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
            say: 'Quando o seu rei está em xeque, você precisa resolver: capturar a peça que ataca, bloquear o ataque ou fugir com o rei.',
            fen: 'k7/8/8/8/4r3/8/8/4K3 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'Seu rei está em xeque. Capture a torre que dá o xeque.',
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
            say: 'Aqui não dá para capturar nem bloquear. Fuja com o rei para uma casa segura.',
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
            say: 'O rei preto está preso atrás dos peões. Dê xeque-mate com a dama.',
            fen: '6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1',
          },
          {
            kind: 'mate',
            say: 'O seu rei ajuda a dama. Encontre o xeque-mate.',
            fen: 'k7/2K5/8/8/8/8/8/1Q6 w - - 0 1',
          },
          {
            kind: 'mate',
            say: 'O rei preto está cercado pelas próprias peças. Dê xeque-mate com o cavalo.',
            fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1',
          },
        ],
      },
    ],
  },
  {
    id: 'mates-basicos',
    level: 1,
    title: 'Mates básicos',
    activities: [
      {
        id: 'mate-dama',
        title: 'Mate com dama e rei',
        steps: [
          {
            kind: 'info',
            say: 'Contra o rei sozinho, a dama precisa da ajuda do seu rei. A dama empurra o rei adversário para a borda, e o seu rei chega perto para fechar a saída. Cuidado para não afogar.',
            fen: '7k/8/6K1/8/8/8/8/Q7 w - - 0 1',
          },
          {
            kind: 'checkmate',
            say: 'O rei preto já está na borda e o seu rei está perto. Dê o mate.',
            fen: '7k/8/6K1/8/8/8/8/Q7 w - - 0 1',
            maxMoves: 1,
          },
          {
            kind: 'checkmate',
            say: 'Primeiro aproxime o seu rei, depois dê o mate. Você tem dois lances.',
            fen: '7k/8/8/6K1/8/8/8/Q7 w - - 0 1',
            maxMoves: 2,
          },
          {
            kind: 'checkmate',
            say: 'Agora as pretas se defendem melhor. Feche o rei com a dama sem dar xeque à toa e traga o seu rei. Mate em até seis lances.',
            fen: '8/8/8/8/8/2k5/8/4K2Q w - - 0 1',
            maxMoves: 6,
          },
        ],
      },
      {
        id: 'mate-torre',
        title: 'Mate com torre e rei',
        steps: [
          {
            kind: 'info',
            say: 'Com a torre, o mate também é na borda. Os reis ficam frente a frente, e a torre dá o xeque pela fileira do rei adversário.',
            fen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
            show: { from: 'a1', to: 'a8' },
          },
          {
            kind: 'checkmate',
            say: 'Dê o mate com a torre.',
            fen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
            maxMoves: 1,
          },
          {
            kind: 'checkmate',
            say: 'O rei preto ainda tem casas. Faça um lance de espera com a torre e depois dê o mate.',
            fen: '4k3/8/3K4/8/8/8/8/7R w - - 0 1',
            maxMoves: 3,
          },
        ],
      },
      {
        id: 'escadinha',
        title: 'A escadinha',
        steps: [
          {
            kind: 'info',
            say: 'Duas torres dão mate sem ajuda do rei. Uma torre corta uma fileira e a outra dá xeque na fileira seguinte, subindo como uma escada.',
            fen: '6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1',
          },
          {
            kind: 'checkmate',
            say: 'Uma torre corta a sétima fileira, a outra dá o mate na oitava.',
            fen: '6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1',
            maxMoves: 2,
          },
          {
            kind: 'checkmate',
            say: 'Suba a escada desde o meio do tabuleiro. Se o rei chegar perto de uma torre, leve-a para o outro lado.',
            fen: '8/8/8/4k3/8/8/R7/1R4K1 w - - 0 1',
            maxMoves: 6,
          },
        ],
      },
      {
        id: 'mate-em-1-banco',
        title: 'Problemas: mate em um',
        steps: [
          {
            kind: 'info',
            say: 'Agora, posições de partidas reais. Em cada uma existe um xeque-mate em um lance. Veja de que lado você joga, procure os xeques e confira se o rei consegue escapar.',
          },
          {
            kind: 'puzzle',
            say: 'Encontre o xeque-mate em um lance. São cinco problemas.',
            theme: 'mate_em_um',
            difficulty: 'beginner',
            count: 5,
          },
        ],
      },
      {
        id: 'mate-em-2-banco',
        title: 'Problemas: mate em dois',
        steps: [
          {
            kind: 'info',
            say: 'No mate em dois, o primeiro lance prepara o mate e o adversário responde. Comece pelos lances que forçam, como os xeques.',
          },
          {
            kind: 'puzzle',
            say: 'Encontre o mate em dois lances. São três problemas.',
            theme: 'mate_em_dois',
            difficulty: 'beginner',
            count: 3,
          },
        ],
      },
    ],
  },
];

export const COURSE_ACTIVITIES: CourseActivity[] = COURSE_MODULES.flatMap(
  (module) => module.activities,
);

/** Activities open in order: the first one, any finished one, and the one right after a finished one. */
export function isUnlocked(id: string, completed: ReadonlySet<string>) {
  const index = COURSE_ACTIVITIES.findIndex((activity) => activity.id === id);
  return index === 0 || completed.has(id) || completed.has(COURSE_ACTIVITIES[index - 1]?.id ?? '');
}

export function findActivity(id: string) {
  const index = COURSE_ACTIVITIES.findIndex((activity) => activity.id === id);
  return index < 0
    ? null
    : { activity: COURSE_ACTIVITIES[index]!, next: COURSE_ACTIVITIES[index + 1] ?? null };
}
