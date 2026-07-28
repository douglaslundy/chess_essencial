# Jornada de Aprendizagem — Proposta de Design (FASE 23)

> Responde aos 11 entregáveis pedidos na FASE 23 do spec original
> (`docs/superpowers/specs/2026-07-27-jornada-de-aprendizagem-spec.md`).
> Este é um documento de **design para aprovação**, não um plano de
> implementação linha-a-linha — o plano bite-sized (tarefas TDD,
> commits, testes) vem depois de aprovado, via `superpowers:writing-plans`.
>
> Base factual: `CURRENT_CHALLENGE_ARCHITECTURE.md` (auditoria FASE 1,
> commit `616098d`). Toda decisão abaixo cita de volta os achados
> relevantes desse documento em vez de repetir a investigação.

---

## 1. Auditoria da arquitetura atual

Já entregue: `CURRENT_CHALLENGE_ARCHITECTURE.md`. Não repetido aqui.

---

## 2. Inventário dos desafios

O inventário exato (contagem por origem/dificuldade/tema) precisa de uma
query real contra produção antes da implementação (Tarefa 1 do plano de
execução, seção 11) — não vou inventar números que a auditoria não mediu
diretamente. O que a auditoria já confirma sobre a composição do pool:

| Origem                                                   | Tamanho aproximado                                                | Dificuldade                                         | Dicas                                                 | Formato de resposta                           |
| -------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- |
| Lichess (`0022`)                                         | ~8000 (8003/8007 confirmado)                                      | `rating`/`ratingBand` numérico em `import_metadata` | **quase nenhuma** (8003/8007 sem dica)                | `move_sequence`, tabuleiro jogável            |
| Desafios curados (`0011`)                                | 8                                                                 | enum `difficulty`                                   | Sim, escritas à mão                                   | `move_sequence`, tabuleiro jogável            |
| Livro (`exercise-importer.ts`)                           | ~1298 `free_text` (por `TAREFAS.md:131`) + outros `move_sequence` | enum `difficulty`                                   | Parcial (mapeada na importação quando o livro trazia) | `free_text` (autoavaliação) e `move_sequence` |
| Táticas de mate geradas (`scripts/generate-tactics.mjs`) | desconhecido sem query                                            | calculado pelo `mate-solver.ts`                     | Não                                                   | `move_sequence`                               |

**Implicação de design**: a trilha por níveis (progressão sequencial,
tabuleiro jogável, dica progressiva) só faz sentido pedagogicamente para
itens `move_sequence` com `position_type = legal_position`. Os `free_text`
do livro (autoavaliação, sem tabuleiro jogável) **não entram no pool de
Etapas do tipo CHALLENGE** — continuam servindo ao fluxo de aulas
(`lesson_exercises`) e ao Treino Livre (seção 9), não à trilha nova.

---

## 3. Proposta de classificação por dificuldade

Hoje existem dois sistemas de dificuldade incompatíveis coexistindo:
enum de 4 valores (`beginner/intermediate/advanced/expert`, usado por
livro/curados) e rating numérico Lichess (`import_metadata->>'rating'`,
tipicamente 600-3000). Uma trilha de ~N níveis sequenciais precisa de
**uma única escala numérica** pra ordenar e definir faixas por nível.

**Proposta**: coluna nova `difficulty_score numeric` em `exercises`
(migration aditiva, nullable, backfill único):

- Lichess: `difficulty_score = rating` direto (já é uma escala Elo-like
  comparável entre puzzles).
- Enum (`beginner/intermediate/advanced/expert`, curados e livro):
  mapeado para o **centro da faixa Lichess equivalente** — proposta
  inicial `beginner→900`, `intermediate→1300`, `advanced→1700`,
  `expert→2100` (faixas revisáveis; não são medidas, são uma ponte entre
  as duas escalas, então precisam ficar num arquivo de configuração
  versionado, não hardcoded espalhado).
- Itens sem nenhuma das duas informações: ficam de fora do pool de
  trilha até terem uma dificuldade atribuída (não adivinhar).

Essa é uma heurística, não uma medição — está listada explicitamente
como risco (seção 10).

---

## 4. Proposta de currículo

Nomes autorais, sem copiar terminologia de concorrente, alinhados à
identidade "Xadrez Essencial" do produto:

