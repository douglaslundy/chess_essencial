# Curso do Zero ao Avançado (rating 0 → 2500)

Documento-fonte do novo curso. Pedido do usuário em 2026-11-01. **Ignorar o sistema atual de cursos/aulas/Jornada** (módulos `courses`, `lesson-runtime`, `learning-path`, rotas `/app/aula`, `/app/treinamento`, livro): o curso novo é independente. Pode-se *reaproveitar componentes de UI* (tabuleiro, voz, balão do Treinador), não o modelo de dados nem o conteúdo antigo.

## O que o usuário quer (palavras dele, resumidas)

- Curso do rating 0 ao ~2500 seguindo uma metodologia: mover as peças → aberturas → meio de jogo → finais → mates (ex.: "mate de escadinha").
- Formato dinâmico: cada atividade tem ~5 instruções/slides. O Treinador passa a instrução (texto + voz), o aluno executa no tabuleiro, e uma setinha avança para a próxima.
  - Exemplo dele: "O bispo move sempre na diagonal… agora mova o bispo" → aluno move → próxima.
- Bom e eficiente; tabuleiro no padrão já aprovado (fixo, responsivo, centralizado; o Treinador não pode encolher o tabuleiro).

## Fontes pesquisadas (2026-11-01)

| Fonte | Uso | Licença / cuidado |
|---|---|---|
| **Lichess "Aprenda"**: `lichess-org/lila`, pasta `ui/learn/src/stage/*.ts` | Nível 0 inteiro. 20 etapas, cada uma com 5–8 níveis `{goal, fen, apples (estrelas), nbMoves, shapes (setas)}`. | Código AGPL-3.0. **Reescrever no nosso formato**: posições e ideias sim, código não. |
| Textos pt-BR do "Aprenda": `translation/dest/learn/pt-BR.xml` (mesmo repositório) | Referência de tom e conteúdo. | Também no repositório AGPL: escrever textos próprios, sem colar. |
| **Lichess "Prática"**: `modules/practice/src/main/PracticeSections.scala` | Temas dos níveis 1–4. Seções e IDs de estudo listados abaixo. | **Licença dos estudos NÃO confirmada** (Cloudflare bloqueou os termos). Confirmar antes de importar PGN (`https://lichess.org/api/study/{id}.pgn`). Se não puder, usar só os temas e montar as posições. |
| **Banco de problemas da Lichess (CC0)** | Exercícios táticos por rating e tema. | Domínio público. |
| Método dos Passos (Stappenmethode, Brunia & van Wijgerden), Passos 1–6 | **Só a ordem dos temas** (Passo 1 ≈ até 800 … Passo 6 ≈ 2100–2200 FIDE). | Livros protegidos: não copiar conteúdo. |
| ChessDojo 0–2400 | Descartado (pago e fechado). | — |

As 20 etapas do "Aprenda", na ordem do `list.ts`:
- **Peças:** rook, bishop, queen, king, knight, pawn.
- **Regras:** setup, castling, enpassant, stalemate.
- **Combate:** capture, protection, combat, value, fork.
- **Xeque e mate:** check1, outOfCheck, checkmate1, check2.

Seções da "Prática":
- **checkmates:** 7 estudos (BJy6fEDf, fE4k21MW, 8yadFPpU, PDkQDt6u, 96Lij7wH, Rg2cMBZ6, ByhlXnmM).
- **fundamental-tactics:** 8 estudos.
- **advanced-tactics:** 10 estudos.
- **pawn-endgames:** 3 estudos.
- **rook-endgames:** 4 estudos.

O nosso banco já tem os problemas com temas: tabela de exercícios, coluna `tags`, filtro por tema em `apps/api/src/exercises/exercises.repository.ts`.

## Trilha (níveis do curso)

| Nível | Faixa | Módulos | Fonte |
|---|---|---|---|
| 0 Regras | 0–400 | As 20 etapas do "Aprenda", reescritas | Aprenda |
| 1 Iniciante | 400–1000 | Mates básicos (dama, torre, duas torres em escadinha), valor das peças, táticas de 1 lance | Prática "checkmates" + problemas 400–1000 |
| 2 Básico | 1000–1500 | Princípios de abertura (centro, desenvolvimento, roque), táticas fundamentais (garfo, cravada, espeto, ataque descoberto) | Prática "fundamental-tactics" + problemas 1000–1500 |
| 3 Intermediário | 1500–1900 | Meio de jogo (planos, estrutura de peões), táticas avançadas, finais de peões | Prática "advanced-tactics" e "pawn-endgames" + problemas |
| 4 Avançado | 1900–2500 | Finais de torre, estratégia, partidas lendárias comentadas | Prática "rook-endgames", coleção `legendary` da biblioteca, problemas acima de 1900 |

