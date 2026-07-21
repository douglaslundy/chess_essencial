'use client';

import type { GameMove, GameState, ReviewAnnotation } from '@xadrez/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { reviewEligibility, type ReviewEligibility } from './review-eligibility';
import { ChessBoard } from '@/components/game/chess-board';
import { api } from '@/lib/api/client';
import { usePieceTheme } from '@/lib/piece-theme';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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
  const [ply, setPly] = useState(0);
  const [comment, setComment] = useState('');
  const [highlight, setHighlight] = useState('');
  const [arrowFrom, setArrowFrom] = useState('');
  const [arrowTo, setArrowTo] = useState('');
  const [message, setMessage] = useState('Carregando revisão…');
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);

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
        const [nextMoves, nextAnnotations] = await Promise.all([
          api.getMoves(gameId, token),
          api.getReviewAnnotations(gameId, token),
        ]);
        setMoves(nextMoves);
        setAnnotations(nextAnnotations);
        setPly(nextMoves.length);
        setMessage('');
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Falha ao carregar revisão.'),
      );
  }, [gameId]);

  const current = annotations.find((item) => item.ply === ply);
  useEffect(() => {
    queueMicrotask(() => {
      setComment(current?.comment ?? '');
      setHighlight(current?.highlights[0]?.square ?? '');
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
          highlights: highlight ? [{ color: 'gold', square: highlight }] : [],
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

  return (
    <main className="reviewPage">
      <header className="reviewHeader">
        <div>
          <span className="eyebrow">Revisão</span>
          <h1>Partida lance a lance</h1>
        </div>
        <button onClick={exportPgn} type="button">
          Exportar PGN
        </button>
      </header>
      <section className="reviewBoard">
        <ChessBoard
          disabled
          fen={fen}
          lastMove={
            ply ? { from: moves[ply - 1]?.from ?? '', to: moves[ply - 1]?.to ?? '' } : undefined
          }
          onMove={() => undefined}
          orientation="white"
          pieceTheme={pieceTheme}
        />
        {highlight ? <p className="annotationPreview">Destaque: {highlight}</p> : null}
        {arrowFrom && arrowTo ? (
          <p className="annotationPreview">
            Seta: {arrowFrom} → {arrowTo}
          </p>
        ) : null}
      </section>
      <aside className="reviewPanel">
        <div className="reviewNavigation">
          <button disabled={ply === 0} onClick={() => setPly(0)} type="button">
            ⏮
          </button>
          <button disabled={ply === 0} onClick={() => setPly((value) => value - 1)} type="button">
            ◀
          </button>
          <span>
            Ply {ply}/{moves.length}
          </span>
          <button
            disabled={ply >= moves.length}
            onClick={() => setPly((value) => value + 1)}
            type="button"
          >
            ▶
          </button>
          <button disabled={ply >= moves.length} onClick={() => setPly(moves.length)} type="button">
            ⏭
          </button>
        </div>
        <code className="fenDisplay">{fen}</code>
        <div className="reviewMoves">
          {moves.map((move) => (
            <button
              className={move.ply === ply ? 'activePly' : ''}
              key={move.id}
              onClick={() => setPly(move.ply)}
              type="button"
            >
              {move.ply}. {move.san}
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
            Destaque
            <input
              maxLength={2}
              onChange={(event) => setHighlight(event.target.value.toLowerCase())}
              placeholder="e4"
              value={highlight}
            />
          </label>
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
        <section className="futureEvaluation" aria-label="Avaliação futura">
          <strong>Avaliação da engine</strong>
          <span>Interface reservada; nenhuma engine é executada nesta fase.</span>
        </section>
      </aside>
    </main>
  );
}
