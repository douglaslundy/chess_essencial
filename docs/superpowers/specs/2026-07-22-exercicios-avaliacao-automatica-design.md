# Exercícios: avaliação automática, mate em N lances e progressão persistente

Data: 2026-07-22
Sub-projeto 1 de 8 do lote de melhorias de exercícios/UX.

## Problema

O usuário relatou dois defeitos nos exercícios/desafios jogáveis no tabuleiro:

1. **Exige clique em "Confirmar" e não dá retorno claro.** Ao jogar um
   exercício de tabuleiro, é preciso clicar num botão para o sistema analisar;
   não há confirmação clara (balão + som) de vitória/derrota. O sistema deveria
   avaliar automaticamente a cada lance e, em exercícios de 2+ lances (mate em 2,
   mate em 3), calcular quantos lances faltam antes de decidir o resultado.
2. **Não há progressão.** Toda vez que o treino inicia, começa pelo mesmo
   exercício já resolvido, em vez de continuar nos próximos. A memória de
   evolução não é gravada/consultada.

## Diagnóstico (confirmado no código e nos dados reais)

- Exercícios jogáveis no tabuleiro são apenas os `legal_position` +
  `answer_format = move_sequence`: hoje os ~21 Desafios/Clássicos das migrations
  0011/0012/0013. Os 1.298 exercícios do livro são todos `free_text` (sem
  tabuleiro jogável) e ficam **fora** desta spec.
- A auto-avaliação sem botão já existe, mas depende de um mapa **hard-coded no
  cliente** (`apps/web/src/components/exercises/guided-challenge-lines.ts`) que
  cobre só 14 dos ~21 puzzles. Os demais caem no fluxo antigo (digitar UCI +
  clicar "Confirmar"). Essa duplicação com `solution_lines` do banco já está
  registrada como dívida técnica no PROGRESSO.md.
- `exercises.repository.ts` → `startTraining()` seleciona sempre os N primeiros
  exercícios por dificuldade/número (`ORDER BY difficulty_rank, source_number,
id LIMIT n`) **sem excluir** os que o usuário já acertou. A tabela
  `exercise_attempts` (migration 0001/0007) guarda o histórico com coluna
  `correct`, mas não é usada nessa seleção.
- `solution_lines jsonb` já é `array de arrays` (múltiplas linhas alternativas
  aceitas), então já comporta sequências multi-lance como
  `[["e6g8","f8g8","h6f7"]]` (mate em 2 existente).

## Objetivo

Que qualquer exercício jogável no tabuleiro (atual ou futuro) seja avaliado
lance a lance pelo servidor, sem depender de mapa client-side; que o resultado
apareça num modal bloqueante com som de vitória/derrota; e que o treino
progrida, nunca repetindo exercícios já resolvidos.

## Arquitetura

### 1. Avaliação incremental server-authoritative

Novo endpoint REST (autenticado), ex.:
`POST /v1/exercises/:id/evaluate-line`

- **Entrada:** `{ trainingSessionId, playedMoves: string[] }` (UCI, os lances do
  **jogador** jogados até agora — as respostas do adversário NÃO são enviadas
  pelo cliente; o servidor as deduz).
- **Lógica:** o servidor tem `solution_lines` (array de linhas). Uma linha é
  `[jogador, adversário, jogador, adversário, ...]` (índices pares = jogador).
  O servidor compara os `playedMoves` do jogador contra os lances de jogador de
  cada linha candidata ainda compatível:
  - Se algum `playedMoves[k]` não bate com nenhuma linha candidata →
    `status: 'incorrect'` (encerra a tentativa).
  - Se todos batem e a linha acabou (jogador deu o último lance) →
    `status: 'solved'` com `score` e `training` atualizado (avança a posição).
  - Se todos batem mas falta continuar → `status: 'continue'` +
    `opponentReply` (o lance ímpar seguinte da linha, em UCI) para o cliente
    animar a resposta forçada do adversário. Se houver empate entre linhas
    candidatas com respostas diferentes, escolhe deterministicamente a primeira.
- **Server-authoritative:** o veredito e o `score` continuam calculados no
  servidor; o cliente nunca decide sozinho se ganhou.