| Mundo                    | Faixa `difficulty_score` | Foco pedagógico                                              |
| ------------------------ | ------------------------ | ------------------------------------------------------------ |
| 1 — Primeiros Lances     | 0–800                    | Movimentação de peças, captura, xeque básico                 |
| 2 — Peças em Ação        | 800–1050                 | Peça indefesa, garfo simples, cravada básica                 |
| 3 — Olho Tático          | 1050–1300                | Reconhecimento de padrão misto (garfo/cravada/espeto/raio-x) |
| 4 — Combinações          | 1300–1550                | Sequências forçadas de 2-3 lances, sacrifícios               |
| 5 — Ataque ao Rei        | 1550–1800                | Mate em 2-3, xeque duplo, ataques ao rei                     |
| 6 — Defesa e Resistência | 1800–2000                | Defesa contra ameaças, zugzwang, finais táticos              |
| 7 — Jogador em Formação  | 2000–2200                | Mistura avançada, revisão cruzada de todos os temas táticos  |

**Atualizado depois da query real de inventário (seção 2, já executada em
2026-07-27)**: confirmado que não existe conteúdo tático catalogado acima
de rating 2200 — o teto do Mundo 7 originalmente proposto (2300+) foi
revisado pra baixo pra não prometer um patamar sem conteúdo nenhum pra
alimentá-lo. As faixas acima já são as implementadas de fato pelo script
de seed (`apps/api/src/database/seed-learning-path.ts`), não só a proposta
inicial. Cada Mundo tem Níveis (implementado: até 12 por mundo, menos se o
pool real da faixa for menor — sinal honesto de conteúdo escasso, não
escondido); cada Nível tem até 6 Etapas do tipo `CHALLENGE`, com `REVIEW`
a cada 4 níveis e `BOSS` no último nível de cada Mundo (obrigatório pra
sinalizar o Mundo como concluído).

Etapas do tipo `LESSON` **não são criadas nesta primeira versão** —
reaproveitar o sistema de aulas existente (`lesson_steps`) como Etapa é
possível estruturalmente (a Etapa aponta pra um `lesson_id` em vez de um
`exercise_id`), mas está fora do escopo inicial por não ter sido pedido
com prioridade; a arquitetura de dados (seção 6) já suporta isso quando
for decidido.

---

## 5. Modelo de progressão

**Posicionamento inicial** (`placementLevel`, FASE 5 do spec): para
usuários com histórico em `exercise_attempts`, calcular a maior faixa de
`difficulty_score` onde a taxa de acerto (`correct=true` / total) nos
últimos N (proposta: 20) attempts for ≥ 70%; mapear essa faixa pro Nível
correspondente daquele Mundo. Sem histórico suficiente (< 5 attempts):
começa no Mundo 1, Nível 1 — **sem teste de nivelamento nesta versão**
(o próprio spec permite adiar isso). Usuário sempre pode pular pra outro
ponto manualmente via "Treino Livre" (seção 9), então um posicionamento
levemente errado não é uma armadilha permanente.

**Regra de desbloqueio**:

- Etapas dentro de um Nível: estritamente sequenciais (Etapa N só fica
  `available` quando N-1 está `completed`).
- Níveis dentro de um Mundo: sequenciais também, exceto que o Nível final
  de cada Mundo é sempre `BOSS`/`CHECKPOINT` — sua conclusão desbloqueia
  o Mundo seguinte.
- `highestUnlockedLevel` sempre avança, nunca retrocede (usuário pode
  revisitar Etapas concluídas livremente, sem re-bloquear).

**Estados de nó** (visual, seção 7): `completed` (✓), `current` (● —
próxima etapa não concluída), `locked` (🔒 — depende de algo não
concluído), `checkpoint`/`boss` (🏆 — visual distinto, obrigatório).

---

## 6. Modelo de dados

Reaproveita `exercises`/`exercise_attempts` como estão — **nenhuma
tabela redundante**. Novidade é uma camada de progressão por cima.

### Alterações aditivas em tabelas existentes (migration nova, ex. `0036`)

```sql
ALTER TABLE exercises
  ADD COLUMN difficulty_score numeric,
  ADD COLUMN instructional_metadata jsonb DEFAULT NULL;
```

