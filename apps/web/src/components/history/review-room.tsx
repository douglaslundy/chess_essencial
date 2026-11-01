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

const QUALITY_ROWS: Array<{ key: keyof GameAnalysisQualityCounts; label: string }> = [
  { key: 'otimo', label: moveQualityLabel.otimo },
  { key: 'excelente', label: moveQualityLabel.excelente },
  { key: 'bom', label: moveQualityLabel.bom },
  { key: 'imprecisao', label: moveQualityLabel.imprecisao },
  { key: 'erro', label: moveQualityLabel.erro },
  { key: 'gafe', label: moveQualityLabel.gafe },
  { key: 'missedWin', label: 'Oportunidades perdidas' },
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
          <section className="reviewSummaryColumns">
            {summaryColumns.map(({ avatarUrl, color, label }) => (
              <div className="reviewSummaryColumn" key={color}>
                <h2>
                  <Avatar avatarUrl={avatarUrl} name={label} />
                  {label}
                </h2>
                <div className="reviewSummaryRows">
                  {QUALITY_ROWS.map((row) => (
                    <div className="reviewSummaryRow" key={row.key}>
                      <span>{row.label}</span>
                      <strong>{analysis.summary![color][row.key]}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
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

  return (
    <main className="reviewPage">
      <header className="reviewHeader">
        <div>
          <span className="eyebrow">Revisão</span>
          <h1>Partida lance a lance</h1>
        </div>
        <div className="reviewHeaderActions">
          <button onClick={() => setView('summary')} type="button">
            Voltar ao resumo
          </button>
          <button
            onClick={() => setOrientation((current) => (current === 'white' ? 'black' : 'white'))}
            type="button"
          >
            Virar tabuleiro
          </button>
          <button onClick={exportPgn} type="button">
            Exportar PGN
          </button>
        </div>
      </header>
      <section className="reviewBoard">
        {/* Treinador acima do tabuleiro, como na partida: o comentário fica à vista do lance. */}
        {coachText ? <CoachCallout message={coachText} /> : null}
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
        <div aria-label="Navegar pelos lances" className="reviewNavigation" role="group">
          <button aria-label="Início" disabled={ply === 0} onClick={() => setPly(0)} type="button">
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
          <span>
            Ply {ply}/{moves.length}
          </span>
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
        </div>
        {arrowFrom && arrowTo ? (
          <p className="annotationPreview">
            Seta: {arrowFrom} → {arrowTo}
          </p>
        ) : null}
      </section>
      <aside className="reviewPanel">
        <div className="reviewMoves">
          {moves.map((move) => (
            <button
              className={move.ply === ply ? 'activePly' : ''}
              key={move.id}
              onClick={() => setPly(move.ply)}
              type="button"
            >
              {move.ply}. {toBrazilianSan(move.san)}
            </button>
          ))}
        </div>
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
        <button onClick={save} type="button">
          Salvar anotação
        </button>
        <p role="status">{message}</p>
        <section className="futureEvaluation" aria-label="Minha avaliação">
          <strong>Minha avaliação</strong>
          <label className="voiceToggle">
            <input
              checked={reviewNarrationEnabled}
              onChange={(event) => setReviewNarrationEnabled(event.target.checked)}
              type="checkbox"
            />
            Narrar lances por voz
          </label>
          {moveComment ? (
            <span>Comentário do Treinador acima do tabuleiro.</span>
          ) : ply > 0 ? (
            <span>Lance do adversário: sem narração do Treinador.</span>
          ) : null}
          {analysis?.status !== 'completed' ? (
            <span>{ANALYSIS_STATUS_LABEL[analysis?.status ?? 'pending']}</span>
          ) : null}
        </section>
      </aside>
    </main>
  );
}
