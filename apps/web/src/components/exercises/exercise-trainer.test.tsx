// @vitest-environment jsdom
import type {
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

vi.mock('@/lib/api/client', () => ({
  api: {
    getExerciseMetrics: (...args: unknown[]) => getExerciseMetrics(...args),
    revealExerciseHint: vi.fn(),
    revealExerciseSolution: vi.fn(),
    searchExercises: (...args: unknown[]) => searchExercises(...args),
    startExerciseTraining: (...args: unknown[]) => startExerciseTraining(...args),
    submitExerciseAttempt: (...args: unknown[]) => submitExerciseAttempt(...args),
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
