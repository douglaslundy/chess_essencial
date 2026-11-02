import type { CourseActivity, CourseModule } from './course-types';

/** Explanation + `count` bank puzzles of one theme (Lichess tag) and difficulty band. */
function puzzles(
  id: string,
  title: string,
  explain: string,
  theme: string,
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert',
  count = 4,
): CourseActivity {
  return {
    id,
    title,
    steps: [
      { kind: 'info', say: explain },
      {
        kind: 'puzzle',
        say: `Resolva ${count} problemas de partidas reais.`,
        theme,
        difficulty,
        count,
      },
    ],
  };
}

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
  {
    id: 'principios-abertura',
    level: 2,
    title: 'Princípios de abertura',
    activities: [
      {
        id: 'abertura-principios',
        title: 'Centro, desenvolvimento e roque',
        steps: [
          {
            kind: 'info',
            say: 'Na abertura, três ideias guiam os seus lances: ocupe o centro com peões, tire os cavalos e bispos para casas ativas e faça o roque cedo para proteger o rei.',
          },
          {
            kind: 'move',
            say: 'Ocupe o centro: avance o peão do rei ou o peão da dama duas casas.',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            accept: ['e2e4', 'd2d4'],
            reply: 'e7e5',
          },
          {
            kind: 'move',
            say: 'Desenvolva o cavalo do rei para f3. Ele ataca o peão de e5 e vigia o centro.',
            fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            accept: ['g1f3'],
            reply: 'b8c6',
          },
          {
            kind: 'move',
            say: 'Agora o bispo do rei. Leve-o para uma casa ativa, de onde ele mira o centro ou a casa f7.',
            fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
            accept: ['f1c4', 'f1b5'],
            reply: 'f8c5',
          },
          {
            kind: 'move',
            say: 'O caminho entre o rei e a torre está livre. Faça o roque.',
            fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
            accept: ['e1g1'],
          },
        ],
      },
      {
        id: 'abertura-f7',
        title: 'O ponto fraco f7',
        steps: [
          {
            kind: 'info',
            say: 'No começo da partida, a casa f7 só é defendida pelo rei preto. Dama e bispo juntos podem atacá-la. Por isso, desenvolva as peças e não deixe f7 sem defesa.',
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
            show: { from: 'c4', to: 'f7' },
          },
          {
            kind: 'mate',
            say: 'As pretas tiraram o cavalo e esqueceram de f7. Dê o xeque-mate.',
            fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
          },
        ],
      },
    ],
  },
  {
    id: 'taticas-fundamentais',
    level: 2,
    title: 'Táticas fundamentais',
    activities: [
      puzzles(
        'tatica-garfo',
        'Garfo',
        'Garfo: uma peça ataca duas ao mesmo tempo. Procure casas de onde o cavalo, a dama ou um peão atacam rei e dama, ou duas peças soltas.',
        'garfo',
        'intermediate',
      ),
      puzzles(
        'tatica-cravada',
        'Cravada',
        'Cravada: uma peça não pode sair do lugar porque deixaria uma peça mais valiosa, ou o rei, sob ataque. Ataque a peça cravada de novo ou aproveite que ela não se mexe.',
        'cravada',
        'intermediate',
      ),
      puzzles(
        'tatica-espeto',
        'Espeto',
        'Espeto é a cravada ao contrário: você ataca uma peça valiosa, ela precisa sair, e a peça de trás fica sem proteção.',
        'espeto',
        'intermediate',
      ),
      puzzles(
        'tatica-descoberto',
        'Ataque descoberto',
        'Ataque descoberto: uma peça sai da frente e revela o ataque de outra que estava atrás. A peça que sai pode atacar também, criando duas ameaças.',
        'ataque_descoberto',
        'intermediate',
      ),
      puzzles(
        'tatica-corredor',
        'Mate do corredor',
        'Mate do corredor: o rei está preso atrás dos próprios peões na primeira fileira. Uma torre ou a dama dá o mate pela fileira de trás.',
        'mate_corredor',
        'intermediate',
      ),
    ],
  },
  {
    id: 'taticas-avancadas',
    level: 3,
    title: 'Táticas avançadas',
    activities: [
      puzzles(
        'avancada-desvio',
        'Desvio',
        'Desvio: obrigue uma peça defensora a sair da sua função, muitas vezes com um sacrifício, e aproveite o que ela deixou de defender.',
        'desvio',
        'advanced',
      ),
      puzzles(
        'avancada-atracao',
        'Atração',
        'Atração: puxe o rei ou uma peça para uma casa ruim, em geral com um sacrifício, onde ela sofre um garfo ou um mate.',
        'atracao',
        'advanced',
      ),
      puzzles(
        'avancada-defensor',
        'Eliminar o defensor',
        'Eliminar o defensor: capture ou troque a peça que protege o ponto que você quer atacar.',
        'capturar_defensor',
        'advanced',
      ),
      puzzles(
        'avancada-intermediario',
        'Lance intermediário',
        'Lance intermediário: antes de fazer o lance esperado, como uma recaptura, encaixe uma ameaça mais forte que o adversário precisa responder.',
        'lance_intermediario',
        'advanced',
      ),
      puzzles(
        'avancada-mate-3',
        'Mate em três',
        'Mate em três: calcule a sequência inteira antes de jogar. Lances forçados, como xeques e capturas, reduzem as respostas do adversário.',
        'mate_em_tres',
        'advanced',
        3,
      ),
    ],
  },
  {
    id: 'finais-e-peoes',
    level: 3,
    title: 'Peões e finais',
    activities: [
      {
        id: 'final-quadrado',
        title: 'A regra do quadrado',
        steps: [
          {
            kind: 'info',
            say: 'Rei contra peão: desenhe um quadrado do peão até a casa de promoção. Se o rei consegue entrar nesse quadrado, ele alcança o peão. O peão de a4 tem o quadrado a4–d4–d1–a1.',
            fen: '7k/8/8/8/p7/8/8/4K3 w - - 0 1',
            show: { from: 'a4', to: 'a1' },
          },
          {
            kind: 'info',
            say: 'Com o rei em f1, nenhum lance entra no quadrado: o peão vence a corrida. Com o rei em e1, d2 já fica dentro do quadrado.',
            fen: '7k/8/8/8/p7/8/8/5K2 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'Entre no quadrado: leve o rei para d2.',
            fen: '7k/8/8/8/p7/8/8/4K3 w - - 0 1',
            accept: ['e1d2'],
            reply: 'a4a3',
          },
          {
            kind: 'move',
            say: 'Siga atrás do peão: rei para c2.',
            fen: '7k/8/8/8/8/p7/3K4/8 w - - 0 2',
            accept: ['d2c2'],
            reply: 'a3a2',
          },
          {
            kind: 'move',
            say: 'Encoste no peão: rei para b2.',
            fen: '7k/8/8/8/8/8/p1K5/8 w - - 0 3',
            accept: ['c2b2'],
            reply: 'h8g8',
          },
          {
            kind: 'move',
            say: 'Capture o peão.',
            fen: '6k1/8/8/8/8/8/pK6/8 w - - 2 4',
            accept: ['b2a2'],
          },
        ],
      },
      {
        id: 'final-oposicao',
        title: 'Oposição',
        steps: [
          {
            kind: 'info',
            say: 'Oposição: os reis ficam frente a frente com uma casa entre eles. Quem precisa mover cede espaço. Quem acabou de mover "tem a oposição".',
            fen: '4k3/8/4K3/8/8/8/8/8 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'Seu rei está na frente do peão, na 6ª fileira: isso vence. Saia para o lado com o rei para d6 e abra caminho para o peão.',
            fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
            accept: ['e6d6'],
            reply: 'e8d8',
          },
          {
            kind: 'move',
            say: 'O rei preto tomou a oposição, mas o peão tem um lance a mais. Avance o peão para e6.',
            fen: '3k4/8/3K4/4P3/8/8/8/8 w - - 2 2',
            accept: ['e5e6'],
            reply: 'd8e8',
          },
          {
            kind: 'move',
            say: 'Avance de novo para e7. Seu rei em d6 protege o peão.',
            fen: '4k3/8/3KP3/8/8/8/8/8 w - - 1 3',
            accept: ['e6e7'],
            reply: 'e8f7',
          },
          {
            kind: 'move',
            say: 'Proteja a casa de promoção: rei para d7.',
            fen: '8/4Pk2/3K4/8/8/8/8/8 w - - 1 4',
            accept: ['d6d7'],
            reply: 'f7f6',
          },
          {
            kind: 'move',
            say: 'Promova o peão a dama.',
            fen: '8/3KP3/5k2/8/8/8/8/8 w - - 3 5',
            accept: ['e7e8q'],
          },
        ],
      },
      {
        id: 'final-lucena',
        title: 'Final de torre: a ponte (Lucena)',
        steps: [
          {
            kind: 'info',
            say: 'Seu rei está na casa de promoção e a torre corta o rei preto na coluna e. Se o rei sair agora, a torre preta dá xeques sem fim. A ideia é "construir a ponte": a torre vai para a 4ª fileira para bloquear os xeques depois.',
            fen: '3K4/3P1k2/8/8/8/8/r7/4R3 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'Construa a ponte: torre para e4.',
            fen: '3K4/3P1k2/8/8/8/8/r7/4R3 w - - 0 1',
            accept: ['e1e4'],
            reply: 'a2a1',
          },
          {
            kind: 'move',
            say: 'Agora o rei sai pela coluna c: rei para c7.',
            fen: '3K4/3P1k2/8/8/4R3/8/8/r7 w - - 2 2',
            accept: ['d8c7'],
            reply: 'a1c1',
          },
          {
            kind: 'move',
            say: 'Fuja do xeque descendo: rei para b6.',
            fen: '8/2KP1k2/8/8/4R3/8/8/2r5 w - - 4 3',
            accept: ['c7b6'],
            reply: 'c1b1',
          },
          {
            kind: 'move',
            say: 'Volte para a coluna c: rei para c6.',
            fen: '8/3P1k2/1K6/8/4R3/8/8/1r6 w - - 6 4',
            accept: ['b6c6'],
            reply: 'b1c1',
          },
          {
            kind: 'move',
            say: 'Desça mais uma fileira: rei para b5.',
            fen: '8/3P1k2/2K5/8/4R3/8/8/2r5 w - - 8 5',
            accept: ['c6b5'],
            reply: 'c1b1',
          },
          {
            kind: 'move',
            say: 'Agora a ponte: a torre de e4 bloqueia o xeque em b4. Os xeques acabaram e o peão promove.',
            fen: '8/3P1k2/8/1K6/4R3/8/8/1r6 w - - 10 6',
            accept: ['e4b4'],
          },
        ],
      },
      {
        id: 'final-philidor',
        title: 'Final de torre: a defesa (Philidor)',
        steps: [
          {
            kind: 'info',
            say: 'Agora você defende com uma torre contra torre e peão. Seu rei está na frente do peão e sua torre segura a 3ª fileira: o rei preto não consegue avançar.',
            fen: '8/8/8/8/3kp3/7R/r7/4K3 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'Espere com a torre na 3ª fileira: torre para g3.',
            fen: '8/8/8/8/3kp3/7R/r7/4K3 w - - 0 1',
            accept: ['h3g3'],
            reply: 'e4e3',
          },
          {
            kind: 'move',
            say: 'O peão avançou para a 3ª fileira e não protege mais o rei preto de xeques por trás. Leve a torre para longe: g8.',
            fen: '8/8/8/8/3k4/4p1R1/r7/4K3 w - - 0 2',
            accept: ['g3g8'],
            reply: 'd4d3',
          },
          {
            kind: 'move',
            say: 'O rei preto ameaça mate. Dê xeque por trás: torre para d8.',
            fen: '6R1/8/8/8/8/3kp3/r7/4K3 w - - 2 3',
            accept: ['g8d8'],
            reply: 'd3e4',
          },
          {
            kind: 'move',
            say: 'Continue com xeques: torre para e8. O rei preto não tem onde se esconder e a partida é empate.',
            fen: '3R4/8/8/8/4k3/4p3/r7/4K3 w - - 4 4',
            accept: ['d8e8'],
          },
        ],
      },
      puzzles(
        'final-peao-avancado',
        'O peão passado avançado',
        'Um peão perto da promoção vale quase uma peça. Abra caminho para ele, às vezes entregando material, e conte as casas até a última fileira.',
        'peao_avancado',
        'advanced',
      ),
      puzzles(
        'final-zugzwang',
        'Zugzwang',
        'Zugzwang: o adversário está numa posição em que qualquer lance piora a situação dele. Às vezes o melhor lance é só esperar.',
        'zugzwang',
        'advanced',
      ),
    ],
  },
  {
    id: 'meio-de-jogo',
    level: 3,
    title: 'Meio de jogo',
    activities: [
      {
        id: 'estrutura-peoes',
        title: 'Estrutura de peões',
        steps: [
          {
            kind: 'info',
            say: 'Peão isolado: não tem peões amigos nas colunas vizinhas. Nenhum peão pode protegê-lo, e a casa da frente vira um bom posto para as peças do adversário. O peão de d4 é isolado.',
            fen: '4k3/pp3ppp/8/8/3P4/8/PP3PPP/4K3 w - - 0 1',
          },
          {
            kind: 'info',
            say: 'Peões dobrados: dois peões na mesma coluna. Um atrapalha o outro e eles não se protegem. Os peões de c2 e c3 são dobrados.',
            fen: '4k3/pp3ppp/8/8/8/2P5/P1P2PPP/4K3 w - - 0 1',
          },
          {
            kind: 'move',
            say: 'Peão passado: nenhum peão adversário pode pará-lo. Ele é a força dos finais. Avance o peão passado de d5.',
            fen: '6k1/5ppp/8/3P4/8/8/5PPP/6K1 w - - 0 1',
            accept: ['d5d6'],
          },
        ],
      },
      {
        id: 'planos-meio-jogo',
        title: 'Planos de meio de jogo',
        steps: [
          {
            kind: 'info',
            say: 'Quando você não vê tática, faça um plano: ponha as torres nas colunas abertas, leve os cavalos para casas fortes e melhore a sua pior peça.',
          },
          {
            kind: 'move',
            say: 'A coluna d não tem peões: ela está aberta. Coloque uma torre nela.',
            fen: 'r4rk1/pp3ppp/2p1p3/8/8/2P1P3/PP3PPP/R4RK1 w - - 0 1',
            accept: ['f1d1', 'a1d1'],
            reply: 'f8d8',
          },
          {
            kind: 'move',
            say: 'A casa d5 está protegida pelo peão de e4 e nenhum peão preto pode expulsar um cavalo dali. Ocupe esse posto avançado com o cavalo.',
            fen: 'r4rk1/pp3ppp/3p4/8/4P3/2N5/PPP2PPP/R4RK1 w - - 0 1',
            accept: ['c3d5'],
          },
        ],
      },
    ],
  },
  {
    id: 'estrategia-avancada',
    level: 4,
    title: 'Cálculo e estratégia',
    activities: [
      puzzles(
        'avancado-sacrificio',
        'Sacrifícios',
        'Um sacrifício entrega material em troca de ataque, tempo ou uma posição melhor. Antes de sacrificar, calcule o que você ganha no fim da sequência.',
        'sacrificio',
        'expert',
      ),
      puzzles(
        'avancado-silencioso',
        'Lance silencioso',
        'O lance silencioso não dá xeque nem captura, mas cria uma ameaça que não tem defesa. Ele é o mais difícil de enxergar.',
        'lance_silencioso',
        'expert',
      ),
      puzzles(
        'avancado-peca-presa',
        'Peça presa',
        'Uma peça sem casas para fugir pode ser cercada e capturada. Tire as saídas dela antes de atacar.',
        'peca_presa',
        'expert',
      ),
      puzzles(
        'avancado-zugzwang',
        'Zugzwang de mestre',
        'No nível de mestre, o zugzwang aparece em finais e também no meio de jogo. Procure os lances que tiram todas as boas opções do adversário.',
        'zugzwang',
        'expert',
      ),
    ],
  },
  {
    id: 'partidas-lendarias',
    level: 4,
    title: 'Partidas lendárias',
    activities: [
      {
        id: 'lendaria-legal',
        title: 'O mate de Légal (Paris, 1750)',
        steps: [
          {
            kind: 'info',
            say: 'Kermur de Légal, de brancas, mostrou numa partida de café que a dama pode valer menos que um ataque bem armado. Você faz os lances de Légal.',
          },
          {
            kind: 'info',
            say: 'Depois de 1.e4 e5 2.Cf3 d6 3.Bc4 Bg4 4.Cc3 g6, o bispo preto crava o cavalo de f3 na dama. Parece que o cavalo não pode sair.',
            fen: 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5',
            show: { from: 'g4', to: 'd1' },
          },
          {
            kind: 'move',
            say: 'Saia da cravada assim mesmo: o cavalo captura o peão de e5.',
            fen: 'rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5',
            accept: ['f3e5'],
            reply: 'g4d1',
          },
          {
            kind: 'move',
            say: 'As pretas pegaram a dama. Agora dê xeque com o bispo em f7.',
            fen: 'rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P3/2N5/PPPP1PPP/R1BbK2R w KQkq - 0 6',
            accept: ['c4f7'],
            reply: 'e8e7',
          },
          {
            kind: 'mate',
            say: 'Três peças menores contra o rei: dê o xeque-mate.',
            fen: 'rn1q1bnr/ppp1kB1p/3p2p1/4N3/4P3/2N5/PPPP1PPP/R1BbK2R w KQ - 1 7',
          },
        ],
      },
      {
        id: 'lendaria-morphy-opera',
        title: 'Morphy na ópera (Paris, 1858)',
        steps: [
          {
            kind: 'info',
            say: 'Paul Morphy, de brancas, jogou esta partida num camarote da Ópera de Paris. Ela mostra como desenvolvimento rápido e linhas abertas vencem. Você faz os lances de Morphy.',
          },
          {
            kind: 'info',
            say: 'Depois de 1.e4 e5 2.Cf3 d6 3.d4 Bg4 4.dxe5 Bxf3 5.Dxf3 dxe5 6.Bc4 Cf6, as pretas trocaram o bispo e ficaram atrasadas no desenvolvimento.',
            fen: 'rn1qkb1r/ppp2ppp/5n2/4p3/2B1P3/5Q2/PPP2PPP/RNB1K2R w KQkq - 2 7',
          },
          {
            kind: 'move',
            say: 'Ataque duplo: a dama mira f7 e b7 ao mesmo tempo. Jogue Db3.',
            fen: 'rn1qkb1r/ppp2ppp/5n2/4p3/2B1P3/5Q2/PPP2PPP/RNB1K2R w KQkq - 2 7',
            accept: ['f3b3'],
            reply: 'd8e7',
          },
          {
            kind: 'info',
            say: 'Morphy seguiu com 8.Cc3 c6 9.Bg5 b5 e sacrificou o cavalo: 10.Cxb5! cxb5 11.Bxb5+ Cbd7. Material importa menos que abrir linhas contra o rei.',
            fen: 'r3kb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/R3K2R w KQkq - 1 12',
          },
          {
            kind: 'move',
            say: 'Traga a última peça para a luta: faça o roque grande e ponha a torre na coluna d.',
            fen: 'r3kb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/R3K2R w KQkq - 1 12',
            accept: ['e1c1'],
            reply: 'a8d8',
          },
          {
            kind: 'move',
            say: 'O cavalo de d7 está cravado. Capture-o com a torre.',
            fen: '3rkb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR3R w k - 3 13',
            accept: ['d1d7'],
            reply: 'd8d7',
          },
          {
            kind: 'info',
            say: 'Depois de 14.Td1 De6 15.Bxd7+ Cxd7, chega o golpe final.',
            fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16',
          },
          {
            kind: 'move',
            say: 'Sacrifique a dama em b8 para desviar o cavalo que defende d8.',
            fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16',
            accept: ['b3b8'],
            reply: 'd7b8',
          },
          {
            kind: 'mate',
            say: 'Termine como Morphy: xeque-mate.',
            fen: '1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 17',
          },
        ],
      },
      {
        id: 'lendaria-imortal',
        title: 'A Imortal (Londres, 1851)',
        steps: [
          {
            kind: 'info',
            say: 'Adolf Anderssen, de brancas, entregou um bispo, as duas torres e a dama para dar mate com as peças menores. Você faz os lances finais.',
          },
          {
            kind: 'info',
            say: 'Depois de 1.e4 e5 2.f4 exf4 3.Bc4 Dh4+ 4.Rf1, o rei branco não pode mais rocar, mas as brancas ganham tempo atacando a dama preta.',
            fen: 'rnb1kbnr/pppp1ppp/8/8/2B1Pp1q/8/PPPP2PP/RNBQ1KNR b kq - 3 4',
          },
          {
            kind: 'info',
            say: 'Lance 18: as brancas já entregaram um bispo e agora deixam as duas torres. Em troca, todas as peças brancas atacam o rei preto, que ainda está no centro.',
            fen: 'rnb1k1nr/p2p1ppp/8/1pbN1N1P/4PBP1/3P1Q2/PqP5/R4KR1 w kq - 0 18',
          },
          {
            kind: 'info',
            say: 'Depois de 18.Bd6 Bxg1 19.e5 Dxa1+ 20.Re2 Ca6, as pretas têm muito mais material, mas as peças delas estão longe do rei.',
            fen: 'r1b1k1nr/p2p1ppp/n2B4/1p1NPN1P/6P1/3P1Q2/P1P1K3/q5b1 w kq - 2 21',
          },
          {
            kind: 'move',
            say: 'Dê xeque com o cavalo capturando em g7.',
            fen: 'r1b1k1nr/p2p1ppp/n2B4/1p1NPN1P/6P1/3P1Q2/P1P1K3/q5b1 w kq - 2 21',
            accept: ['f5g7'],
            reply: 'e8d8',
          },
          {
            kind: 'move',
            say: 'Sacrifique a dama com xeque em f6 para atrair o cavalo de g8.',
            fen: 'r1bk2nr/p2p1pNp/n2B4/1p1NP2P/6P1/3P1Q2/P1P1K3/q5b1 w - - 1 22',
            accept: ['f3f6'],
            reply: 'g8f6',
          },
          {
            kind: 'mate',
            say: 'Agora o bispo dá xeque-mate.',
            fen: 'r1bk3r/p2p1pNp/n2B1n2/1p1NP2P/6P1/3P4/P1P1K3/q5b1 w - - 0 23',
          },
        ],
      },
      {
        id: 'lendaria-reti',
        title: 'Réti contra Tartakower (Viena, 1910)',
        steps: [
          {
            kind: 'info',
            say: 'Richard Réti, de brancas, venceu em onze lances. A partida mostra o poder do xeque duplo. Você faz os lances de Réti.',
          },
          {
            kind: 'info',
            say: 'Depois de 1.e4 c6 2.d4 d5 3.Cc3 dxe4 4.Cxe4 Cf6 5.Dd3 e5 6.dxe5 Da5+ 7.Bd2 Dxe5, as brancas têm a dama e a torre prontas na coluna d.',
            fen: 'rnb1kb1r/pp3ppp/2p2n2/4q3/4N3/3Q4/PPPB1PPP/R3KBNR w KQkq - 0 8',
          },
          {
            kind: 'move',
            say: 'Faça o roque grande e ponha a torre na coluna aberta, de frente para o rei preto.',
            fen: 'rnb1kb1r/pp3ppp/2p2n2/4q3/4N3/3Q4/PPPB1PPP/R3KBNR w KQkq - 0 8',
            accept: ['e1c1'],
            reply: 'f6e4',
          },
          {
            kind: 'move',
            say: 'O cavalo preto capturou o seu. Sacrifique a dama em d8 com xeque.',
            fen: 'rnb1kb1r/pp3ppp/2p5/4q3/4n3/3Q4/PPPB1PPP/2KR1BNR w kq - 0 9',
            accept: ['d3d8'],
            reply: 'e8d8',
          },
          {
            kind: 'move',
            say: 'Xeque duplo: o bispo sai para g5, dá xeque e revela o xeque da torre de d1.',
            fen: 'rnbk1b1r/pp3ppp/2p5/4q3/4n3/8/PPPB1PPP/2KR1BNR w - - 0 10',
            accept: ['d2g5'],
            reply: 'd8c7',
          },
          {
            kind: 'mate',
            say: 'Termine com o bispo: xeque-mate.',
            fen: 'rnb2b1r/ppk2ppp/2p5/4q1B1/4n3/8/PPP2PPP/2KR1BNR w - - 2 11',
          },
        ],
      },
      {
        id: 'lendaria-lasker',
        title: 'A caça ao rei (Londres, 1912)',
        steps: [
          {
            kind: 'info',
            say: 'Edward Lasker, de brancas, sacrificou a dama e levou o rei preto de g8 até g1 com xeques. Você faz os lances de Lasker.',
          },
          {
            kind: 'info',
            say: 'Depois de 1.d4 e6 2.Cf3 f5 3.Cc3 Cf6 4.Bg5 Be7 5.Bxf6 Bxf6 6.e4 fxe4 7.Cxe4 b6 8.Ce5 O-O 9.Bd3 Bb7 10.Dh5 De7, todas as peças brancas miram o roque preto.',
            fen: 'rn3rk1/pbppq1pp/1p2pb2/4N2Q/3PN3/3B4/PPP2PPP/R3K2R w KQ - 6 11',
          },
          {
            kind: 'move',
            say: 'Sacrifique a dama em h7 com xeque.',
            fen: 'rn3rk1/pbppq1pp/1p2pb2/4N2Q/3PN3/3B4/PPP2PPP/R3K2R w KQ - 6 11',
            accept: ['h5h7'],
            reply: 'g8h7',
          },
          {
            kind: 'move',
            say: 'Xeque descoberto: o cavalo captura em f6 e o bispo de d3 dá xeque.',
            fen: 'rn3r2/pbppq1pk/1p2pb2/4N3/3PN3/3B4/PPP2PPP/R3K2R w KQ - 0 12',
            accept: ['e4f6'],
            reply: 'h7h6',
          },
          {
            kind: 'info',
            say: 'Seguiram 13.Ceg4+ Rg5 14.h4+ Rf4 15.g3+ Rf3 16.Be2+ Rg2 17.Th2+ Rg1. O rei preto atravessou o tabuleiro inteiro.',
            fen: 'rn3r2/pbppq1p1/1p2pN2/8/3P2NP/6P1/PPP1BP1R/R3K1k1 w Q - 5 18',
          },
          {
            kind: 'mate',
            say: 'O rei preto está na sua primeira fileira. Dê o xeque-mate.',
            fen: 'rn3r2/pbppq1p1/1p2pN2/8/3P2NP/6P1/PPP1BP1R/R3K1k1 w Q - 5 18',
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
