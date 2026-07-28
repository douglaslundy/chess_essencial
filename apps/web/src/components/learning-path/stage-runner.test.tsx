// @vitest-environment jsdom
import type {
  CompleteLearningStageResult,
  EvaluateExerciseLineResult,
  ExerciseSummary,
  LearningLevelDetail,
  StartLearningStageResult,
} from '@xadrez/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StageRunner } from './stage-runner';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const stageId = '99000000-0000-4000-8000-000000000010';
const exerciseId = '99000000-0000-4000-8000-000000000020';
const trainingSessionId = '99000000-0000-4000-8000-000000000030';
const levelId = '99000000-0000-4000-8000-000000000040';

// The mocked board plays whichever UCI is queued next when clicked - lets
// the test drive a specific two-move sequence (player, opponent reply via
// the mocked API response, player again) without a real chess engine.
let nextBoardMove = 'e2e4';

vi.mock('@/components/game/chess-board', () => ({
  ChessBoard: (props: { onMove: (uci: string) => void; disabled?: boolean }) =>
    createElement(
      'button',
      { disabled: props.disabled, onClick: () => props.onMove(nextBoardMove), type: 'button' },
      'play-board-move',
    ),
}));

const startLearningStage = vi.fn();
const getExerciseById = vi.fn();
const evaluateExerciseLine = vi.fn();
const completeLearningStage = vi.fn();
const getLearningLevel = vi.fn();
const revealExerciseHint = vi.fn();
const getLesson = vi.fn();

vi.mock('@/lib/api/client', () => ({
  api: {
    completeLearningStage: (...args: unknown[]) => completeLearningStage(...args),
    evaluateExerciseLine: (...args: unknown[]) => evaluateExerciseLine(...args),
    getExerciseById: (...args: unknown[]) => getExerciseById(...args),
    getLearningLevel: (...args: unknown[]) => getLearningLevel(...args),
    getLesson: (...args: unknown[]) => getLesson(...args),
    revealExerciseHint: (...args: unknown[]) => revealExerciseHint(...args),
    startLearningStage: (...args: unknown[]) => startLearningStage(...args),
  },
}));

function stageStart(): StartLearningStageResult {
  return { exerciseId, levelId, stageId, trainingSessionId, type: 'challenge' };
}

function exercise(): ExerciseSummary {
  return {
    answerFormat: 'move_sequence',
    category: 'aberturas',
    chapterNumber: null,
    difficulty: 'beginner',
    fen: startFen,
    hintsAvailable: 0,
    id: exerciseId,
    moduleNumber: 1,
    positionType: 'legal_position',
    promptMd: 'Jogue o melhor lance para as brancas.',
    sideToMove: 'white',
    sourceNumber: 1,
    sourcePages: [],
    tags: [],
    title: 'Etapa de teste',
  };
}

function level(): LearningLevelDetail {
  return {
    completedStageCount: 1,
    id: levelId,
    isCapstone: false,
    position: 1,
    stageCount: 2,
    stages: [],
    status: 'current',
    title: 'Nível 1',
    worldId: '99000000-0000-4000-8000-000000000050',
  };
}

function completion(): CompleteLearningStageResult {
  return {
    correctFirstTry: true,
    hintsUsed: 0,
    levelCompleted: false,
    newBadges: [],
    stageId,
    status: 'completed',
    streakDays: 1,
    worldCompleted: false,
    xpAwarded: 15,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('StageRunner multi-move exercises', () => {
  it("sends only the player's own moves to evaluate-line, never folding the opponent reply back in", async () => {
    window.localStorage.setItem('xadrez.access_token', 'test-token');
    startLearningStage.mockResolvedValue(stageStart());
    getExerciseById.mockResolvedValue(exercise());
    getLearningLevel.mockResolvedValue(level());
    completeLearningStage.mockResolvedValue(completion());

    // First player move (e2e4): the exercise continues with a forced
    // opponent reply (e7e5) - this is the exact response shape that used
    // to get folded into the NEXT evaluate-line call's playedMoves.
    evaluateExerciseLine.mockResolvedValueOnce({
      attempt: null,
      movesConfirmed: 1,
      opponentReply: 'e7e5',
      status: 'continue',
    } satisfies EvaluateExerciseLineResult);
    // Second player move (g1f3) actually solves it.
    evaluateExerciseLine.mockResolvedValueOnce({
      attempt: {
        attemptId: '99000000-0000-4000-8000-000000000090',
        correct: true,
        hintsUsed: 0,
        score: 100,
        training: null,
      },
      movesConfirmed: 2,
      opponentReply: null,
      status: 'solved',
    } satisfies EvaluateExerciseLineResult);

    render(createElement(StageRunner, { stageId }));

    const board = await screen.findByText('play-board-move');

    nextBoardMove = 'e2e4';
    board.click();
    await waitFor(() => expect(evaluateExerciseLine).toHaveBeenCalledTimes(1));
    expect(evaluateExerciseLine.mock.calls[0]![1]).toMatchObject({
      playedMoves: ['e2e4'],
      trainingSessionId,
    });

    // The board is unlocked again ("continue") once the opponent's reply
    // has been animated onto it.
    await waitFor(() =>
      expect((screen.getByText('play-board-move') as HTMLButtonElement).disabled).toBe(false),
    );

    nextBoardMove = 'g1f3';
    screen.getByText('play-board-move').click();
    await waitFor(() => expect(evaluateExerciseLine).toHaveBeenCalledTimes(2));

    // This is the actual regression: before the fix this array was
    // ['e2e4', 'e7e5', 'g1f3'] - the backend only ever expects the
    // player's own moves, so every multi-move exercise was unsolvable.
    expect(evaluateExerciseLine.mock.calls[1]![1]).toMatchObject({
      playedMoves: ['e2e4', 'g1f3'],
      trainingSessionId,
    });

    await waitFor(() => expect(completeLearningStage).toHaveBeenCalled());
  });
});
