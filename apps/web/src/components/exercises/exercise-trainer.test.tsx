// @vitest-environment jsdom
import type {
  EvaluateExerciseLineResult,
  ExerciseAttemptResult,
  ExerciseSearchResult,
  ExerciseTrainingView,
} from '@xadrez/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExerciseTrainer } from './exercise-trainer';

const emptySearch: ExerciseSearchResult = { items: [], limit: 20, offset: 0, total: 0 };
const emptyMetrics = {
  accuracyPercent: 0,
  attempted: 0,
  averageDurationMs: 0,
  correct: 0,
  hintsUsed: 0,
};

const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// The mocked board emits whatever UCI is queued here when its button is clicked.
let nextBoardMove = 'e2e4';

vi.mock('@/components/game/chess-board', () => ({
  ChessBoard: (props: { onMove: (uci: string) => void; disabled?: boolean }) =>
    createElement(
      'button',
      {
        type: 'button',
        disabled: props.disabled,
        onClick: () => props.onMove(nextBoardMove),
      },
      'play-board-move',
    ),
}));

function trainingView(): ExerciseTrainingView {
  return {
    completed: 0,
    currentExercise: {
      answerFormat: 'move_sequence',
      category: 'aberturas',
      chapterNumber: null,
      difficulty: 'beginner',
      fen: startFen,
      id: '99000000-0000-4000-8000-000000000001',
      moduleNumber: 1,
      positionType: 'legal_position',
      promptMd: 'Jogue o melhor lance para as brancas.',
      sideToMove: 'white',
      sourceNumber: 1,
      sourcePages: [],
      tags: [],
      title: 'Exercício de teste',
    },
    position: 1,
    sessionId: '99000000-0000-4000-8000-000000000099',
    status: 'started',
    total: 1,
  };
}

const searchExercises = vi.fn();
const getExerciseMetrics = vi.fn();
const startExerciseTraining = vi.fn();
const submitExerciseAttempt = vi.fn();
const evaluateExerciseLine = vi.fn();
const getExerciseTraining = vi.fn();

vi.mock('@/lib/api/client', () => ({
  api: {
    getExerciseMetrics: (...args: unknown[]) => getExerciseMetrics(...args),
    getExerciseTraining: (...args: unknown[]) => getExerciseTraining(...args),
    revealExerciseHint: vi.fn(),
    revealExerciseSolution: vi.fn(),
    searchExercises: (...args: unknown[]) => searchExercises(...args),
    startExerciseTraining: (...args: unknown[]) => startExerciseTraining(...args),
    submitExerciseAttempt: (...args: unknown[]) => submitExerciseAttempt(...args),
    evaluateExerciseLine: (...args: unknown[]) => evaluateExerciseLine(...args),
  },
}));

async function startTrainingSession() {
  render(createElement(ExerciseTrainer));
  await screen.findByText('Nenhum exercício corresponde aos filtros.');
  fireEvent.click(screen.getByRole('button', { name: 'Treinar resultados' }));
  await screen.findByText('Jogue o melhor lance para as brancas.');
}

describe('ExerciseTrainer submission feedback', () => {
  beforeEach(() => {
    window.localStorage.setItem('xadrez.access_token', 'test-token');
    nextBoardMove = 'e2e4';
    searchExercises.mockResolvedValue(emptySearch);
    getExerciseMetrics.mockResolvedValue(emptyMetrics);
    startExerciseTraining.mockResolvedValue(trainingView());
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows a success balloon after submitting a correct attempt', async () => {
    submitExerciseAttempt.mockResolvedValue({
      attemptId: '99000000-0000-4000-8000-000000000010',
      correct: true,
      hintsUsed: 0,
      score: 100,
      training: null,
    } satisfies ExerciseAttemptResult);

    await startTrainingSession();
    fireEvent.change(screen.getByPlaceholderText('e2e4 e7e5'), { target: { value: 'e2e4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar tentativa' }));

    expect(await screen.findByText(/Correto\. Próximo desafio liberado\./)).toBeTruthy();
    expect(await screen.findByText('Você conseguiu!')).toBeTruthy();
  });

  it('shows a failure balloon after submitting an incorrect attempt', async () => {
    submitExerciseAttempt.mockResolvedValue({
      attemptId: '99000000-0000-4000-8000-000000000011',
      correct: false,
      hintsUsed: 0,
      score: 0,
      training: trainingView(),
    } satisfies ExerciseAttemptResult);

    await startTrainingSession();
    fireEvent.change(screen.getByPlaceholderText('e2e4 e7e5'), { target: { value: 'e2e4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar tentativa' }));

    expect(await screen.findByText('Ainda não. Esse não era o lance certo.')).toBeTruthy();
    expect(await screen.findByText('Essa não era a jogada certa.')).toBeTruthy();
  });
});

describe('ExerciseTrainer guided auto-grading modal', () => {
  beforeEach(() => {
    window.localStorage.setItem('xadrez.access_token', 'test-token');
    nextBoardMove = 'e2e4';
    getExerciseMetrics.mockResolvedValue(emptyMetrics);
    startExerciseTraining.mockResolvedValue(trainingView());
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  async function renderGuided() {
    render(<ExerciseTrainer guided />);
    await screen.findByText('Jogue o melhor lance para as brancas.');
  }

  it('opens a victory modal when the played line is solved', async () => {
    evaluateExerciseLine.mockResolvedValue({
      status: 'solved',
      opponentReply: null,
      movesConfirmed: 1,
      attempt: {
        attemptId: '99000000-0000-4000-8000-000000000020',
        correct: true,
        hintsUsed: 0,
        score: 100,
        training: { ...trainingView(), completed: 1, status: 'completed' },
      },
    } satisfies EvaluateExerciseLineResult);

    await renderGuided();
    fireEvent.click(screen.getByRole('button', { name: 'play-board-move' }));

    expect(await screen.findByText('Você venceu!')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Próximo exercício/ })).toBeTruthy();
  });

  it('opens a defeat modal with retry when the move is incorrect', async () => {
    nextBoardMove = 'e2e4';
    evaluateExerciseLine.mockResolvedValue({
      status: 'incorrect',
      opponentReply: null,
      movesConfirmed: 1,
      attempt: null,
    } satisfies EvaluateExerciseLineResult);

    await renderGuided();
    fireEvent.click(screen.getByRole('button', { name: 'play-board-move' }));

    expect(await screen.findByText('Não foi dessa vez')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
  });
});