`instructional_metadata` guarda `{ intro, hints: [], errors: [], success,
explanation }` (FASE 10 do spec) — nullable porque a maioria do pool
(Lichess) não vai ter conteúdo autoral desde o dia 1; quando ausente, o
Instrutor cai num banco de mensagens **genéricas por tipo de padrão**
(uma mensagem "peça indefesa" reaproveitável por tag, não uma frase por
exercício individual — impossível escrever 8000 textos à mão). Esse
banco de mensagens genéricas fica em `packages/contracts` como dado
versionado (mesmo padrão já usado pelo catálogo de preços de IA), não
hardcoded em componente.

### Tabelas novas

```
learning_worlds
  id uuid PK
  order int UNIQUE
  title varchar
  description text
  difficulty_min numeric
  difficulty_max numeric

learning_levels
  id uuid PK
  world_id uuid FK → learning_worlds
  order int
  title varchar
  difficulty_min numeric
  difficulty_max numeric
  challenge_count int
  composition jsonb   -- { newPercent, reviewPercent, stretchPercent } (FASE 6)
  allowed_themes text[] NULL   -- NULL = qualquer tema dentro da faixa
  preferred_themes text[] NULL
  UNIQUE (world_id, order)

learning_stages
  id uuid PK
  level_id uuid FK → learning_levels
  order int
  type stage_type_enum ('challenge','lesson','review','checkpoint','boss')
  exercise_id uuid FK → exercises NULL   -- setado quando type='challenge'/'review'/'boss'
  lesson_id uuid FK → lessons NULL       -- reservado pra type='lesson' (não usado na v1)
  config jsonb DEFAULT '{}'
  UNIQUE (level_id, order)

user_learning_progress
  user_id uuid PK FK → users
  current_world_id uuid FK → learning_worlds
  current_level_id uuid FK → learning_levels
  highest_unlocked_level_id uuid FK → learning_levels
  placement_level_id uuid FK → learning_levels NULL
  xp int DEFAULT 0            -- reservado, FASE 15, sem UI na v1
  streak_days int DEFAULT 0   -- idem
  updated_at timestamptz

user_stage_completions
  user_id uuid FK → users
  stage_id uuid FK → learning_stages
  status stage_status_enum ('locked','available','completed')
  attempts int DEFAULT 0
  correct_first_try boolean
  hints_used int DEFAULT 0
  completed_at timestamptz NULL
  PK (user_id, stage_id)

skill_mastery
  user_id uuid FK → users
  skill text                  -- reaproveita o mesmo valor de tag/tema já usado hoje
  score numeric DEFAULT 0     -- 0-100, EMA simples sobre acerto/erro (fórmula na seção 8)
  attempts int DEFAULT 0
  success_count int DEFAULT 0
  error_count int DEFAULT 0
  last_seen_at timestamptz
  updated_at timestamptz
  PK (user_id, skill)
```

**Decisão explícita**: `skills[]` do spec (distinto de `themes[]`) **não
vira coluna nova** — a base de código não distingue as duas coisas hoje
(seção 8 da auditoria) e criar uma taxonomia paralela sem necessidade
concreta violaria a instrução de não construir abstração além do
necessário. `skill_mastery.skill` reaproveita o mesmo vocabulário de
`exercises.tags` já em uso (garfo, cravada, mate_em_dois, ...).

`ChallengeAttempt` do spec **não é uma tabela nova** — é
`exercise_attempts`, que já existe e já registra usuário, exercício,
acerto, dicas usadas, duração. `user_stage_completions` é o que falta:
o estado por-Etapa (que Etapa está em que status pra aquele usuário),
distinto de "o histórico de tentativas daquele exercício".

Segue o padrão de migration manual `.up.sql`/`.down.sql` já usado pelo
projeto (domínio de exercícios está fora do Drizzle, seção 16.1 da
auditoria) — sem mudar esse padrão nesta reestruturação.

---

## 7. Arquitetura de componentes

### Frontend (`apps/web`)

Nova rota principal, substituindo `/app/desafios` como entrada padrão de
navegação (o `<select>` de tema recua para "Treino Livre", seção 9):

