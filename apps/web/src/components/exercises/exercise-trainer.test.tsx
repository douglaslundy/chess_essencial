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
      hintsAvailable: 2,
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
const getExerciseStudy = vi.fn();
const listChallengeThemes = vi.fn();

vi.mock('@/lib/api/client', () => ({
  api: {
    getExerciseMetrics: (...args: unknown[]) => getExerciseMetrics(...args),
    getExerciseTraining: (...args: unknown[]) => getExerciseTraining(...args),
    listChallengeThemes: (...args: unknown[]) => listChallengeThemes(...args),
    revealExerciseHint: vi.fn(),
    revealExerciseSolution: vi.fn(),
    searchExercises: (...args: unknown[]) => searchExercises(...args),
    startExerciseTraining: (...args: unknown[]) => startExerciseTraining(...args),
    submitExerciseAttempt: (...args: unknown[]) => submitExerciseAttempt(...args),
    evaluateExerciseLine: (...args: unknown[]) => evaluateExerciseLine(...args),
    getExerciseStudy: (...args: unknown[]) => getExerciseStudy(...args),
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

  it('opens the result modal with a continue button after a correct attempt', async () => {
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

    expect(await screen.findByText('Você venceu!')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Próximo exercício/ })).toBeTruthy();
  });

  it('opens the result modal with a retry button after an incorrect attempt', async () => {
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

    expect(await screen.findByText('Não foi dessa vez')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeTruthy();
  });
});

describe('ExerciseTrainer guided auto-grading modal', () => {
  beforeEach(() => {
    window.localStorage.setItem('xadrez.access_token', 'test-token');
    nextBoardMove = 'e2e4';
    getExerciseMetrics.mockResolvedValue(emptyMetrics);
    startExerciseTraining.mockResolvedValue(trainingView());
    listChallengeThemes.mockResolvedValue([]);
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

  it('lets the learner pick a catalogued theme, starting a fresh themed batch', async () => {
    listChallengeThemes.mockResolvedValue([
      { count: 343, theme: 'garfo' },
      { count: 1206, theme: 'mate_em_dois' },
    ]);
    render(<ExerciseTrainer guided showThemeFilter />);
    await screen.findByText('Jogue o melhor lance para as brancas.');

    const select = await screen.findByLabelText('Tema tático');
    expect(screen.getByRole('option', { name: 'Garfo (343)' })).toBeTruthy();

    const secondExercise = {
      ...trainingView().currentExercise!,
      id: '99000000-0000-4000-8000-000000000030',
      promptMd: 'Encontre o garfo.',
    };
    startExerciseTraining.mockResolvedValueOnce({
      ...trainingView(),
      currentExercise: secondExercise,
    });
    fireEvent.change(select, { target: { value: 'garfo' } });

    await screen.findByText('Encontre o garfo.');
    expect(startExerciseTraining).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ theme: 'garfo' }) }),
      'test-token',
    );
  });

  it('offers a hint button when the exercise has hints', async () => {
    await renderGuided();
    expect(screen.getByRole('button', { name: 'Pedir dica' })).toBeTruthy();
  });

  it('hides the hint button when the exercise has no hints recorded', async () => {
    startExerciseTraining.mockResolvedValue({
      ...trainingView(),
      currentExercise: { ...trainingView().currentExercise!, hintsAvailable: 0 },
    });
    await renderGuided();
    expect(screen.queryByRole('button', { name: 'Pedir dica' })).toBeNull();
  });

  it('opens a victory modal when the played line is solved, then shows the batch-completed screen once dismissed', async () => {
    evaluateExerciseLine.mockResolvedValue({
      status: 'solved',
      opponentReply: null,
      movesConfirmed: 1,
      attempt: {
        attemptId: '99000000-0000-4000-8000-000000000020',
        correct: true,
        hintsUsed: 0,
        score: 100,
        training: { ...trainingView(), completed: 1, currentExercise: null, status: 'completed' },
      },
    } satisfies EvaluateExerciseLineResult);

    await renderGuided();
    fireEvent.click(screen.getByRole('button', { name: 'play-board-move' }));

    expect(await screen.findByText('Você venceu!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Próximo exercício/ }));

    expect(await screen.findByText('Treino concluído')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Próximo desafio/ })).toBeTruthy();
  });

  it('offers a way to fetch a fresh batch once every challenge in the current one is solved', async () => {
    startExerciseTraining.mockResolvedValueOnce({
      ...trainingView(),
      completed: 1,
      currentExercise: null,
      status: 'completed',
    });
    render(<ExerciseTrainer guided />);
    await screen.findByText('Treino concluído');

    startExerciseTraining.mockResolvedValueOnce(trainingView());
    fireEvent.click(screen.getByRole('button', { name: /Próximo desafio/ }));

    await screen.findByText('Jogue o melhor lance para as brancas.');
    expect(startExerciseTraining).toHaveBeenCalledTimes(2);
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

  it('offers a retry button (not the raw browser error) when grading the move fails over the network, and recovers on retry', async () => {
    nextBoardMove = 'e2e4';
    evaluateExerciseLine.mockRejectedValueOnce(new TypeError('Load failed'));

    await renderGuided();
    fireEvent.click(screen.getByRole('button', { name: 'play-board-move' }));

    const retryButton = await screen.findByRole('button', { name: /Tentar avaliar novamente/ });
    expect(screen.queryByText('Load failed')).toBeNull();

    evaluateExerciseLine.mockResolvedValueOnce({
      status: 'solved',
      opponentReply: null,
      movesConfirmed: 1,
      attempt: {
        attemptId: '99000000-0000-4000-8000-000000000022',
        correct: true,
        hintsUsed: 0,
        score: 100,
        training: { ...trainingView(), completed: 1, currentExercise: null, status: 'completed' },
      },
    } satisfies EvaluateExerciseLineResult);
    fireEvent.click(retryButton);

    expect(await screen.findByText('Você venceu!')).toBeTruthy();
  });

  it('lets the learner review the previous exercise after solving one', async () => {
    const secondExercise = {
      ...trainingView().currentExercise!,
      id: '99000000-0000-4000-8000-000000000099',
      promptMd: 'Segundo exercício da sessão.',
    };
    evaluateExerciseLine.mockResolvedValue({
      status: 'solved',
      opponentReply: null,
      movesConfirmed: 1,
      attempt: {
        attemptId: '99000000-0000-4000-8000-000000000021',
        correct: true,
        hintsUsed: 0,
        score: 100,
        training: { ...trainingView(), currentExercise: secondExercise, position: 2 },
      },
    } satisfies EvaluateExerciseLineResult);

    await renderGuided();
    fireEvent.click(screen.getByRole('button', { name: 'play-board-move' }));
    await screen.findByText('Você venceu!');
    fireEvent.click(screen.getByRole('button', { name: /Próximo exercício/ }));

    await screen.findByText('Segundo exercício da sessão.');
    const previousButton = screen.getByRole('button', { name: /Exercício anterior/ });
    expect(previousButton).toBeTruthy();

    fireEvent.click(previousButton);
    expect(await screen.findByText('Revisando um exercício já resolvido.')).toBeTruthy();
    expect(screen.getByText('Jogue o melhor lance para as brancas.')).toBeTruthy();
  });
});

describe('ExerciseTrainer book study context', () => {
  beforeEach(() => {
    window.localStorage.setItem('xadrez.access_token', 'test-token');
    getExerciseMetrics.mockResolvedValue(emptyMetrics);
    const book: ExerciseTrainingView = {
      ...trainingView(),
      currentExercise: {
        ...trainingView().currentExercise!,
        answerFormat: 'free_text',
        positionType: 'text_only',
        fen: null,
        promptMd: 'Explique a ideia principal.',
      },
    };
    startExerciseTraining.mockResolvedValue(book);
    getExerciseStudy.mockResolvedValue({
      chapterNumber: 1,
      lessonTitle: 'Como aprender xadrez',
      moduleTitle: 'Fundamentos absolutos',
      sourcePages: [4, 5],
      teaching: [{ title: 'Objetivo', bodyMd: 'Reconheça o foco do capítulo.' }],
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows the verified study text before a book question', async () => {
    render(<ExerciseTrainer guided />);
    expect(await screen.findByText('Reconheça o foco do capítulo.')).toBeTruthy();
    expect(screen.getByText(/Estudo: Como aprender xadrez/)).toBeTruthy();
    expect(screen.getByText(/Fonte: páginas 4–5/)).toBeTruthy();
  });
});
