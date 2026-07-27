# Arquitetura Atual do Sistema de Exercícios/Desafios — Auditoria (Fase 1)

> Documento somente-leitura, gerado por auditoria de código em 2026-07-27. Cobre exclusivamente o que existe HOJE no monorepo `Xadrez_Platform_Codex_Blueprint`. Não contém propostas de solução nova — serve de base factual para um trabalho de arquitetura futuro (transformação em "jornada de aprendizagem" por níveis). Todas as afirmações técnicas trazem citação `arquivo:linha`.

---

## 1. Stack e arquitetura geral

- **Backend**: NestJS 11 (`apps/api/package.json:24` — `@nestjs/core: 11.1.28`) rodando sobre Fastify (`apps/api/package.json:38` — `fastify: 5.10.0`; confirmado pelo uso de `FastifyRequest` em `apps/api/src/auth/access-token.guard.ts:2`).
- **Banco de dados**: PostgreSQL acessado via **dois caminhos distintos no mesmo processo**:
  - `postgres` (driver `postgres.js`, tagged-template SQL) — é o único caminho usado pelo domínio de exercícios (`apps/api/src/exercises/exercises.repository.ts`, todo o arquivo usa `this.database.client` com template strings SQL cruas).
  - `drizzle-orm/postgres-js` — existe e está montado (`apps/api/src/database/database.service.ts:3,18`), mas **nenhuma tabela do domínio de exercícios está modelada no schema Drizzle** (`apps/api/src/database/schema.ts` define 21 tabelas — users, games, lessons etc. — mas não `exercises`, `exercise_attempts`, `exercise_training_sessions/items`, `lesson_exercises`; confirmado por busca textual, zero ocorrências de "exercise" no arquivo). Ou seja: **o domínio de exercícios é 100% SQL cru, nunca passou pelo ORM tipado**.
- **Frontend**: Next.js 16 / React 19 (`apps/web/package.json:18-19`). Nenhuma biblioteca de gerenciamento de estado global (Redux, Zustand, Jotai, Recoil) nem de data-fetching (`@tanstack/react-query`, SWR) está nas dependências — confirmado por busca vazia em `apps/web/package.json`. Todo estado é `useState`/`useEffect`/`useRef` local ao componente React.
- **Motor de regras de xadrez**:
  - `chess.js` 1.4.0 é a biblioteca subjacente, usada tanto no servidor quanto no cliente (`apps/api/package.json` via `packages/chess-domain`; `apps/web/package.json:17`).
  - `packages/chess-domain` é um pacote compartilhado que embrulha `chess.js` numa classe `ChessJsRules` (`packages/chess-domain/src/chessjs-rules.ts:16-156`) usada pelo backend (jogo, exercícios, matchmaking) e também por dois pontos do frontend (`apps/web/src/components/game/game-room.tsx`, `apps/web/src/lib/engine/use-coach-engine.ts` — ver seção 6 para a ressalva importante sobre exercícios).
  - `packages/chess-domain/src/mate-solver.ts` — solver de mate em N (1/2/3), usado para gerar taticamente exercícios em massa via `scripts/generate-tactics.mjs` (não faz parte do runtime de produção do fluxo de exercícios, é uma ferramenta de geração de conteúdo offline).
- **Tabuleiro**: componente 100% próprio (não é `react-chessboard`, `chessground`, `chess-ground` etc.) — `apps/web/src/components/game/chess-board.tsx` (397 linhas), com peças renderizadas em SVG inline (três temas: clássico/madeira/staunton-3d).
- **Contratos compartilhados**: `packages/contracts/src/exercise.ts` — schemas Zod compartilhados entre backend (validação de entrada) e frontend (tipos TypeScript inferidos via `z.infer`).
- **Engine de análise (tipo Stockfish)**: existe no repositório (`apps/web/src/lib/engine/browser-engine.ts:11` carrega `/engine/stockfish-18-lite-single.js` como Web Worker; também há `apps/worker/src/engine/stockfish-engine.ts` no lado servidor), mas **não é usada em nenhum ponto do fluxo de exercícios/desafios** — ver seção 6.

---

## 2. Rotas

### Frontend (Next.js App Router)

| Rota | Arquivo | O que renderiza |
|---|---|---|
| `/app/exercicios` | `apps/web/src/app/app/exercicios/page.tsx:1-13` | `<ExerciseTrainer guided showSourceFilter storageKey="xadrez.exercicios_session" .../>` — catálogo de exercícios (livro + clássicos), exclui por padrão tudo com a tag `challenge`. |
| `/app/desafios` | `apps/web/src/app/app/desafios/page.tsx:1-5` | `<ChallengeHub />`, que por sua vez renderiza `<ExerciseTrainer guided initialQuery="challenge" positionType="legal_position" showThemeFilter .../>` (`apps/web/src/components/challenges/challenge-hub.tsx:6-20`) — pool de itens marcados `challenge`, navegável por tema tático. |

Não há sub-rotas adicionais (ex. `/app/desafios/[tema]` ou `/app/exercicios/[id]`) — tudo é resolvido por estado de query string interno ao componente `ExerciseTrainer`, nunca por rota Next.js distinta.

### Backend (todas sob `AccessTokenGuard`, `apps/api/src/exercises/exercises.controller.ts:16`)

| Método | Path | Handler | Função |
|---|---|---|---|
| GET | `/exercises` | `search` (`exercises.controller.ts:21-24`) | Busca paginada com filtros (categoria, capítulo, dificuldade, módulo, tipo de posição, texto livre `q`, `source`, `theme`, `lessonId`). |
| GET | `/exercises/challenge-themes` | `listChallengeThemes` (`:26-29`) | Lista temas táticos catalogados (tags) dos exercícios `challenge`, com contagem de itens ainda não resolvidos pelo usuário. |
| POST | `/exercise-training-sessions` | `startTraining` (`:31-37`) | Cria uma sessão de treino (lote de exercícios) a partir de filtros. |
| GET | `/exercise-training-sessions/:sessionId` | `training` (`:39-42`) | Retorna estado atual da sessão (exercício corrente, progresso, status). |
| POST | `/exercise-training-sessions/:sessionId/hints` | `hint` (`:44-47`) | Revela a próxima dica do exercício corrente da sessão (consome quota do plano). |
| POST | `/exercise-training-sessions/:sessionId/solution` | `solution` (`:49-52`) | Revela a solução completa do exercício corrente da sessão. |
| POST | `/exercises/:exerciseId/attempts` | `attempt` (`:54-65`) | Submete uma tentativa (linha completa de lances ou autoavaliação) e grava o resultado. |
| POST | `/exercises/:exerciseId/evaluate-line` | `evaluateLine` (`:67-78`) | Avalia lance-a-lance contra a linha de solução gravada (usado pelo tabuleiro interativo). |
| GET | `/exercises/:exerciseId/study` | `study` (`:80-83`) | Retorna o conteúdo de estudo da aula vinculada (texto + páginas), sem exigir progresso de sessão. |
| GET | `/exercise-metrics` | `metrics` (`:85-88`) | Métricas agregadas do usuário (tentativas, acertos, precisão, tempo médio, dicas usadas). |

Todos os endpoints validam entrada via `parseInput()` (`apps/api/src/common/http/parse-input.js`) com os schemas Zod de `packages/contracts`.

---

## 3. Componentes de frontend

Árvore real (de cima para baixo):

