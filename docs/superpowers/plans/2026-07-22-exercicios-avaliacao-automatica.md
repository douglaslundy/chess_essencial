# Exercícios: avaliação automática e progressão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make board-playable exercises grade incrementally on the server (1 or N moves, no client-side line map), show a blocking victory/defeat modal with sound, and never repeat already-solved exercises in new training sessions.

**Architecture:** New `POST /v1/exercises/:id/evaluate-line` endpoint compares the player's UCI moves so far against `solution_lines` (interleaved player/opponent), returning `continue` (+ opponent reply), `solved` (+ updated training), or `incorrect`. The web `ExerciseTrainer` calls it after each player move, drops `guided-challenge-lines.ts`, and opens a blocking result modal. `startTraining` excludes exercises the user already solved.

**Tech Stack:** NestJS + postgres.js (api), Zod (contracts), Next.js/React (web), chess.js / `@xadrez/chess-domain` for legality, Vitest for tests.

## Global Constraints

- Contract changes require OpenAPI + generated TypeScript clients regenerated (`pnpm --filter @xadrez/sdk generate` / the repo's openapi-typescript flow) and docs updated.
- All gates must pass before commit: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, web production build.
- Server stays authoritative: verdict and score computed server-side; client never decides success.
- `solution_lines` is `string[][]` (array of alternative lines); each line is interleaved `[player, opponent, player, ...]`, UCI lowercase.
- No external audio assets — synthesize sounds in `apps/web/src/lib/sound.ts` like existing `playMoveSound`.

---

### Task 1: Contract for incremental line evaluation

**Files:**

- Modify: `packages/contracts/src/exercise.ts`
- Test: `packages/contracts/src/exercise.test.ts`

**Interfaces:**

- Produces: `evaluateExerciseLineInputSchema` = `{ trainingSessionId: uuid, playedMoves: string[] (each trimmed, len 2..20, 1..50 items) }`; `evaluateExerciseLineResultSchema` = `{ status: 'continue'|'solved'|'incorrect', opponentReply: string | null, movesConfirmed: number, attempt: exerciseAttemptResultSchema | null }`. Types `EvaluateExerciseLineInput`, `EvaluateExerciseLineResult`.

- [ ] **Step 1: Write failing test** in `exercise.test.ts` asserting `evaluateExerciseLineInputSchema` parses `{ trainingSessionId: <uuid>, playedMoves: ['e2e4'] }` and rejects empty `playedMoves`; and that `evaluateExerciseLineResultSchema` parses `{ status: 'continue', opponentReply: 'e7e5', movesConfirmed: 1, attempt: null }`.
- [ ] **Step 2:** Run `pnpm --filter @xadrez/contracts test -- exercise` → FAIL (schemas undefined).
- [ ] **Step 3:** Add the two schemas + exported types to `exercise.ts` (reuse `exerciseAttemptResultSchema`).
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Commit `feat(contracts): add exercise line evaluation schema`.

---

### Task 2: Server grader

**Files:**

- Modify: `apps/api/src/exercises/exercises.repository.ts`
- Test: `apps/api/src/exercises/exercise-grader.test.ts` (new, pure unit test of the grader function)

**Interfaces:**

- Consumes: `AttemptExerciseRow` (has `solution_lines: string[][]`, `fen`, `position_type`), `EvaluateExerciseLineInput`.
- Produces: exported pure function `gradePlayedMoves(solutionLines: string[][], playedMoves: string[]): { status: 'continue'|'solved'|'incorrect'; opponentReply: string | null; movesConfirmed: number }`. Player moves occupy even indices of each line; opponent moves odd indices. `playedMoves` are player moves only.

- [ ] **Step 1: Write failing tests** in `exercise-grader.test.ts`:
  - single-move line `[['e1e8']]`, played `['e1e8']` → `{ status:'solved', opponentReply:null, movesConfirmed:1 }`.
  - mate-in-two `[['e6g8','f8g8','h6f7']]`, played `['e6g8']` → `{ status:'continue', opponentReply:'f8g8', movesConfirmed:1 }`.
  - same line, played `['e6g8','h6f7']` → `{ status:'solved', opponentReply:null, movesConfirmed:2 }`.
  - wrong first move `['e6g8']` vs played `['a1a2']` → `{ status:'incorrect', ... }`.
  - two alt lines, player move matches only the second → follows that line.
- [ ] **Step 2:** Run `pnpm --filter @xadrez/api test -- exercise-grader` → FAIL.
- [ ] **Step 3:** Implement `gradePlayedMoves`: keep candidate lines whose player-move subsequence (even indices) matches `playedMoves` prefix; if none → `incorrect`; if any candidate's player moves are fully consumed and it's the last player move → `solved`; else `continue` with `opponentReply` = first candidate's move at index `2*playedMoves.length - 1`.
- [ ] **Step 4:** Run test → PASS.
- [ ] **Step 5:** Commit `feat(api): incremental exercise line grader`.

---

### Task 3: Repository evaluateLine + service + controller wiring

**Files:**

- Modify: `apps/api/src/exercises/exercises.repository.ts`, `exercises.service.ts`, `exercises.controller.ts`
- Test: `apps/api/src/exercises/exercises.e2e.test.ts` (extend)

**Interfaces:**

- Consumes: `gradePlayedMoves`, existing `attempt()`.
- Produces: `ExercisesRepository.evaluateLine(userId, exerciseId, input: EvaluateExerciseLineInput): Promise<EvaluateExerciseLineResult>`; `ExercisesService.evaluateLine(...)`; `POST /v1/exercises/:id/evaluate-line`.

- [ ] **Step 1:** Add e2e test: start a training session on a known playable challenge; POST evaluate-line with the correct first player move of a mate-in-two returns `status:'continue'` + correct `opponentReply`; POSTing the full player line returns `status:'solved'` and `attempt.correct === true`, and the training advances.
- [ ] **Step 2:** Run `pnpm --filter @xadrez/api test -- exercises.e2e` → FAIL.
- [ ] **Step 3:** Implement `evaluateLine`: load exercise row (reuse the SELECT from `attempt`), verify the exercise is current in the session (reuse the `FOR UPDATE` guard), call `gradePlayedMoves`; on `solved` build the full interleaved line and call existing `attempt()` to persist and advance, return its result in `attempt`; on `continue`/`incorrect` return without persisting (incorrect does not advance). Wire service + controller (`@Post(':id/evaluate-line')`, auth guard like sibling routes, Zod validation pipe used by neighbors).
- [ ] **Step 4:** Run test → PASS.
- [ ] **Step 5:** Regenerate OpenAPI + clients; run `pnpm --filter @xadrez/sdk check` (or repo's generate+check). Commit `feat(api): exercise evaluate-line endpoint`.

---

### Task 4: Progression — exclude solved exercises

**Files:**

- Modify: `apps/api/src/exercises/exercises.repository.ts` (`startTraining` subquery)
- Test: `apps/api/src/exercises/exercises.e2e.test.ts` (extend)

- [ ] **Step 1:** Add e2e test: user solves exercise A (via attempt/evaluate), then `startTraining` again with the same filter; the new session's first item is NOT A.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add to the `startTraining` selection subquery: `AND NOT EXISTS (SELECT 1 FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = ${userId} AND a.correct = true)`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): training excludes already-solved exercises`.

---

### Task 5: Victory/defeat sounds

**Files:**

- Modify: `apps/web/src/lib/sound.ts`
- Test: `apps/web/src/lib/sound.test.ts` (if present; else skip test, it's WebAudio)

- [ ] **Step 1:** Add `playVictorySound()` and `playDefeatSound()` mirroring `playMoveSound` structure (rising triad for victory, falling minor for defeat), guarded by the same audio-primed check.
- [ ] **Step 2:** Run `pnpm --filter @xadrez/web test -- sound` (or typecheck if no test) → PASS/compiles.
- [ ] **Step 3:** Commit `feat(web): victory and defeat sounds`.

---

### Task 6: ExerciseTrainer uses evaluate-line + result modal

**Files:**

- Modify: `apps/web/src/components/exercises/exercise-trainer.tsx`, `exercise-trainer.module.css`
- Delete: `apps/web/src/components/exercises/guided-challenge-lines.ts`, `guided-challenge-lines.test.ts`
- Modify: `apps/web/src/lib/api/client.ts` (add `evaluateExerciseLine`)
- Test: `apps/web/src/components/exercises/exercise-trainer.test.tsx` (extend)

**Interfaces:**

- Consumes: `api.evaluateExerciseLine(exerciseId, { trainingSessionId, playedMoves }, token): Promise<EvaluateExerciseLineResult>`.

- [ ] **Step 1:** Add web test: rendering a guided playable exercise, playing the winning move triggers a result modal with "Você venceu!" and a "Próximo exercício" button; playing a wrong move shows "Não foi dessa vez" with "Tentar novamente".
- [ ] **Step 2:** Run `pnpm --filter @xadrez/web test -- exercise-trainer` → FAIL.
- [ ] **Step 3:** Implement: add `api.evaluateExerciseLine`; in `playBoardMove`, when `guided` and `legal_position`, after applying the player's move call `evaluateExerciseLine` with the accumulated player moves; on `continue` animate `opponentReply` (reuse existing opponent animation code path); on `solved` play victory sound + open modal; on `incorrect` play defeat sound + open modal. Remove all `guidedChallengeLine`/`hasGuidedLine` usage and the free-text UCI-confirm branch for guided playable exercises. Keep free_text answer input for `free_text` exercises. Modal is blocking (`role="dialog"`, `aria-modal`), closes only via its buttons; "Próximo exercício" loads next (training already advanced server-side), "Tentar novamente" resets the board to `current.fen`.
- [ ] **Step 4:** Run web test → PASS.
- [ ] **Step 5:** Commit `feat(web): auto-graded exercises with result modal`.

---

### Task 7: Full gates + docs

- [ ] **Step 1:** Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm --filter @xadrez/web build`. Fix any failures.
- [ ] **Step 2:** Update `PROGRESSO.md` (note the guided-challenge-lines debt is resolved) and `TAREFAS.md` if needed.
- [ ] **Step 3:** Commit `chore: gates + docs for exercise auto-grading`, then push and let CI go green before deploy.

## Self-Review

- Spec coverage: auto-grading (Tasks 1-3), mate-in-N (Task 2 multi-move), result modal + sound (Tasks 5-6), progression (Task 4), remove client map (Task 6), tests (each task). ✓
- No placeholders: each step names files, commands, and concrete logic. ✓
- Type consistency: `gradePlayedMoves` signature and `EvaluateExerciseLineResult` fields (`status`, `opponentReply`, `movesConfirmed`, `attempt`) are used identically across Tasks 1-3-6. ✓