Isso substitui `guided-challenge-lines.ts` (removido junto com seu teste) e faz
exercícios multi-lance (mate em N) funcionarem só por terem `solution_lines`
corretas — sem cadastro extra por exercício, beneficiando de graça o
sub-projeto 2 (geração de conteúdo tático em escala).

O endpoint atual de submissão final (`submitExerciseAttempt`) permanece para
compatibilidade dos exercícios `free_text` (resposta digitada) e é reutilizado
internamente para gravar o `exercise_attempt` quando a linha é resolvida.

### 2. Confirmação de resultado (modal bloqueante)

Ao receber `solved` ou `incorrect`, o `ExerciseTrainer` abre um modal
bloqueante:

- Vitória: "Você venceu!" + som de vitória.
- Derrota: "Não foi dessa vez" + som de derrota, com botão "Tentar novamente"
  (reinicia o mesmo exercício) e "Próximo".
- Fecha só por clique ("Próximo exercício" / "Tentar novamente"); então o
  próximo exercício carrega.

Dois novos sons em `apps/web/src/lib/sound.ts` (`playVictorySound`,
`playDefeatSound`), no mesmo estilo de síntese leve (WebAudio) já usado por
`playMoveSound`/`playCaptureSound` — sem assets externos.

### 3. Progressão persistente

Em `startTraining()`, a subquery de seleção de exercícios passa a excluir os já
resolvidos pelo usuário:

```
AND NOT EXISTS (
  SELECT 1 FROM exercise_attempts a
   WHERE a.exercise_id = e.id AND a.user_id = <user> AND a.correct = true
)
```

Assim cada nova sessão de treino continua nos próximos exercícios não
resolvidos, na mesma ordem de dificuldade. Quando o filtro atual não tem mais
exercícios não resolvidos, a sessão nasce `completed` (já suportado) e a UI
mostra mensagem de "Você concluiu todos os exercícios deste filtro".

O retomar de sessão salva (localStorage → `getExerciseTraining`) continua
funcionando; a diferença é que uma sessão **nova** não recomeça do zero.

## Componentes afetados

- `packages/contracts/src/exercise.ts` — schema do novo endpoint
  (`evaluateExerciseLineInput/Result`) + tipos.
- `api/openapi.yaml` + clientes gerados (`apps/web/.../openapi.d.ts`,
  `packages/sdk/generated/openapi.ts`) — regenerados via `openapi-typescript`.
- `apps/api/src/exercises/exercises.service.ts` + `.repository.ts` +
  `.controller.ts` — grader incremental e exclusão de resolvidos.
- `apps/web/src/components/exercises/exercise-trainer.tsx` — usa o novo endpoint,
  remove dependência de `guided-challenge-lines.ts`, abre o modal de resultado.
- `apps/web/src/lib/sound.ts` — sons de vitória/derrota.
- Remoção: `guided-challenge-lines.ts` + `guided-challenge-lines.test.ts`.

## Tratamento de erros

- Lance ilegal na posição → o cliente já bloqueia (chess.js) antes de enviar;
  o servidor revalida legalidade e responde `incorrect` se receber lance ilegal.
- Sessão inexistente/expirada → 404/limpa localStorage e reinicia treino (fluxo
  atual mantido).
- Empate entre linhas de solução → escolha determinística da primeira linha.

## Testes

- Unitário do grader (api): 1 lance correto → `solved`; multi-lance linha
  completa → `solved`; lance certo no meio → `continue` + `opponentReply`
  correto; lance errado no meio → `incorrect`; lance ilegal → `incorrect`.
- Contrato (contracts): schema do novo endpoint aceita/valida entrada e saída.
- Integração (api e2e): duas sessões de treino seguidas para o mesmo usuário
  não repetem um exercício já resolvido.
- Web: teste do `ExerciseTrainer` cobrindo abertura do modal em vitória/derrota
  e avanço ao clicar "Próximo".

## Fora de escopo (outros sub-projetos)

- Geração de novos exercícios táticos multi-lance em escala (sub-projeto 2).
- Conteúdo de estudo antes das perguntas do livro (sub-projeto 3).
- Onde o usuário vê o rating / header / avatar / admin / modo sem tempo /
  contraste do tabuleiro (sub-projetos 4-8).
