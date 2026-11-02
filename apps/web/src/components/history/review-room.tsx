'use client';

import type {
  GameAnalysis,
  GameAnalysisQualityCounts,
  GameMove,
  GameNarration,
  GameState,
  ReviewAnnotation,
} from '@xadrez/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  buildFallbackNarration,
  moveQualityLabel,
  narrationTextForPlayer,
  reviewMoveComment,
} from './move-narration';
import { reviewEligibility, type ReviewEligibility } from './review-eligibility';
import { CoachCallout } from '@/components/coach/coach-callout';
import { ChessBoard, type BoardOrientation } from '@/components/game/chess-board';
import { ReplayPlayer } from '@/components/game/replay-player';
import { Avatar } from '@/components/ui/avatar';
import { api, getStoredUserId } from '@/lib/api/client';
import { speakableSquares, toBrazilianSan } from '@/lib/notation';
import { usePieceTheme } from '@/lib/piece-theme';
import { speak, stopSpeaking } from '@/lib/speech';
import { useEntitlements } from '@/lib/subscriptions/use-entitlements';
import { useVoicePreference } from '@/lib/voice-preference';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const ANALYSIS_STATUS_LABEL: Record<GameAnalysis['status'], string> = {
  completed: 'Análise concluída.',
  failed: 'Não consegui concluir a análise desta partida.',
  pending: 'Ainda estou na fila para analisar esta partida — tente novamente em instantes.',
  processing: 'Estou analisando esta partida agora — tente novamente em instantes.',
};

const WELCOME = 'Olá, seja bem-vindo! Vamos revisar essa partida.';

const QUALITY_ROWS: Array<{ icon: string; key: keyof GameAnalysisQualityCounts; label: string }> = [
  { icon: '★', key: 'otimo', label: moveQualityLabel.otimo },
  { icon: '!', key: 'excelente', label: moveQualityLabel.excelente },
  { icon: '✓', key: 'bom', label: moveQualityLabel.bom },
  { icon: '?!', key: 'imprecisao', label: moveQualityLabel.imprecisao },
  { icon: '?', key: 'erro', label: moveQualityLabel.erro },
  { icon: '??', key: 'gafe', label: moveQualityLabel.gafe },
  { icon: '✕', key: 'missedWin', label: 'Oportunidades perdidas' },
];

/**
 * The AI voice can fail (not configured, quota, iOS autoplay block): the browser voice keeps
 * the Treinador audible, with a short notice instead of a silent error.
 */
function speakCoach(text: string, voiceName: string | null, notify: (message: string) => void) {
  speak(text, { interrupt: true, voiceName }).catch(() => {
    notify('A voz por IA falhou; o Treinador está usando a voz do navegador.');
    void speak(text, { interrupt: true }).catch(() => undefined);
  });
}

export interface FutureEvaluation {
  centipawns?: number;
  mateIn?: number;
  provider?: string;
}