```
/app/treinamento                    (nova rota)
  LearningPathPage
    ProgressHeader                  (mundo/nível atual, resumo geral)
    LearningMap
      WorldSection (× N mundos, colapsável, mundos futuros truncados)
        LevelNode (variantes visuais via prop `status`, não componentes
                    separados: CompletedLevelNode/CurrentLevelNode/
                    LockedLevelNode/CheckpointNode viram `status=
                    'completed'|'current'|'locked'|'checkpoint'` de um
                    único LevelNode — evita 4 componentes quase idênticos)

/app/treinamento/etapa/[stageId]    (nova rota, execução de uma Etapa)
  StageRunner                       (extraído/generalizado de ExerciseTrainer —
                                      ver "Refatoração" abaixo)
    InstructorBubble (InstructorContext, reutilizável fora da trilha)
    ChessBoard        (mesmo componente existente + props aditivas de
                        highlight/seta, sem quebrar os 4 outros consumidores
                        listados na auditoria seção 15)
    FeedbackPanel      (novo — substitui o modal atual por um painel fixo
                        no rodapé, conforme layout da FASE 9 do spec)
    StageProgressFooter

/app/treino-livre                   (renomeado de /app/desafios; ver seção 9)
```

**Refatoração de `ExerciseTrainer` (achado #6 da auditoria seção 18)**:
extrair a fatia "executar UM exercício" (tabuleiro, dica, avaliação de
linha, feedback) para um hook/componente compartilhado
(`useChallengeRunner` ou `ChallengeExecutionPanel`) consumido tanto por
`StageRunner` (trilha nova) quanto por `ExerciseTrainer` (Treino Livre,
que continua existindo). Não reescrever `ExerciseTrainer` do zero — só
mover a parte de execução pra um lugar comum, deixando cada consumidor
com sua própria camada de "o que vem antes/depois" (mapa vs. filtros).

### Backend (`apps/api`)

Módulo novo `learning-path/` (controller + service + repository), sob o
mesmo `AccessTokenGuard` já usado por exercícios:

| Método | Path                                      | Função                                                                                                                                  |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/learning-path/map`                      | Mundos + Níveis + status de cada um pro usuário logado                                                                                  |
| GET    | `/learning-path/levels/:levelId`          | Etapas do nível + status de cada uma                                                                                                    |
| POST   | `/learning-path/stages/:stageId/start`    | Marca Etapa como `available`/em progresso, retorna o `exercise_id` associado                                                            |
| POST   | `/learning-path/stages/:stageId/complete` | Chamado após sucesso no exercício subjacente; atualiza `user_stage_completions`, `skill_mastery`, desbloqueia próxima Etapa/Nível/Mundo |
| GET    | `/learning-path/progress`                 | `UserLearningProgress` resumido (pro `ProgressHeader`)                                                                                  |

**Reaproveitamento explícito**: a execução do exercício em si (validar
lance, revelar dica, gravar tentativa) continua passando pelos endpoints
já existentes (`POST /exercises/:id/evaluate-line`,
`POST /exercise-training-sessions/:id/hints`, etc.) — o módulo novo só
adiciona a camada de "isso é uma Etapa de uma trilha" por cima, sem
duplicar a lógica de correção/dica que já existe e já é testada.

### InstructorContext

`InstructorContext` (React Context, FASE 13) expõe `showMessage(state,
key)` e o estado atual (`neutral|thinking|hint|success|mistake|warning|
celebration`). Fica em `apps/web/src/lib/instructor/` (paralelo a
`lib/engine/`), consumível por qualquer tela — trilha primeiro, com
partida/revisão/onboarding como consumidores futuros (não implementados
nesta v1, só a arquitetura permite).

---

## 8. Fluxograma do usuário

```
Usuário → /app/treinamento
   │
   ▼
LearningPathPage carrega GET /learning-path/map
   │
   ▼
Mapa mostra: mundos concluídos (colapsados) → mundo atual (expandido,
nível `current` visualmente destacado) → mundos futuros (bloqueados)
   │
   ├── toca Nível `locked` → nada acontece (ou tooltip "conclua o anterior")
   ├── toca Nível `completed` → abre lista de Etapas (pode revisitar)
   └── toca Nível `current` → vai direto pra próxima Etapa não concluída
          │
          ▼
   /app/treinamento/etapa/[stageId]
   POST /learning-path/stages/:id/start → recebe exercise_id
          │
          ▼
   StageRunner monta: InstructorBubble (intro) + ChessBoard (FEN do exercício)
          │
          ├── usuário pede dica → dica progressiva (texto se existir,
          │      senão highlight de casa calculado; nunca revela a
          │      solução direto)
          │
          ▼
   usuário joga lance → POST /exercises/:id/evaluate-line (endpoint já
   existente, sem mudança de contrato)
          │
          ├── incorreto → InstructorBubble muda pra `mistake`, explica o
          │      porquê quando o motor souber dizer (ex. peça ficou
          │      indefesa), permite nova tentativa
          │
          └── correto/resolvido → InstructorBubble `success`,
                 POST /learning-path/stages/:id/complete
                 → atualiza user_stage_completions + skill_mastery
                 → desbloqueia próxima Etapa (ou Nível/Mundo se era a última)
                 → FeedbackPanel mostra resultado, botão "Continuar"
          │
          ▼
   "Continuar" → próxima Etapa (mesmo fluxo) ou, se era a última do
   Nível, tela curta de conclusão de Nível (FASE 14: X/Y desafios,
   precisão, dicas usadas) → volta pro Mapa com o novo estado
```

---

## 9. Estratégia de migração

Segue a ordem da FASE 20 do spec, sem pular etapas:

1. Migration aditiva (`exercises.difficulty_score`/`instructional_metadata`
   - 5 tabelas novas) — zero impacto em runtime, nada lê essas colunas
     ainda.
2. Script de backfill/seed do currículo: calcula `difficulty_score` pra
   todo `exercises` existente, gera `learning_worlds`/`learning_levels`/
   `learning_stages` a partir da distribuição real de conteúdo (não
   hardcoded manualmente linha a linha — determinístico e re-executável).
3. Backend: módulo `learning-path` (endpoints de leitura primeiro —
   mapa/progresso — antes dos de escrita).
4. Backend: endpoints de start/complete de Etapa, integrados aos
   endpoints de exercício já existentes.
5. Frontend: `LearningMap` em modo **somente leitura**, atrás de feature
   flag (`learningPathV2`), visível só a admins/contas de teste — valida
   visual antes de expor execução.
6. Frontend: extração da camada de execução compartilhada de
   `ExerciseTrainer` (sem mudar o comportamento de `/app/exercicios` e
   `/app/desafios` existentes) + `StageRunner` consumindo essa camada.
7. Integração completa do fluxo (mapa → nível → etapa → execução →
   conclusão → desbloqueio) atrás da flag, testado ponta a ponta.
8. Cálculo de posicionamento inicial pra usuários existentes (roda uma
   vez, idempotente).
9. `/app/desafios` (`<select>` de tema) renomeado/movido pra
   `/app/treino-livre`; `/app/treinamento` (trilha) vira a entrada
   principal de navegação **só depois** dos passos 1-8 validados.
10. Item de navegação antigo removido da barra principal (o Treino Livre
    continua acessível, só deixa de ser a porta de entrada padrão).

Feature flag `learningPathV2`: proposta é uma linha em `platform_settings`
(mesma tabela já usada pra outros toggles administrativos antes de
existir uma tabela dedicada, ex. `ai.narration` antes da migration
`0034`), lida no backend pra decidir se os endpoints `learning-path/*`
respondem, e exposta ao frontend via `GET /me` ou endpoint de config
público — decisão de implementação, não bloqueia o design.

---

## 10. Riscos

1. **Conteúdo sem dica** (8003/8007 Lichess): dica textual não escala
   pra maior parte do pool — mitigação: dica visual (highlight de
   casa/peça) calculada pelo motor como fallback quando
   `instructional_metadata.hints` está vazio, não bloqueia a FASE 11 mas
   muda sua prioridade de implementação (visual antes de textual pro
   pool grande).
2. **Heurística de dificuldade unificada é uma ponte, não uma medição**
   (seção 3) — pode gerar níveis desbalanceados (fácil demais/difícil
   demais) até ser calibrada com uso real; precisa ser configurável sem
   nova migration (arquivo de config versionado, não constante
   espalhada no código).
3. **Heurística de posicionamento inicial pode errar** — mitigado por
   sempre permitir acesso manual via Treino Livre; não é uma armadilha
   permanente, mas pode frustrar num primeiro momento se super/sub
   estimar.
4. **Refatoração de `ExerciseTrainer`** (1025 linhas, serve 2 rotas em
   produção) é o ponto de maior risco de regressão técnica — mitigado
   por extrair sem reescrever (mover código, não recriar) e manter
   `/app/exercicios`/`/app/desafios` funcionando sem alteração de
   comportamento durante toda a migração.
5. **Volume desconhecido de conteúdo por faixa de dificuldade** — os 7
   Mundos/faixas propostos na seção 4 são uma hipótese; se o inventário
   real (seção 2, Tarefa 1) mostrar concentração desigual (ex. quase
   tudo entre 1200-1800), a curva de Mundos precisa ser redesenhada
   antes do backfill de currículo — **bloqueia o passo 2 da migração
   até essa query rodar**.
6. **Escopo grande**: 23 fases do spec original é trabalho de várias
   semanas se levado a cabo por inteiro; mitigado pela ordem incremental
   da seção 9 e por deixar gamificação (FASE 15) e alguns tipos de Etapa
   (`LESSON`) fora da v1 por decisão explícita, não por esquecimento.

---

## 11. Plano de implementação por fases (visão geral)

Alto nível — o plano bite-sized (testes primeiro, commits, arquivos
exatos) é o próximo passo depois de aprovação, via
`superpowers:writing-plans`, provavelmente dividido em mais de um
documento de plano dado o tamanho (schema/backend vs. frontend/UI podem
ser plans separados executados em sequência ou por agentes distintos).

| Fase de implementação       | Conteúdo                                                                                                                                                                                                              | Depende de         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A — Dados                   | Migration `0036`, script de inventário real (Tarefa 1), script de backfill/seed de currículo                                                                                                                          | —                  |
| B — Backend leitura         | Módulo `learning-path`, endpoints GET (mapa/nível/progresso)                                                                                                                                                          | A                  |
| C — Backend escrita         | Endpoints start/complete de Etapa, integração com `exercise_attempts` existente, atualização de `skill_mastery`                                                                                                       | B                  |
| D — Frontend mapa (RO)      | `LearningMap`/`LevelNode`/`WorldSection`/`ProgressHeader`, atrás de flag, só leitura                                                                                                                                  | B                  |
| E — Extração de execução    | Camada compartilhada de execução extraída de `ExerciseTrainer`, sem mudar comportamento atual                                                                                                                         | — (paralelo a A-D) |
| F — Frontend execução       | `StageRunner` + `InstructorContext`/`InstructorBubble` + dicas visuais no `ChessBoard` (highlight/seta aditivos)                                                                                                      | C, D, E            |
| G — Fluxo completo + testes | Integração ponta a ponta atrás da flag, testes de unidade (`unlockLevel`, `completeChallenge`, `calculateMastery`, `selectNextChallenge`, `requestHint`, `completeLevel`) e de integração do fluxo completo (FASE 22) | F                  |
| H — Posicionamento e corte  | Cálculo de posicionamento pra usuários existentes, `/app/desafios`→Treino Livre, troca de entrada principal, remoção da flag                                                                                          | G                  |
| I — Polimento adiado        | Analytics (FASE 18), acessibilidade (FASE 19), gamificação (FASE 15) — deliberadamente depois do fluxo core validado                                                                                                  | H                  |

---

## Aprovação necessária antes de codificar

Pontos que dependem de decisão sua, não determináveis só pelo código:

1. **Nomes dos Mundos** (seção 4) — são uma proposta, não uma decisão
   fechada; posso ajustar tom/quantidade.
2. **Rota principal nova** (`/app/treinamento`) — nome sujeito a
   preferência sua de produto.
3. **Fórmula de mapeamento enum→difficulty_score** (seção 3) — os
   valores 900/1300/1700/2100 são um ponto de partida razoável, mas é
   uma escolha de calibração, não uma medição.
4. Rodar a **query de inventário real** (seção 2) antes de fechar a
   quantidade/faixas de Mundos — proposta: eu rodo essa query como
   primeiro passo técnico (não precisa de decisão sua, só aviso que vem
   antes do resto).