```
/app/exercicios (page.tsx)                  /app/desafios (page.tsx)
        │                                            │
        ▼                                            ▼
  ExerciseTrainer                            ChallengeHub (challenge-hub.tsx:6-20)
  (guided, showSourceFilter)                          │
        │                                             ▼
        │                                    ExerciseTrainer
        │                                    (guided, initialQuery="challenge",
        │                                     positionType="legal_position",
        │                                     showThemeFilter)
        └──────────────┬──────────────────────────────┘
                        ▼
         apps/web/src/components/exercises/exercise-trainer.tsx (1025 linhas)
                        │
          ┌─────────────┼───────────────────────┬─────────────────────┐
          ▼             ▼                       ▼                     ▼
     ChessBoard   MoveAnnouncement      (lib/sound: play*Sound)   api client
  (game/chess-board.tsx)  (game/move-announcement.tsx)         (lib/api/client.ts)
```

- **`ChallengeHub`** (`apps/web/src/components/challenges/challenge-hub.tsx`): componente "fino" — não tem lógica própria de busca/estado, apenas passa props fixas (`initialQuery="challenge"`, `positionType="legal_position"`, `showThemeFilter`, `storageKey` diferente) para `ExerciseTrainer`. **Não existe um componente `ChallengeHub` com lógica própria de sessão, listagem ou grid** — é inteiramente delegado.
- **`ExerciseTrainer`** (`apps/web/src/components/exercises/exercise-trainer.tsx`) é o componente central e único que efetivamente executa exercício/desafio (tabuleiro + validação de lance + dicas + feedback), tanto em `/app/exercicios` quanto em `/app/desafios`. Props principais (`:72-82`): `guided`, `initialDifficulty`, `initialQuery`, `positionType`, `showSourceFilter`, `showThemeFilter`, `storageKey`, `title`, `description`. O comportamento muda bastante conforme `guided`:
  - `guided=false` (não usado por nenhuma rota atual, mas suportado): modo "catálogo" — grid de busca livre com filtros de texto/categoria/dificuldade/módulo (`:665-701`, `:961-982`), sem sessão automática.
  - `guided=true` (usado por ambas as rotas): modo "treino guiado" — inicia/retoma sessão automaticamente (`:267-272`), esconde o grid de busca, mostra um exercício por vez com tabuleiro jogável.
- **Sub-componentes renderizados por `ExerciseTrainer`**:
  - `ChessBoard` (`apps/web/src/components/game/chess-board.tsx`) — tabuleiro interativo, **compartilhado com o modo de partida/análise** (ver seção 15).
  - `MoveAnnouncement` (`apps/web/src/components/game/move-announcement.tsx`) — balão flutuante "Xeque!", "Xeque-mate!", "Captura em X", "Promoção!", "Roque"; é 100% local/client-side, calculado a partir da notação SAN do próprio `chess.js` (`describeImportantMove`, `move-announcement.tsx:18-30`), **não depende de nenhuma chamada de rede**.
  - `<select>` de tema tático (`exercise-trainer.tsx:651-663`) — renderizado apenas quando `showThemeFilter=true` (ou seja, só em `/app/desafios`). Populado por `themes` (estado local) vindo de `api.listChallengeThemes()`.
  - Botões de fonte/origem (`exercise-trainer.tsx:630-649`) — "Todos"/"Mates clássicos"/"Livro", renderizados só quando `showSourceFilter=true` (só em `/app/exercicios`).
  - Painel de estudo colapsável (`:752-782`) — só para exercícios `answerFormat === 'free_text'` (exercícios do livro), busca texto da aula vinculada via `GET /exercises/:id/study`.
  - Modal de resultado (`:984-1022`) — "Você venceu!"/"Não foi dessa vez", com botões "Tentar novamente" e "Próximo exercício →".

---

## 4. Estado global/local

**Não há estado global** (nem Context API dedicado, nem lib de state management). Todo o estado de "sessão de treino atual" vive como `useState` dentro do próprio componente `ExerciseTrainer` (`exercise-trainer.tsx:95-132`):

- `training: ExerciseTrainingView | null` (`:105`) — objeto retornado pelo servidor com `sessionId`, `currentExercise`, `position`, `total`, `completed`, `status`. É a **fonte de verdade autoritativa** de "qual exercício está ativo" e "quantos já foram feitos" — vem sempre do backend, nunca é computado no cliente.
- `exerciseHistory` (`:117-119`) e `viewingExerciseAt` (`:120`) — histórico local (client-side apenas) dos exercícios já resolvidos na sessão corrente, para permitir "Exercício anterior/próximo" sem nova chamada de rede (`:381-408`).
- `boardHistory` (`:127-132`) — histórico local de lances feitos no tabuleiro do exercício atual (para os botões "Voltar lance"/"Repetir lance", `:590-600`), reconstruído a partir do FEN inicial + lances aplicados via `chess.js` no cliente.
- **Persistência entre sessões do navegador**: `window.localStorage`, chave `sessionStorageKey(storageKey, source, theme)` (`:59-61`) → guarda o `sessionId` ativo por combinação de (rota × fonte × tema), permitindo retomar de onde parou ao trocar de aba/tema e voltar (`resumeOrStart`, `:237-265`). `storageKey` é passado como prop diferente por rota (`"xadrez.exercicios_session"` vs `"xadrez.desafios_session"`), então as duas telas têm sessões independentes mesmo compartilhando o mesmo componente.
- O `token()` de acesso é lido diretamente de `window.localStorage.getItem('xadrez.access_token')` a cada chamada (`:134-136`), sem contexto de autenticação React.

---

## 5. Componente do tabuleiro

`apps/web/src/components/game/chess-board.tsx` — implementação própria (sem dependência de terceiros para o tabuleiro em si), usando `chess.js` apenas para calcular lances legais no cliente.

- **Entrada de posição**: prop `fen: string` (`:201`). Internamente, `new Chess(fen)` (`:219-225`, dentro de `useMemo`); se o FEN for inválido, cai para `null` e usa `diagramPieces(fen)` como fallback "somente leitura" (parser manual de FEN só para desenhar peças sem validar legalidade — usado para `illustrative_diagram`, `:171-192`).
- **Como reporta lances ao pai**: prop `onMove: (uci: string) => void` (`:206`). Clique/drag numa casa de destino legal chama `onMove(`${from}${to}`)` (ou com sufixo de promoção) — **nunca objetos `Move` do chess.js, sempre string UCI crua** (`attempt()`, `:239-252`; escolha de promoção, `:374-388`). O componente pai (`ExerciseTrainer.playBoardMove`, `exercise-trainer.tsx:441-494`) é quem decide o que fazer com o lance (aplicar localmente, chamar `evaluate-line`, etc.).
- **Destaques/realces existentes**: apenas três classes CSS condicionais por casa (`chess-board.tsx:320-326`):
  - `selectedSquare` — casa de origem selecionada.
  - `targetSquare` — casas de destino legais da peça selecionada (bolinha via `<span className="moveTarget">`, `:346-348`).
  - `lastMoveSquare` — casa de origem/destino do prop `lastMove` (`:204`, `:312`).