export function ReviewRoom({ gameId }: { gameId: string }) {
  const { theme: pieceTheme } = usePieceTheme();
  const [state, setState] = useState<GameState | null>(null);
  const [moves, setMoves] = useState<GameMove[]>([]);
  const [annotations, setAnnotations] = useState<ReviewAnnotation[]>([]);
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [narration, setNarration] = useState<GameNarration | null>(null);
  const [ply, setPly] = useState(0);
  const [comment, setComment] = useState('');
  const [arrowFrom, setArrowFrom] = useState('');
  const [arrowTo, setArrowTo] = useState('');
  const [message, setMessage] = useState('Carregando revisão…');
  const [coachMessage, setCoachMessage] = useState('');
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [view, setView] = useState<'summary' | 'moves'>('summary');
  const [orientation, setOrientation] = useState<BoardOrientation>('white');
  const [panelTab, setPanelTab] = useState<'moves' | 'notes'>('moves');
  const { hasFeature } = useEntitlements();
  const analysisAllowed = hasFeature('game_analysis_access');

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      queueMicrotask(() => setMessage('Entre na sua conta para revisar a partida.'));
      return;
    }
    api
      .getGame(gameId, token)
      .then(async (nextState) => {
        const nextEligibility = reviewEligibility(nextState);
        setState(nextState);
        setEligibility(nextEligibility);
        if (!nextEligibility.available) {
          setMessage(nextEligibility.reason);
          return;
        }
        const [nextMoves, nextAnnotations, nextAnalysis, nextNarration] = await Promise.all([
          api.getMoves(gameId, token),
          api.getReviewAnnotations(gameId, token),
          api.getGameAnalysis(gameId, token).catch(() => null),
          api.getGameNarration(gameId, token).catch(() => null),
        ]);
        setMoves(nextMoves);
        setAnnotations(nextAnnotations);
        setAnalysis(nextAnalysis);
        setNarration(nextNarration);
        setPly(0);
        const myPlayer = nextState.players.find((player) => player.userId === getStoredUserId());
        if (myPlayer) setOrientation(myPlayer.color);
        setMessage('');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar revisão.'),
      );
  }, [gameId]);

  const myUserId = getStoredUserId();
  const myColor = state?.players.find((player) => player.userId === myUserId)?.color ?? null;
  const opponentColor = myColor === 'white' ? 'black' : 'white';
  const opponentName =
    state?.players.find((player) => player.color === opponentColor)?.displayName || 'Bot';
  const currentMoveAnalysis = analysis?.moves.find((move) => move.ply === ply) ?? null;
  const learningSignals = analysis
    ? Array.from(new Map(analysis.errorSignals.map((signal) => [signal.skillKey, signal])).values())
    : [];
  const avatarForColor = (color: 'white' | 'black') =>
    state?.players.find((player) => player.color === color)?.avatarUrl ?? null;
  const summaryColumns: Array<{
    avatarUrl: string | null;
    color: 'white' | 'black';
    label: string;
  }> = myColor
    ? [
        { avatarUrl: avatarForColor(myColor), color: myColor, label: 'Eu' },
        { avatarUrl: avatarForColor(opponentColor), color: opponentColor, label: opponentName },
      ]
    : [
        { avatarUrl: avatarForColor('white'), color: 'white', label: 'Brancas' },
        { avatarUrl: avatarForColor('black'), color: 'black', label: 'Pretas' },
      ];
  // Prefer the AI-generated narration once it's ready; otherwise fall back
  // to a free, offline summary built from the same engine analysis, so
  // "Resumo narrado" is available even with no narration AI configured.
  const effectiveNarration =
    narration?.status === 'completed' && narration.summary
      ? narration
      : analysis
        ? buildFallbackNarration(analysis, myColor)
        : null;

  const { voiceName, reviewNarrationEnabled, setReviewNarrationEnabled } = useVoicePreference();
  const moveComment = reviewMoveComment(
    ply ? (moves[ply - 1] ?? null) : null,
    currentMoveAnalysis,
    effectiveNarration?.keyMoments ?? [],
    myColor,
  );
  const coachText = ply === 0 ? WELCOME : moveComment;

  // Navigating with the buttons is the user gesture iOS needs (speech.ts unlocks on first tap).
  useEffect(() => {
    if (view !== 'moves' || !reviewNarrationEnabled || !coachText) return;
    speakCoach(coachText, voiceName, setMessage);
  }, [coachText, ply, reviewNarrationEnabled, view, voiceName]);

  useEffect(() => {
    if (!reviewNarrationEnabled) stopSpeaking();
  }, [reviewNarrationEnabled]);

  function startMoveByMoveReview() {
    setPly(0);
    setView('moves');
  }

  const current = annotations.find((item) => item.ply === ply);
  useEffect(() => {
    queueMicrotask(() => {
      setComment(current?.comment ?? '');
      setArrowFrom(current?.arrows[0]?.from ?? '');
      setArrowTo(current?.arrows[0]?.to ?? '');
    });
  }, [current, ply]);

  const fen = useMemo(() => {
    if (!moves.length) return state?.currentFen ?? INITIAL_FEN;
    if (ply === 0) return moves[0]?.fenBefore ?? state?.currentFen ?? INITIAL_FEN;
    return moves[Math.min(ply, moves.length) - 1]?.fenAfter ?? state?.currentFen ?? INITIAL_FEN;
  }, [moves, ply, state]);

  async function save() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    try {
      const saved = await api.saveReviewAnnotation(
        gameId,
        {
          arrows: arrowFrom && arrowTo ? [{ color: 'gold', from: arrowFrom, to: arrowTo }] : [],
          comment: comment.trim() || null,
          highlights: [],
          ply,
        },
        token,
      );
      setAnnotations((items) => [...items.filter((item) => item.ply !== ply), saved]);
      setMessage('Anotação salva.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao salvar anotação.');
    }
  }

  async function exportPgn() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const pgn = await api.getPgn(gameId, token);
    const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = gameId + '.pgn';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (eligibility && !eligibility.available) {
    return (
      <main className="reviewUnavailablePage">
        <section className="reviewUnavailableCard" aria-labelledby="review-unavailable-title">
          <span className="eyebrow">Histórico da partida</span>
          <h1 id="review-unavailable-title">Revisão indisponível</h1>
          <p>{eligibility.reason}</p>
          <Link href="/app/partidas">Voltar ao histórico</Link>
        </section>
      </main>
    );
  }

  if (view === 'summary') {
    return (
      <main className="reviewSummaryPage">
        <header className="reviewHeader">
          <div>
            <span className="eyebrow">Revisão</span>
            <h1>Resumo da partida</h1>
          </div>
          <Link href="/app/partidas">Voltar ao histórico</Link>
        </header>
        <p role="status">
          {message ||
            (!analysisAllowed
              ? 'A análise com o motor de xadrez não está incluída no seu plano atual.'
              : ANALYSIS_STATUS_LABEL[analysis?.status ?? 'pending'])}
        </p>
        {analysis?.summary ? (
          // One table: label | first player | quality icon | second player.
          <table className="reviewQualityTable">
            <thead>
              <tr>
                <th scope="col">Jogadores</th>
                <th scope="col">
                  <span className="reviewPlayerName">{summaryColumns[0]!.label}</span>
                  <Avatar
                    avatarUrl={summaryColumns[0]!.avatarUrl}
                    name={summaryColumns[0]!.label}
                  />
                </th>
                <td aria-hidden="true" />
                <th scope="col">
                  <span className="reviewPlayerName">{summaryColumns[1]!.label}</span>
                  <Avatar
                    avatarUrl={summaryColumns[1]!.avatarUrl}
                    name={summaryColumns[1]!.label}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {QUALITY_ROWS.map((row) => (
                <tr data-quality={row.key} key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td>{analysis.summary![summaryColumns[0]!.color][row.key]}</td>
                  <td>
                    <span aria-hidden="true" className="qualityBadge">
                      {row.icon}
                    </span>
                  </td>
                  <td>{analysis.summary![summaryColumns[1]!.color][row.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {learningSignals.length ? (
          <section className="reviewNarration" aria-labelledby="learning-signals-title">
            <div className="reviewNarrationHeader">
              <h2 id="learning-signals-title">Próximos passos de estudo</h2>
            </div>
            {learningSignals.map((signal) => (
              <details className="reviewNarrationSection" key={signal.id}>
                <summary>
                  Lance {signal.ply}: {signal.skillLabel}
                </summary>
                <p>
                  {signal.signalType === 'missed_opportunity'
                    ? 'Eu identifiquei uma oportunidade concreta que não foi aproveitada.'
                    : 'Eu medi uma perda relevante de avaliação após este lance.'}
                </p>
                {signal.recommendation ? (
                  <p>
                    <Link href="/app/desafios">
                      Praticar: {signal.recommendation.exerciseTitle}
                    </Link>
                    {' — '}
                    {signal.recommendation.rationale}
                  </p>
                ) : (
                  <p>Ainda não há um exercício publicado compatível com esta habilidade.</p>
                )}
              </details>
            ))}
          </section>
        ) : null}
        {effectiveNarration?.summary ? (
          <section className="reviewNarration" aria-label="Resumo narrado">
            <div className="reviewNarrationHeader">
              <h2>Resumo narrado</h2>
              <button
                onClick={() => {
                  const text = narrationTextForPlayer(effectiveNarration, myColor);
                  setCoachMessage(text);
                  speakCoach(speakableSquares(text), voiceName, setMessage);
                }}
                type="button"
              >
                🔊 Ouvir
              </button>
            </div>
            <CoachCallout message={coachMessage || effectiveNarration.summary} />
            {effectiveNarration.keyMoments.length > 0 ? (
              <details className="reviewNarrationSection">
                <summary>Momentos-chave ({effectiveNarration.keyMoments.length})</summary>
                {effectiveNarration.keyMoments.map((moment) => (
                  <p key={moment.ply}>
                    <strong>
                      Lance {moment.ply} ({toBrazilianSan(moment.san)}):
                    </strong>{' '}
                    {moment.narrative}
                  </p>
                ))}
              </details>
            ) : null}
            {effectiveNarration.patterns.length > 0 ? (
              <details className="reviewNarrationSection">
                <summary>Padrões observados ({effectiveNarration.patterns.length})</summary>
                <ul>
                  {effectiveNarration.patterns.map((pattern) => (
                    <li key={pattern}>{pattern}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {effectiveNarration.studyPlan.length > 0 ? (
              <details className="reviewNarrationSection">
                <summary>Plano de estudo ({effectiveNarration.studyPlan.length})</summary>
                <ul>
                  {effectiveNarration.studyPlan.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}
        <button
          className="primaryButton"
          disabled={moves.length === 0}
          onClick={startMoveByMoveReview}
          type="button"
        >
          Iniciar revisão lance a lance
        </button>
      </main>
    );
  }

  const topColor = orientation === 'white' ? 'black' : 'white';
  const sideToMove = ply % 2 === 0 ? 'white' : 'black';
  const playerCard = (color: 'white' | 'black') => {
    const player = state?.players.find((candidate) => candidate.color === color);
    return (
      <ReplayPlayer
        active={ply > 0 && sideToMove === color}
        avatarUrl={player?.avatarUrl ?? null}
        label={`${color === 'white' ? 'Brancas' : 'Pretas'}${player ? ` · ${player.ratingBefore} XE` : ''}`}
        name={player?.displayName || (color === 'white' ? 'Brancas' : 'Pretas')}
      />
    );
  };
  const rowCount = Math.ceil(moves.length / 2);

  // Same skeleton as the game page (gamePage/boardStage/historyControls/movesPanel), so the
  // review inherits its board size, compact controls and in-frame panels.
  return (
    <main className="gamePage">
      <aside className="playersColumn">
        {playerCard(topColor)}
        <div className="libraryGameInfo">
          <strong>Revisão lance a lance</strong>
          <span>
            Lance {ply}/{moves.length}
          </span>
          <button onClick={() => setView('summary')} type="button">
            ← Resumo
          </button>
          <button onClick={exportPgn} type="button">
            Exportar PGN
          </button>
        </div>
        {playerCard(orientation)}
      </aside>

      <section className="boardColumn" aria-label="Área do tabuleiro">
        {/* Treinador acima do tabuleiro, como na partida: o comentário fica à vista do lance. */}
        {coachText ? <CoachCallout message={coachText} /> : null}
        <div className="mobilePlayer">{playerCard(topColor)}</div>
        <div className="boardStage">
          <ChessBoard
            disabled
            fen={fen}
            lastMove={
              ply ? { from: moves[ply - 1]?.from ?? '', to: moves[ply - 1]?.to ?? '' } : undefined
            }
            onMove={() => undefined}
            orientation={orientation}
            pieceTheme={pieceTheme}
          />
          <div aria-label="Navegar pelos lances" className="historyControls" role="group">
            <button
              aria-label="Início"
              disabled={ply === 0}
              onClick={() => setPly(0)}
              type="button"
            >
              ⏮
            </button>
            <button
              aria-label="Lance anterior"
              disabled={ply === 0}
              onClick={() => setPly((value) => value - 1)}
              type="button"
            >
              ◀
            </button>
            <button
              aria-label="Próximo lance"
              disabled={ply >= moves.length}
              onClick={() => setPly((value) => value + 1)}
              type="button"
            >
              ▶
            </button>
            <button
              aria-label="Último lance"
              disabled={ply >= moves.length}
              onClick={() => setPly(moves.length)}
              type="button"
            >
              ⏭
            </button>
            <button
              aria-label={reviewNarrationEnabled ? 'Desligar narração' : 'Narrar lances por voz'}
              aria-pressed={reviewNarrationEnabled}
              onClick={() => setReviewNarrationEnabled(!reviewNarrationEnabled)}
              title="Narrar lances por voz"
              type="button"
            >
              {reviewNarrationEnabled ? '🔊' : '🔇'}
            </button>
            <button
              aria-label="Virar tabuleiro"
              onClick={() => setOrientation((current) => (current === 'white' ? 'black' : 'white'))}
              title="Virar tabuleiro"
              type="button"
            >
              ↻
            </button>
          </div>
        </div>
        <div className="mobilePlayer">{playerCard(orientation)}</div>
        {message ? (
          <p className="gameMessage" role="status">
            {message}
          </p>
        ) : null}
      </section>

      <aside className="movesPanel">
        <div className="panelTabs" role="tablist" aria-label="Revisão">
          <button
            aria-selected={panelTab === 'moves'}
            onClick={() => setPanelTab('moves')}
            role="tab"
            type="button"
          >
            Lances
          </button>
          <button
            aria-selected={panelTab === 'notes'}
            onClick={() => setPanelTab('notes')}
            role="tab"
            type="button"
          >
            Anotar
          </button>
        </div>
        {panelTab === 'moves' ? (
          <div className="moveList" aria-label="Lista de lances">
            {Array.from({ length: rowCount }, (_, index) => (
              <div className="moveRow" key={index}>
                <span>{index + 1}.</span>
                {[moves[index * 2], moves[index * 2 + 1]].map((move, column) =>
                  move ? (
                    <button
                      aria-current={move.ply === ply}
                      className="moveLink"
                      key={move.id}
                      onClick={() => setPly(move.ply)}
                      type="button"
                    >
                      {toBrazilianSan(move.san)}
                    </button>
                  ) : (
                    <strong key={column} />
                  ),
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="reviewNotes">
            <label>
              Comentário
              <textarea
                maxLength={2000}
                onChange={(event) => setComment(event.target.value)}
                value={comment}
              />
            </label>
            <div className="annotationFields">
              <label>
                Seta de
                <input
                  maxLength={2}
                  onChange={(event) => setArrowFrom(event.target.value.toLowerCase())}
                  placeholder="e2"
                  value={arrowFrom}
                />
              </label>
              <label>
                Para
                <input
                  maxLength={2}
                  onChange={(event) => setArrowTo(event.target.value.toLowerCase())}
                  placeholder="e4"
                  value={arrowTo}
                />
              </label>
            </div>
            <button className="libraryReviewButton" onClick={save} type="button">
              Salvar anotação
            </button>
          </div>
        )}
        <div className="connectionState">
          {analysis?.status !== 'completed'
            ? ANALYSIS_STATUS_LABEL[analysis?.status ?? 'pending']
            : moveComment
              ? 'Comentário do Treinador acima do tabuleiro.'
              : ply > 0
                ? 'Lance do adversário: sem narração do Treinador.'
                : 'Use as setas para avançar lance a lance.'}
        </div>
      </aside>
    </main>
  );
}