## Modelo de conteúdo (proposto)

Conteúdo **em arquivos versionados no repositório** (TS/JSON), não no banco. Assim não há migração, e a próxima migração exige restic na VPS. Para editar o conteúdo, faz-se commit.

```ts
type CourseStep =
  | { kind: 'info'; say: string; fen?: string; arrows?: Arrow[] }      // só instrução, setinha avança
  | { kind: 'stars'; say: string; fen: string; stars: string[]; maxMoves?: number } // pegue as estrelas (estilo "Aprenda")
  | { kind: 'move'; say: string; fen: string; accept: string[] /* UCI */; reply?: string /* UCI do adversário */ }
  | { kind: 'mate'; say: string; fen: string; inMoves: number }       // validado pelo chess.js (isCheckmate)
  | { kind: 'puzzle'; say: string; theme: string; ratingMin: number; ratingMax: number }; // puxa do banco
interface CourseActivity { id: string; title: string; steps: CourseStep[] }   // cerca de 5 passos
interface CourseModule { id: string; level: 0|1|2|3|4; title: string; activities: CourseActivity[] }
```

- **`say`:** é o que o Treinador mostra e fala, com `speak(speakableSquares(say), { interrupt: true })`.
- **`stars`:** a peça precisa passar por todas as casas marcadas, sem ser capturada.
- **Validação:** feita no cliente com chess.js. Lição não é partida avaliada, então a regra de "servidor autoritativo" do AGENTS.md (relógio, resultado e rating) não se aplica. O progresso, sim, vai para o servidor quando houver tabela.
- **Progresso, fase 1:** `localStorage` por usuário, no mesmo padrão de `apps/web/src/components/library/watched-games.ts`.
- **Progresso, fase 2:** migração de progresso, que exige restic.

## UI (reaproveitar o que já está aprovado)

- **Rota nova:** `/app/curso` com o mapa de níveis e módulos, e `/app/curso/[atividade]` com o player.
- **Esqueleto:** o da partida, que o usuário aprovou: `gamePage` / `boardColumn` / `boardStage` / `historyControls`.
  - Referências: `apps/web/src/components/library/library-study-room.tsx` e `apps/web/src/components/history/review-room.tsx`.
- **Treinador:** `CoachCallout` (`apps/web/src/components/coach/coach-callout.tsx`).
  - Fica dentro do quadro e não pode empurrar o tabuleiro.
  - Pendência aberta do usuário: no 2D, o balão ainda encolhe o tabuleiro.
- **Tabuleiro:** `ChessBoard` (`apps/web/src/components/game/chess-board.tsx`).
  - Já tem `hint` (caminho azul até a casa-alvo), útil para a dica.
  - Já tem a opção "Nome das casas".
  - Faltam as estrelas: criar uma prop `marks` ou reusar o estilo `hintTarget`.
- **Voz:** `speak`/`stopSpeaking` (`apps/web/src/lib/speech.ts`).
  - Cortar a fala ao avançar ou mover, como já acontece na partida.
  - O roque já é falado como "roque pequeno/grande".
- **Controles:** ◀ passo anterior, ▶ próximo (liberado só depois de cumprir o passo), ↻ refazer, 🔊 voz.
- **Seções do menu:** adicionar "Curso" em `apps/web/src/components/navigation/app-chrome.tsx`.

## Fases de entrega

1. **CURSO-01:** tipos, player e o 1º módulo (torre e bispo, uns 10 passos) funcionando de ponta a ponta, com testes de validação de cada tipo de passo.
2. **CURSO-02:** as outras etapas do nível 0: rainha, rei, cavalo, peão, posição inicial, roque, en passant, afogamento, captura, proteção, combate, valor, garfo, xeques e mate em 1.
3. **CURSO-03:** mapa `/app/curso` com progresso (localStorage), cadeado por ordem e selo de concluído.
4. **CURSO-04:** confirmar a licença dos estudos da "Prática". Depois, nível 1 (mates básicos e escadinha) com passos `mate`, mais o tipo `puzzle` puxando do banco por tema e rating.
5. **CURSO-05 em diante:** níveis 2, 3 e 4, e o progresso no servidor (migração só com restic).

Cada fase:
- Rodar lint, typecheck e testes.
- Conferir no harness esbuild (`apps/web/.harness`, servido em `127.0.0.1:8779` a partir de `.harness/r`).
- Conferir no celular, a 390px.
- Commit e push na `main`. O deploy é pelo Git pull, nunca por SSH.