- **Setas**: **não existe nenhuma funcionalidade de desenhar setas** (nem SVG overlay, nem lib de anotação tipo `chessground`'s `drawable`). Busca textual por "arrow"/"Arrow" no componente só encontra os nomes das teclas de navegação por teclado (`ArrowLeft/Right/Up/Down`, `:276-279`), não relacionado a anotação visual. **Isso é um ponto de atenção explícito para o próximo spec, que pretende pedir isso.**
- Suporta `disabled`, `movableColor` (restringe quais peças podem ser arrastadas/clicadas, `:255-265`, `:327-331`), navegação por teclado (setas movem o foco entre casas, `:273-288`), e diálogo de escolha de promoção (`:364-394`).

---

## 6. Motor de xadrez — legalidade e engine de análise

- **Cliente**: `chess.js` é usado **diretamente** em dois lugares do fluxo de exercícios — dentro do próprio `chess-board.tsx` (cálculo de lances legais para destacar destinos e validar arrasto) e dentro de `exercise-trainer.tsx` (`import { Chess } from 'chess.js'`, `:12`) para aplicar o lance do jogador localmente, detectar captura/roque/promoção/xeque para a `MoveAnnouncement`, e reconstruir o `boardHistory`. **`ExerciseTrainer` NÃO importa `ChessJsRules` de `packages/chess-domain`** — usa o `chess.js` cru.
- **Servidor**: `apps/api/src/exercises/exercises.repository.ts:1` importa `ChessJsRules` de `@xadrez/chess-domain` e usa em `lineIsLegal()` (`:67-76`) para validar que a linha submetida é jogável a partir do FEN do exercício antes de compará-la com a solução gravada.
- **Conclusão sobre duplicação**: é a **mesma biblioteca subjacente** (`chess.js` 1.4.0) nos dois lados, mas **dois pontos de entrada diferentes**: servidor passa por `ChessJsRules` (wrapper tipado de `packages/chess-domain`), cliente usa `chess.js` bruto. Não há divergência de regras conhecida (mesma versão do pacote), mas é tecnicamente uma duplicação de acoplamento — qualquer mudança de comportamento em `chess-domain` não se propaga automaticamente ao cliente, que importa `chess.js` por conta própria.
- **Engine de análise (Stockfish)**: existe (`apps/web/src/lib/engine/browser-engine.ts:11,45-53`, worker WASM `/engine/stockfish-18-lite-single.js`) mas seu único consumidor é `apps/web/src/components/game/game-room.tsx` (confirmado por busca — nenhum outro arquivo fora de `lib/engine/*` chama `evaluatePosition`/`useCoachEngine`), usado no modo "Treinador" de partidas ao vivo. **Nenhum endpoint ou componente do fluxo de exercícios/desafios chama Stockfish, nem no cliente nem no servidor** (`apps/worker/src/engine/stockfish-engine.ts` só é usado por `apps/worker/src/analysis/game-analysis-job.ts`, análise pós-partida). Confirmado também: nenhuma referência a "exercise" dentro de `apps/worker/src` além do contador `exercisesSolvedTotal` do dashboard admin.

---

## 7. Estrutura de dados dos desafios/exercícios

### Tabela `exercises`

Criada em `database/migrations/0001_base.up.sql:272-292`, alterada em `database/migrations/0007_exercises_runtime.up.sql:1-5,55-56`.

| Coluna | Tipo | Origem | Notas |
|---|---|---|---|
| `id` | `uuid` PK | `0001_base.up.sql:273` | |
| `external_id` | `varchar(80)` UNIQUE | `:274` | ex. `"lichess-BAu1A"`, `"challenge-mate-in-one-001"`, `"xadrez-essencial-<n>"`. |
| `source_number` | `integer` UNIQUE | `:275` | Chave de upsert do importador do livro (`ON CONFLICT (source_number)`, `exercise-importer.ts:379`). |
| `module_number`, `chapter_number` | `integer` | `:276-277` | Ligação ao curso/livro. |
| `title` | `varchar(300)` | `:278` | |
| `prompt_md` | `text NOT NULL` | `:279` | Enunciado. |
| `solution_md` | `text NOT NULL` | `:280` | Solução em texto (prosa/notação). |
| `difficulty` | `varchar(20)` | `:281` | `beginner`/`intermediate`/`advanced`/`expert` (usado para ordenar o lote de treino, ver seção 11). |
| `category` | `varchar(60)` | `:282` | |
| `fen` | `text` | `:283` | Nulo para exercícios `text_only`. |
| `side_to_move` | `color_side` (enum `white`/`black`) | `:284` | |
| `solution_lines` | `jsonb DEFAULT '[]'` | `:285` | Array de arrays de lances UCI; cada linha intercala `[jogador, oponente, jogador, ...]` (documentado em `exercise-grader.ts:14-16`). |
| `hints` | `jsonb DEFAULT '[]'` | `:286` | Array de strings; ver seção 9 sobre cobertura real. |
| `tags` | `text[] DEFAULT '{}'` | `:287` | Contém tanto tags de proveniência (`classico`, `lichess`, `challenge`) quanto tags de tema tático (`garfo`, `mate_em_dois`, `peca_pendurada`, ...). |
| `source_pages` | `int4range` | `:288` | Faixa de páginas do livro-fonte. |
| `status` | `publication_status` (enum, inclui `draft`/`published`) | `:289` | Só `published` é exposto pelas queries (`exercises.repository.ts:119`, etc.). |
| `position_type` | `varchar(30)` CHECK `legal_position\|illustrative_diagram\|text_only` | `0007_exercises_runtime.up.sql:2-3` | |
| `import_run_id` | `uuid` FK → `exercise_import_runs` | `:4,18-20` | |
| `import_metadata` | `jsonb DEFAULT '{}'` | `:5` | Guarda `answerFormat` (`free_text`/`move_sequence`), `ratingBand`, `source`, `sourcePuzzleId`, `rating` (Lichess), etc. — **`answer_format` não é uma coluna própria**, é lido via `import_metadata->>'answerFormat'` com fallback `'move_sequence'` (`exercises.repository.ts:139`, `:269`, `:380`). |

### Tabelas relacionadas (todas de `0007_exercises_runtime.up.sql` salvo indicado)

- `exercise_attempts` (`0001_base.up.sql:294-305`, coluna `training_session_id` adicionada em `0007:52-53`): `user_id`, `exercise_id`, `lesson_attempt_id` opcional, `submitted_line jsonb`, `correct boolean`, `score numeric(6,2)`, `hints_used`, `duration_ms`, `attempted_at`.
- `lesson_exercises` (`0007:22-28`): tabela de junção `lesson_id`↔`exercise_id` com `position` (ordem de exibição dentro da aula) — usada por `studyContext()` para achar a aula que "ensina" um exercício.
- `exercise_training_sessions` (`0007:30-39`): `user_id`, `filters jsonb`, `status` (`started`/`completed`/`abandoned`), `current_position`, `started_at`, `completed_at`.
- `exercise_training_items` (`0007:41-50`): linha por exercício dentro de uma sessão — `session_id`, `exercise_id`, `position`, `hints_used`, `solution_revealed`, `completed_at`. PK composta `(session_id, exercise_id)`.
- `exercise_import_runs` (`0007:7-16`): auditoria de cada rodada de importação (livro), com `total_count`/`imported_count`/`rejected_count`/`rejection_report jsonb`.

### Migrations que moldaram o pool de "challenges"

- `database/migrations/0011_playable_challenges.up.sql:1-92` — insere **8 exercícios curados manualmente**, todos com `tags` contendo `'challenge'` (ex. `:12` `ARRAY['challenge', 'mate_em_um', 'mate', 'corredor']`), todos com 1-2 dicas de texto reais.
- `database/migrations/0022_lichess_tactics.up.sql` (8007 linhas de `INSERT`) — importa **8003 táticas do Lichess** (banco aberto `database.lichess.org`, CC0; processo de seleção/verificação descrito em `TAREFAS.md:95`), cada linha com `tags` incluindo `'classico'` e `'lichess'` mais tema(s) tático(s) catalogado(s) (ex. `peca_pendurada`, `mate_em_um`), e `import_metadata` com `rating`, `ratingBand`, `source: "lichess"`, `sourcePuzzleId`. **8003 das 8007 linhas têm `hints: '[]'::jsonb`** (confirmado por contagem: `grep -c "'\[\]'::jsonb, ARRAY" 0022_lichess_tactics.up.sql` → `8003`), i.e. **quase nenhuma tem dica cadastrada**.
- `database/migrations/0023_fix_lichess_backrank_tag.up.sql:1-8` — renomeia a tag `mate_corredor` para `mate_fileira_final` via `UPDATE`, para não colidir com a tag `corredor` já usada por `0011`. Comentário no arquivo (`:1-5`) explicita que a correção foi feita via `UPDATE` em vez de editar `0022` porque `0022` **já tinha sido aplicada em produção**.
- `database/migrations/0033_lichess_into_challenges.up.sql:1-8` — `UPDATE exercises SET tags = array_append(tags, 'challenge') WHERE 'lichess' = ANY(tags) AND NOT ('challenge' = ANY(tags))`. Comentário (`:1-4`) explicita a intenção: mover todas as táticas Lichess para o pool "Desafios" (que já excluía por padrão tudo com tag `challenge` de `/app/exercicios`), tornando-as navegáveis por tema em `/app/desafios`.

### Contrato TypeScript (`packages/contracts/src/exercise.ts`)

- `exerciseSummarySchema` (`:29-45`) — forma exposta ao cliente para listagem/exercício ativo; **não inclui `solution_lines`, `solution_md` nem `hints`** (só `hintsAvailable: number`, contagem), reforçando que solução/dicas só saem por endpoints dedicados que as registram como "reveladas".
- `exerciseSearchQuerySchema` (`:10-22`) — filtros aceitos por `GET /exercises`: `category`, `chapter`, `difficulty`, `lessonId`, `limit` (1-100, padrão 20), `module`, `offset`, `positionType`, `q`, `source` (`classic`/`lichess`/`book`), `theme`.
- `exerciseTrainingFiltersSchema` (`:54-56`) — mesmos filtros, `limit` 1-50 padrão 10 (usado para montar o lote de uma sessão).
- `submitExerciseAttemptInputSchema` (`:71-84`) — nota inline (`:74-78`) documentando por que `selfAssessedCorrect` é opcional-porém-obrigatório-condicionalmente para exercícios `free_text`.
- `evaluateExerciseLineInputSchema`/`evaluateExerciseLineResultSchema` (`:107-117`) — usado pelo endpoint de avaliação lance-a-lance.

---

## 8. Onde a classificação por tema acontece, exatamente

**Backend** — filtro de tema é sempre `${filter.theme}::text IS NULL OR ${filter.theme} = ANY(e.tags)` (comparação direta contra o array `tags`, sem tabela de temas separada). Aparece idêntico em três queries:
- `search()` — contagem: `exercises.repository.ts:132`; listagem: `:157`.
- `startTraining()` (monta o lote da sessão): `:227`.
- (implicitamente também filtra em `listChallengeThemes()`, que faz o inverso — agrupa por tag: ver abaixo.)

**Listagem de temas disponíveis** — `listChallengeThemes()` (`exercises.repository.ts:175-190`):
```sql
SELECT tag, count(*)::integer AS count
  FROM exercises e, unnest(e.tags) AS tag
 WHERE e.status = 'published' AND 'challenge' = ANY(e.tags)
   AND tag NOT IN ('challenge', 'lichess', 'classico')
   AND NOT EXISTS (SELECT 1 FROM exercise_attempts a
                     WHERE a.exercise_id = e.id AND a.user_id = ${userId} AND a.correct = true)
 GROUP BY tag ORDER BY count DESC, tag
```
Isto é: **"tema" é qualquer valor de `tags` que não seja uma das 3 tags estruturais de proveniência** (`challenge`, `lichess`, `classico`) — não há uma tabela `themes` nem enum fechado de temas. O comentário em `:172-174` confirma essa decisão de design.

**Frontend** — `<select>` de tema tático: `apps/web/src/components/exercises/exercise-trainer.tsx:651-663`, renderizado só quando `showThemeFilter=true` (só `/app/desafios`). É populado (`:274-290`) por `api.listChallengeThemes(accessToken)` num `useEffect` disparado quando `guided && showThemeFilter`. Ao selecionar, `selectTheme(next)` (`:297-300`) atualiza o estado `theme` e chama `resumeOrStart({ source, theme: next })`, que tenta retomar sessão salva daquele tema (`sessionStorageKey`, `:59-61`) ou inicia uma nova via `POST /exercise-training-sessions` com `theme` nos filtros. O rótulo exibido é formatado mecanicamente a partir do tag snake_case (`formatThemeLabel`, `:65-70`, ex. `peca_pendurada` → `"Peca Pendurada"`).

**Quirk notável**: `ChallengeHub` passa `initialQuery="challenge"` (não `theme`) para pré-selecionar o pool de desafios (`challenge-hub.tsx:12`). Esse valor cai no campo de busca textual `q`, que faz `ILIKE '%challenge%'` contra `concat_ws(' ', title, prompt_md, category, tags concatenadas)` (`exercises.repository.ts:125`) — e **também** desativa a exclusão padrão de itens `challenge` porque essa exclusão só se aplica quando `q IS NULL` (`:131`, `:156`, `:226`). Ou seja, a tag "challenge" é reaproveitada tanto como filtro de exclusão padrão em `/app/exercicios` quanto (via busca textual coincidente) como "opt-in" implícito em `/app/desafios` — não existe um parâmetro de query dedicado tipo `tag=challenge` estruturado; é uma dupla-função do campo de busca livre `q`.

---

## 9. Sistema de dicas

- **Fonte**: coluna `exercises.hints` (`jsonb`, array de strings), preenchida no momento da importação/criação do exercício (livro: `exercise-importer.ts:234` mapeia aliases `hints`/`dicas`/`hint`/`dica`; challenges curados: hardcoded no `INSERT` de `0011_playable_challenges.up.sql`, ex. `:11` duas dicas de texto). **Não há geração dinâmica de dica** (nenhuma chamada a LLM/IA no fluxo de dica — confirmado, nenhuma referência a IA/LLM em `exercises.repository.ts`).
- **Progressão**: é sequencial e cumulativa, uma dica de texto por vez, sem níveis de "força" da dica (não existe dica "fraca"→"forte" nem dica que aponta casa/peça estruturadamente — é só a próxima string do array). Implementado em `hint()` (`exercises.repository.ts:340-361`):
  ```sql
  UPDATE exercise_training_items i SET hints_used = i.hints_used + 1
    ... WHERE ... AND i.hints_used < jsonb_array_length(e.hints)
    RETURNING e.hints, i.hints_used
  ```
  Retorna `hint: row.hints[row.hints_used - 1]`, `hintNumber`, `remaining` (`:356-360`). Cada chamada consome uma dica a mais; não há como "voltar" uma dica já revelada.
- **Gating por plano**: antes de revelar, checa `subscriptions.checkEntitlement(userId, 'hints_per_day')` (`:341-345`) — limite diário configurável por plano (ver seção 13).
- **Caso "sem dica disponível" — confirmado**: se `hints_used >= jsonb_array_length(hints)` (inclui o caso `hints = '[]'`), a query não retorna linha e o endpoint lança `NotFoundException('Nenhuma dica disponível para o exercício atual')` (`:355`). Isso é o caso **normal** para a esmagadora maioria do pool: **8003 das 8007 táticas do Lichess (migration `0022`) têm `hints: '[]'::jsonb`** — só os 8 desafios curados de `0011` (mais alguns exercícios do livro que tiveram dica cadastrada manualmente) têm dica real. O histórico do projeto confirma isso como bug já corrigido no frontend: `TAREFAS.md:253` relata que o botão "Pedir dica" aparecia para todo exercício mesmo sem dica cadastrada, e a correção foi expor `hintsAvailable` (`jsonb_array_length(e.hints)`, `exercises.repository.ts:140,270`) no resumo do exercício e só renderizar o botão quando `> 0` (`exercise-trainer.tsx:926-930`).
- **Frontend**: `revealHint()` (`exercise-trainer.tsx:309-319`) chama `POST /exercise-training-sessions/:sessionId/hints`; exibida em `<aside>` (`:854-858`).

---

## 10. Validação de jogada / avaliação

Há **dois endpoints distintos**, para dois momentos diferentes do fluxo:

1. **`POST /exercises/:exerciseId/evaluate-line`** (`exercises.controller.ts:67-78` → `exercises.repository.ts#evaluateLine`, `:463-511`) — chamado **a cada lance individual** feito no tabuleiro (`exercise-trainer.tsx#playBoardMove`, `:482-490`, e `#evaluatePlayedLine`, `:496-563`), só quando `isPlayablePosition` (posição `legal_position` + formato `move_sequence`, `:370-373`). Não recebe UCI de resposta do oponente do cliente — o servidor deduz a resposta do oponente a partir de `solution_lines` gravado (comentário em `evaluateExerciseLineInputSchema`, `packages/contracts/src/exercise.ts` e em `exercise-grader.ts:14-16`). Delega a comparação para a função pura `gradePlayedMoves()` (`apps/api/src/exercises/exercise-grader.ts:18-49`):
   - Filtra `solution_lines` candidatas cujos lances do jogador (índices pares) batem com o que foi jogado até agora.
   - Se nenhuma linha bate → `status: 'incorrect'`.
   - Se bate e a linha termina exatamente aí → `status: 'solved'`.
   - Senão → `status: 'continue'`, retornando `opponentReply` (o próximo lance do oponente na linha candidata, para o cliente animar).
   - Quando `status === 'solved'`, `evaluateLine()` **internamente chama `attempt()`** (`exercises.repository.ts:499-503`) para persistir a tentativa e avançar a sessão — ou seja, `evaluate-line` é uma camada de conveniência sobre `attempt()`, não um caminho de gravação paralelo.
2. **`POST /exercises/:exerciseId/attempts`** (`exercises.controller.ts:54-65` → `exercises.repository.ts#attempt`, `:376-461`) — grava a tentativa completa (linha inteira ou autoavaliação). Usado diretamente pelo formulário de texto (campo "Linha em UCI"/"Sua resposta", `exercise-trainer.tsx#submit`, `:332-367`) e indiretamente por `evaluate-line` quando a linha é resolvida via tabuleiro. Regras:
   - Para `answerFormat === 'move_sequence'`: `answerIsCorrect()` (`exercises.repository.ts:81-91`) primeiro checa legalidade da linha via `ChessJsRules` (`lineIsLegal`, `:67-76`), depois compara normalizada (trim + lowercase) contra cada `solution_lines[i]` por igualdade exata de comprimento e sequência.
   - Para `answerFormat === 'free_text'`: **não há comparação automática** — exige `selfAssessedCorrect` explícito do cliente (comentário `:78-80`, `:390-398`); é o próprio aluno quem diz se acertou, depois de revelar a resposta do livro.
   - Pontuação: `score = correct ? max(0, 100 - hintsUsed * 10) : 0` (`:427`) — cada dica usada custa 10 pontos.
   - Gating por plano: `checkEntitlement(userId, 'exercises_per_day')` (`:385-389`) antes de aceitar a tentativa.
   - Se `correct` e vinculado a uma `trainingSessionId`: marca o item da sessão como concluído e avança `current_position` (`:438-452`), com a sessão virando `completed` quando `current_position >= total`.
- **Não há engine de xadrez em tempo real (Stockfish) envolvida em nenhum dos dois** — comparação é sempre contra `solution_lines` gravado estaticamente (ver seção 6).

---

## 11. Sessão de treino / "próximo desafio"

- **Criação do lote** — `startTraining()` (`exercises.repository.ts:192-246`), disparado por `POST /exercise-training-sessions`:
  - Cria linha em `exercise_training_sessions`.
  - Seleciona exercícios via subquery com `ORDER BY difficulty_rank, source_number NULLS LAST, id LIMIT ${filters.limit}` (`:203-236`), onde `difficulty_rank` é um `CASE` que mapeia `beginner→1, intermediate→2, advanced→3, expert→4, (outro/nulo)→5` (`:206-212`) — **critério de seleção é: mais fácil primeiro, depois ordem de importação/id, respeitando os filtros ativos (categoria/capítulo/dificuldade/módulo/tipo de posição/busca textual/fonte/tema/aula)**.
  - **Exclusão de já resolvidos**: `AND NOT EXISTS (SELECT 1 FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = ${userId} AND a.correct = true)` (`:228-231`) — um exercício correto uma vez **nunca mais** volta a aparecer em nenhum lote futuro do mesmo usuário (não há "espaçamento" nem "revisão futura" tipo SRS — é exclusão permanente).
  - `limit` do lote: vem de `ExerciseTrainingFilters.limit`, padrão **10** (`packages/contracts/src/exercise.ts:56` — `.default(10)`; o frontend fixa `limit: 10` explicitamente em `exercise-trainer.tsx:201`).
  - Se a seleção não retornar nenhuma linha, a sessão é imediatamente marcada `completed` (`:238-242`).
- **Avanço para o próximo exercício dentro do lote**: implícito — ao acertar (`attempt()`), `current_position` incrementa (`:444-450`); o próximo `GET .../training` (ou o `training` retornado embutido na resposta de `attempt`, `:456-460`) simplesmente busca o item cuja `position = current_position` (`training()`, `:267-275`). Não há um endpoint dedicado "próximo"; é reativo ao resultado da tentativa.
- **Conclusão do lote inteiro**: quando `current_position >= total` de itens da sessão, `status` vira `completed` (`:446-449`). No frontend, isso é distinguido em dois estados de UI (`exercise-trainer.tsx:939-958`):
  - `total === 0` (nunca teve nenhum item, ex. filtro sem resultados ou tudo já resolvido) → mensagem **"Você já resolveu tudo por aqui!"**, **sem botão de continuar** (`:939-946`; corrigido conforme `TAREFAS.md:252`, para não sugerir uma ação que resultaria em outro vazio).
  - `total > 0` e completado → **"Treino concluído"** + `"${completed} exercícios registrados"` + botão **"Próximo desafio →"** que chama `startTraining()` de novo, gerando um **novo lote** com os mesmos filtros (excluindo automaticamente tudo já correto, incluindo o que acabou de ser resolvido) (`:947-958`; adicionado conforme `TAREFAS.md:250`).
- **Retomada**: ao montar o componente (ou trocar fonte/tema), `resumeOrStart()` (`:237-265`) primeiro tenta `GET /exercise-training-sessions/:sessionId` com o `sessionId` salvo em `localStorage` para aquela combinação (fonte × tema); se falhar (sessão não existe mais/erro), remove a chave e inicia uma nova via `startTraining()`.

---

## 12. Persistência de progresso

- **`exercise_attempts`** (`0001_base.up.sql:294-305`) — uma linha por tentativa submetida: `correct`, `score`, `hints_used`, `duration_ms`, `submitted_line`, `attempted_at`, com FK opcional para `lesson_attempt_id` (quando o exercício foi respondido dentro do fluxo de uma aula) e `training_session_id` (quando dentro de uma sessão de treino).
- **`exercise_training_items`** (`0007:41-50`) — por sessão: `hints_used`, `solution_revealed`, `completed_at` por item — é o estado "efêmero" da sessão em progresso, distinto de `exercise_attempts` que é o **histórico permanente**.
- **Mastery/domínio por tema**: **não existe** nenhum conceito de mastery, nível de proficiência por tema/habilidade, ou taxa de acerto por tag. A única "memória" por tema é indireta: `listChallengeThemes()` conta, por tag, quantos exercícios **ainda não foram resolvidos corretamente** (`exercises.repository.ts:175-190`) — é uma contagem de pool restante, não uma métrica de competência.
- **Pontuação/rating do usuário**: **não existe rating de exercícios**. O campo `score` em `exercise_attempts` é por-tentativa (0-100, baseado em dicas usadas), não acumulado num rating de usuário. O sistema de `rating_profiles`/`rating_transactions` que existe no schema (`0001_base.up.sql:59-76,166-183`) é exclusivo do módulo de **partidas** (`apps/api/src/ratings/`), confirmado por busca vazia de "exercise" nesse módulo — **nenhum acoplamento entre exercícios e rating de xadrez do usuário**.
- **Métricas agregadas expostas ao usuário**: `GET /exercise-metrics` (`exercises.repository.ts#metrics`, `:513-538`) — `attempted`, `correct`, `accuracyPercent`, `averageDurationMs`, `hintsUsed` — soma simples sobre toda a tabela `exercise_attempts` do usuário, sem quebra por tema/dificuldade/data.
- **Dashboard admin**: `apps/api/src/admin/admin.repository.ts:268-270` conta `exercise_attempts WHERE correct = true` como `exercisesSolvedTotal` (métrica agregada global, não por usuário).

---

## 13. Autenticação

- Todas as rotas do `ExercisesController` estão sob `@UseGuards(AccessTokenGuard)` no nível da classe (`exercises.controller.ts:16`) — nenhum endpoint de exercício/desafio é público.
- `AccessTokenGuard` (`apps/api/src/auth/access-token.guard.ts:8-22`) extrai o header `Authorization: Bearer <token>`, chama `AuthService.verifyAccessToken()`, e popula `request.auth: AuthenticatedUser` (`:19`) — os handlers do controller leem `request.auth.userId` (ex. `exercises.controller.ts:27,34,41,46,51,61,75`).
- No frontend, o token é lido de `window.localStorage.getItem('xadrez.access_token')` a cada chamada (`exercise-trainer.tsx:134-136`) — não há refresh automático nem contexto de sessão React dedicado a esse componente; se o token estiver ausente, o modo não-guiado mostra "Entre na sua conta..." (`:169`) e o modo guiado simplesmente não dispara as chamadas (`:190`, `:241-243`, `:311`, `:323`).
- **Gating adicional por plano de assinatura** (não é autenticação, é autorização/limite de uso): `SubscriptionsService.checkEntitlement()` (`apps/api/src/subscriptions/subscriptions.service.ts:101-107`) é chamado dentro de `hint()` (feature `hints_per_day`) e `attempt()` (feature `exercises_per_day`) do repositório de exercícios — usuário sem plano ativo cai no plano padrão marcado `isDefault`; se esse plano não tiver a feature configurada, a ação é bloqueada (comentário explicativo em `:91-97`).

---

## 14. Fluxo de dados ponta a ponta (`/app/desafios`, caso guiado)

1. Usuário abre `/app/desafios` → `apps/web/src/app/app/desafios/page.tsx:3-5` renderiza `<ChallengeHub />`.
2. `ChallengeHub` (`challenge-hub.tsx:6-20`) renderiza `<ExerciseTrainer guided initialQuery="challenge" positionType="legal_position" showThemeFilter storageKey="xadrez.desafios_session" .../>`.
3. No mount, `ExerciseTrainer` dispara (`exercise-trainer.tsx:267-272`) `resumeOrStart({ source: 'all', theme: '' })`.
4. `resumeOrStart()` (`:237-265`) checa `localStorage` por sessão salva sob a chave `xadrez.desafios_session:all:all`; se não achar (primeira visita), chama `startTraining()`.
5. `startTraining()` (`:187-235`) monta os filtros via `filters()` (`:138-153`) — inclui `q=challenge` (do `initialQuery`) — e chama `api.startExerciseTraining({ filters: { limit: 10, q: 'challenge', ... } }, token)` → `POST /exercise-training-sessions` (`apps/web/src/lib/api/client.ts:366-370`).
6. Backend `startTraining()` (`exercises.repository.ts:192-246`) monta o lote (query com `q ILIKE '%challenge%'`, ordenado por dificuldade, excluindo já-resolvidos), cria `exercise_training_sessions` + `exercise_training_items`, retorna via `training()` (`:248-284`) o primeiro exercício da sessão.
7. Frontend recebe `ExerciseTrainingView`, seta `training` (`:218`), salva `sessionId` em `localStorage` (`:220-223`).
8. Paralelamente, se `showThemeFilter`, um `useEffect` separado (`:274-290`) chama `api.listChallengeThemes(token)` → `GET /exercises/challenge-themes` para popular o `<select>` de tema (`:651-663`).
9. Usuário opcionalmente seleciona um tema → `selectTheme()` (`:297-300`) → `resumeOrStart({ source: 'all', theme: 'garfo' })` → repete passos 4-7 sob nova chave de sessão `xadrez.desafios_session:all:garfo`.
10. `ExerciseTrainer` monta a posição: `boardFen` (`:436-439`) vem de `current.fen` (do exercício ativo) ou do `boardHistory` local se já houver lances feitos.
11. `<ChessBoard fen={boardFen} onMove={playBoardMove} .../>` (`:796-808`) renderiza; usuário arrasta/clica uma peça → `chess-board.tsx#attempt()` (`:239-252`) valida legalidade local via `chess.js` e chama `onMove(uci)`.
12. `playBoardMove(uci)` (`exercise-trainer.tsx:441-494`) aplica o lance localmente (`new Chess(boardFen)`), atualiza `boardHistory`/`playerMoves`, dispara `MoveAnnouncement` se relevante, e — como é `isPlayablePosition` — chama `evaluatePlayedLine()`.
13. `evaluatePlayedLine()` (`:496-563`) chama `api.evaluateExerciseLine(exerciseId, { playedMoves, trainingSessionId }, token)` → `POST /exercises/:exerciseId/evaluate-line`.
14. Backend `evaluateLine()` (`exercises.repository.ts:463-511`) confirma que o exercício é o atual da sessão, chama `gradePlayedMoves()` (`exercise-grader.ts:18-49`), e:
    - Se `'continue'`: retorna `opponentReply`; frontend anima a resposta do "oponente" após 450ms (`:531-553`) e libera o tabuleiro de novo.
    - Se `'incorrect'`: frontend toca som de derrota e mostra modal "Não foi dessa vez" (`:518-522`).
    - Se `'solved'`: backend internamente chama `attempt()` (grava `exercise_attempts`, avança `current_position`/`completed_at` da sessão), retorna o `training` atualizado; frontend toca som de vitória, mostra modal "Você venceu!" (`:511-516`).
15. Usuário clica "Próximo exercício →" no modal → `closeResultModalAndAdvance()` (`:574-582`) apenas limpa a UI local — **o próximo exercício já veio embutido** na resposta anterior (`training` atualizado no passo 14), então não há nova chamada de busca aqui.
16. Ao esgotar o lote (`training.status === 'completed'`), a seção muda para o estado de conclusão (`:947-958`); clicar "Próximo desafio →" repete o passo 5 (`startTraining()` de novo, com os mesmos filtros, agora excluindo o que acabou de ser resolvido).
17. Métricas agregadas (`exercise-metrics`) só são buscadas no modo **não-guiado** (`:363` — `if (!guided) setMetrics(...)`) — ou seja, `/app/desafios` e `/app/exercicios`, sendo ambos `guided=true`, **não exibem o painel de métricas** (`:609-628`, condicionado a `!guided`).

---

## 15. Dependências e pontos de acoplamento

- **`ChessBoard`** (`apps/web/src/components/game/chess-board.tsx`) é compartilhado por pelo menos 4 consumidores fora de exercícios: `apps/web/src/components/history/review-room.tsx` (revisão de partida), `apps/web/src/components/lessons/lesson-player.tsx:12,204` (passos `board_instruction`/`quiz` das aulas), `apps/web/src/lib/piece-theme.tsx` (referência ao tipo `PieceTheme`), além do próprio `game-room.tsx` (partida ao vivo). **Qualquer mudança de contrato de props (`fen`, `onMove`, `orientation`, `movableColor`, `pieceTheme`) afeta todas essas telas.**
- **`packages/chess-domain`** (`ChessJsRules`) é usado por: `exercise-importer.ts` (validação de FEN na importação), `exercises.repository.ts` (legalidade da linha submetida), `courses/lesson-importer.ts`, `games/application/games.service.ts`, `games/infrastructure/games.repository.ts`, `lesson-runtime/lesson-runtime.repository.ts`, `matchmaking/infrastructure/matchmaking.repository.ts` — é o núcleo de regras de xadrez de **toda a plataforma**, não só de exercícios.
- **`lesson_exercises`** liga a tabela `exercises` ao sistema de aulas (`lessons`, `lesson_steps`) — usado por `studyContext()` (`exercises.repository.ts:286-338`) para mostrar texto de estudo antes de exercícios `free_text`, e por `exercise-importer.ts#associateExerciseWithLessons()` (`:304-330`) para vincular automaticamente exercícios importados a aulas por módulo/capítulo/página. O sistema de quiz **dentro** de aulas (`lesson_steps.step_type IN ('quiz','board_instruction')`) é uma máquina **separada e paralela** (endpoint `submitLessonAction`, não `submitExerciseAttempt`) — não deve ser confundido com o domínio de exercícios em si, mesmo compartilhando o componente `ChessBoard`.
- **`exercise_attempts.lesson_attempt_id`** permite que um exercício seja respondido "dentro" de uma tentativa de aula (`exercises.repository.ts:404-412` valida que o exercício pertence à aula da tentativa via `lesson_exercises`), então o histórico de progresso de aulas e de exercícios podem se cruzar numa mesma linha.
- **Assinaturas/planos** (`SubscriptionsService`) gateiam `hints_per_day` e `exercises_per_day` — qualquer redesenho do fluxo de treino precisa continuar chamando `checkEntitlement()` nos mesmos pontos (ou equivalentes) para não vazar limites de plano pago.
- **Dashboard admin** (`admin.repository.ts:268-270`) lê `exercise_attempts` diretamente para a métrica `exercisesSolvedTotal` — mudança de schema nessa tabela quebra o admin.
- **`scripts/generate-tactics.mjs`** e **`scripts/validate-exercise-content.mjs`** (mencionado em `TAREFAS.md:232`) dependem do formato de `NormalizedExercise` (`exercise-importer.ts:7-27`) e travam um hash SHA-256 esperado do conteúdo canônico do livro — mudanças na forma de persistir exercícios do livro podem quebrar esse gate de CI.
- **Não há acoplamento** com: motor Stockfish/análise (seção 6), sistema de narração por IA (`apps/worker/src/narration/*` — busca confirma zero referência a "exercise"), rating de xadrez do usuário (seção 12), `apps/worker` em geral (só o contador do admin depende indiretamente via SQL direto).

---

## 16. Problemas encontrados (observados diretamente no código, não inferidos)

1. **Domínio de exercícios inteiramente fora do ORM tipado** — `exercises.repository.ts` usa só SQL cru via `postgres.js`; o Drizzle `schema.ts` (`apps/api/src/database/schema.ts`) não modela nenhuma das 5 tabelas do domínio. Qualquer refactor perde o auto-complete/checagem de tipos que o resto do backend tem.
2. **Duplicação de acesso ao motor de regras no cliente**: `chess-board.tsx` e `exercise-trainer.tsx` importam `chess.js` diretamente; o servidor usa o wrapper `ChessJsRules` de `packages/chess-domain`. Não há garantia estrutural de que ambos os lados permaneçam sincronizados além de fixarem a mesma versão de `chess.js` no `package.json`.
3. **Overload semântico do campo de busca textual `q`** — é reaproveitado por `ChallengeHub` (`initialQuery="challenge"`) tanto para contornar a exclusão padrão de itens `challenge` quanto para efetivamente filtrar por eles via `ILIKE` contra a concatenação de tags (`exercises.repository.ts:125,131`). Um exercício cujo `title`/`prompt_md`/`category` contenha a palavra "challenge" em português (improvável, mas não impossível) entraria incorretamente no pool.
4. **`answer_format` não é coluna própria** — está enterrado em `import_metadata->>'answerFormat'`, com fallback textual `'move_sequence'` repetido em 3 queries diferentes (`exercises.repository.ts:139,269,380`) em vez de centralizado.
5. **Cobertura de dicas extremamente desigual** — 8003/8007 (99,95%) dos itens do maior lote de conteúdo (Lichess) não têm dica alguma; a UI já foi corrigida para não prometer dica quando não há (seção 9), mas a lacuna de conteúdo em si permanece.
6. **`ChallengeHub` não é um componente com identidade própria** — é uma casca de 15 linhas sobre `ExerciseTrainer`; qualquer funcionalidade específica de "desafios" (ex. níveis, badges, progressão visual) hoje teria que ser implementada dentro do componente genérico via mais props condicionais, não em um componente dedicado.
7. **Nenhum SRS (repetição espaçada) ou reoferecimento** — um exercício correto uma vez nunca mais aparece (`NOT EXISTS ... correct = true`, `exercises.repository.ts:228-231`); não há como o sistema decidir "revisar de novo em N dias" mesmo que quisesse.
8. **`solution_lines` como única fonte de verdade para variações táticas** — para posições com múltiplas continuações vencedoras não catalogadas manualmente (típico de puzzles gerados/importados em massa que só capturam a linha "canônica" do Lichess), um lance alternativo igualmente correto seria classificado `incorrect` porque `gradePlayedMoves()` só compara contra as linhas literalmente gravadas (`exercise-grader.ts:21-25`), sem qualquer verificação de legalidade/qualidade via engine.
9. **Estado de sessão por `localStorage` pode dessincronizar entre abas/dispositivos** — como não há canal realtime nem invalidação de cache entre abas, duas abas do mesmo usuário podem divergir sobre qual é o "exercício atual" até uma delas recarregar.

---

## 17. Funcionalidades que devem ser preservadas

- **Motor de regras de xadrez** (`chess.js` via `packages/chess-domain`) e o formato **UCI** para lances em toda a superfície de API (`solution_lines`, `submittedLine`, `playedMoves`, `onMove`) — trocar de biblioteca ou de notação quebra toda a persistência histórica (`exercise_attempts.submitted_line`, `exercises.solution_lines`).
- **FEN como formato de posição** em `exercises.fen`, prop `ChessBoard.fen`, e em toda a cadeia de importação/geração.
- **Histórico de lances/tentativas** — `exercise_attempts` é o registro permanente de progresso do usuário; qualquer nova arquitetura de "jornada" precisa continuar gravando (ou migrar preservando) essas linhas, já usadas por métricas (`GET /exercise-metrics`) e pelo admin (`exercisesSolvedTotal`).
- **Sistema de autenticação** (`AccessTokenGuard`/`AuthService`) — todos os novos endpoints do fluxo de exercícios devem continuar sob o mesmo guard.
- **O pool de ~8000 táticas do Lichess** (migration `0022`, licença CC0) com seus **temas catalogados nas tags** (`garfo`, `mate_em_dois`, `peca_pendurada`, `sacrificio`, `cravada`, `espeto`, `ataque_descoberto`, `xeque_duplo`, `zugzwang`, `raio_x`, `atracao`, `desvio`, etc. — ~40 temas distintos por `TAREFAS.md:281`) e seus `ratingBand`/`rating` em `import_metadata` — é o maior ativo de conteúdo do sistema e não pode ser perdido/renumerado sem plano de migração explícito (são `external_id` únicos do tipo `lichess-<puzzleId>`, preservando rastreabilidade à fonte).
- **Os 8 desafios curados manualmente** (`0011_playable_challenges`) com suas dicas reais escritas à mão.
- **Vínculo `lesson_exercises`** entre exercícios do livro e as aulas que os "ensinam" (usado pelo painel de estudo, `studyContext()`).
- **Gating por plano de assinatura** (`hints_per_day`, `exercises_per_day`) — não pode ser contornado por uma nova arquitetura de sessão/treino.
- **Comportamento de autoavaliação para exercícios `free_text`** (~1298 exercícios do livro, por `TAREFAS.md:131`) — é a única forma viável de avaliar essas ~1298 perguntas de prosa livre; qualquer nova UI de "exercício" precisa manter esse caminho para não reintroduzir o bug histórico documentado em `TAREFAS.md:130-131`.
- **Endpoint `evaluate-line` incremental** (avaliação lance-a-lance com resposta automática do "oponente" deduzida do servidor) — é o mecanismo que torna os desafios jogáveis diretamente no tabuleiro em vez de exigir digitar a linha inteira; removê-lo regride a UX para o modo "digite a linha em UCI".

---

## 18. Estratégia de migração — primeira impressão (não é o entregável principal)

**Provavelmente mais fácil de estender sem quebrar:**
- Adicionar uma tabela nova (ex. "níveis", "trilhas", "mastery por tema") ao lado das existentes, alimentada por `exercise_attempts`/`tags` sem alterar seu formato — o histórico de tentativas já tem tudo que uma camada de progressão/mastery precisaria consumir (usuário, exercício, correto, tempo, dicas usadas, timestamp) sem exigir mudança retroativa.
- O `<select>` de tema (`exercise-trainer.tsx:651-663`) e `listChallengeThemes()` (`exercises.repository.ts:175-190`) são pontos de extensão relativamente isolados — trocar por uma navegação de "níveis por tema" pode reaproveitar a mesma agregação de tags sem tocar no motor de correção.
- O componente `ChessBoard` já expõe `lastMove`/highlight de casas via classes CSS; adicionar uma camada de overlay para setas é aditivo (não exige reescrever a lógica de clique/drag existente), mas exige trabalho novo do zero (não há nada reaproveitável hoje, seção 5).

**Provavelmente mais arriscado/acoplado:**
- **`ExerciseTrainer`** é um componente monolítico de 1025 linhas que serve simultaneamente `/app/exercicios` (catálogo livre) e `/app/desafios` (pool guiado por tema) via um leque grande de props condicionais (`guided`, `showSourceFilter`, `showThemeFilter`, `positionType`, `initialQuery`...). Uma "jornada por níveis" provavelmente quer um fluxo de UI genuinamente diferente (progressão linear, bloqueio de nível, XP/streak) — tentar encaixar isso como mais uma prop condicional nesse componente tende a piorar a already-alta complexidade condicional; extrair um componente de execução de exercício mais enxuto (tabuleiro + validação + dica, sem toda a lógica de filtros/histórico/fonte) parece o ponto de alavancagem mais valioso.
- **Ausência de mastery/rating por tema** significa que "nível" na nova arquitetura precisa ser inteiramente novo — não há dado histórico de proficiência por tema para inicializar usuários existentes além de contar acertos passados por tag (cruzando `exercise_attempts` × `exercises.tags`, viável mas não trivial, e não normalizado hoje).
- O **domínio fora do Drizzle** (SQL cru em `exercises.repository.ts`) significa que uma reestruturação de schema (novas tabelas de nível/trilha) não tem o mesmo suporte de migração tipada que o resto do backend — precisa seguir o padrão manual de migrations `.up.sql`/`.down.sql` já em uso (`database/migrations/`), respeitando a regra do projeto de nunca editar uma migration já aplicada em produção (histórico em `database/migrations/0023...` e na memória do projeto).
- O **overload do campo `q`** em `ChallengeHub` (seção 16, item 3) é uma dívida técnica pequena mas que uma nova arquitetura de navegação por nível/trilha provavelmente quer substituir por um parâmetro estruturado dedicado, já que a intenção de "filtrar por challenge" nunca foi realmente "buscar pela palavra challenge".

---

## Metodologia

Toda a informação acima vem de leitura direta dos arquivos citados nesta mesma sessão de auditoria (nenhuma edição foi feita). Trechos de `TAREFAS.md` citados como contexto histórico foram tratados como registro confiável de decisões passadas do próprio projeto (documento é a fonte de verdade do backlog, por convenção já estabelecida do repositório), não como fonte primária de comportamento de código — todo comportamento afirmado como fato tem citação de código correspondente.
