# Geração de exercícios táticos em escala (mate em N)

Data: 2026-07-22
Sub-projeto 2 de 8.

## Problema

O usuário pediu para verificar se existem exercícios com mais de 1 lance (mate
em 2, mate em 3 etc.) e, se houver poucos, criar "muito mais" exercícios de
vários temas, para o aluno ter meses de conteúdo (≈3h/dia).

## Diagnóstico

- Exercícios jogáveis no tabuleiro (`legal_position` + `move_sequence`) eram só
  ~21 (migrations 0011/0012/0013). Multi-lance real: praticamente 1 (o mate em
  dois `Qg8+ Rxg8 Nf7#`).
- Os 1.298 exercícios do livro são `free_text` (reflexão), sem tabuleiro.

## Objetivo

Aumentar substancialmente o número de exercícios táticos jogáveis, verificados,
multi-lance, sem depender de dados externos nem inchar o banco.

## Decisão de abordagem

Descartado (por ora): importar o banco aberto de puzzles do **Lichess** (CC0,
~4M). É o padrão da indústria e a via correta para escala real ("meses"), mas
são centenas de MB e milhões de linhas num Postgres que roda numa **VPS
compartilhada com sistemas de produção de terceiros** e já apertada de RAM —
importar isso poderia degradar os vizinhos, violando a restrição do usuário de
não prejudicar sistemas existentes. Fica registrado como decisão futura do
usuário (exige dimensionamento de banco).

Escolhido: **gerar programaticamente** puzzles de mate (em 1, 2 e 3 lances) com
um mini-solver de mate forçado em chess.js, garantindo:

- primeiro lance único (chave inequívoca);
- linha totalmente forçada e verificada (todas as respostas do adversário
  levam a mate no prazo);
- linhas de solução interligadas `[atacante, defensor, ...]` compatíveis com o
  grader incremental do SP1 — então funcionam com avaliação automática de graça.

## Arquitetura

- `packages/chess-domain/src/mate-solver.ts` (testado, roda no CI):
  - `forcedMateInAtMost(chess, n)` — busca de mate forçado.
  - `findMateFirstMoves(fen, n, checkFirstOnly?)` — primeiros lances que dão
    mate em exatamente n (opção "só xeques" para gerar mates instrutivos e
    acelerar a busca).
  - `buildSolutionLines(fen, n, firstMove, checkFirstOnly?)` — linhas
    interligadas por ramo de resposta do defensor.
  - `hasCheckingMove(fen)` / `isPlayableStart(fen)` — filtros baratos.
- `scripts/generate-tactics.mjs` — gera posições aleatórias com o rei preto na
  borda e peças atacantes perto do rei (alta taxa de mate), verifica cada uma
  com o solver, deduplica e emite `database/migrations/0015_generated_mates.up/
.down.sql`. Orçamento de tempo por profundidade para nunca travar.

## Taxonomia

Puzzles gerados recebem tags `classico` + tema (`mate_em_um/dois/tres`) +
`mate`, `external_id` `gen-mate-0015-NNNN`. Entram no **pool de Exercícios**
(filtro Clássicos e "Todos"), não na trilha curada de Desafios. `answerFormat`
`move_sequence`, `position_type` `legal_position`, `status` `published`.

## CI / migração

O step "Verify latest migration rollback and reapply" é round-trip
(before==after) e não usa contagem fixa, então a 0015 é coberta
automaticamente. A migração é SQL puro (ignorada pelo Prettier via
`/database/`).

## Testes

- `mate-solver.test.ts`: mate em 1, exclusão de mate-em-1 falso, mate em 2 +
  linha, profundidade forçada, detecção de xeque disponível, rejeição de
  posição ilegal.
- Verificação de cada puzzle é intrínseca à geração (o solver produz e confere
  a linha).

## Fora de escopo

- Import do Lichess (decisão futura do usuário, ver acima).
- Exercícios táticos não-mate (garfo/cravada/espeto) em escala — os curados
  seguem nas migrations 0011-0013; geração automática desses temas exigiria
  detecção de motivo tático, fora deste sub-projeto.
