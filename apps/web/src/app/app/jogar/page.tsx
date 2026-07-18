'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { BotDifficulty, PlayerColorPreference, TimeControlCode } from '@xadrez/contracts';

import { api } from '@/lib/api/client';

const controls: Array<{ code: TimeControlCode; label: string; detail: string; pool: string }> = [
  { code: 'bullet-1-0', label: '1 + 0', detail: 'Um minuto', pool: 'Bullet' },
  { code: 'bullet-2-1', label: '2 + 1', detail: 'Incremento de 1s', pool: 'Bullet' },
  { code: 'blitz-3-0', label: '3 + 0', detail: 'Três minutos', pool: 'Blitz' },
  { code: 'blitz-3-2', label: '3 + 2', detail: 'Incremento de 2s', pool: 'Blitz' },
  { code: 'rapid-10-0', label: '10 + 0', detail: 'Dez minutos', pool: 'Rápida' },
  { code: 'rapid-15-10', label: '15 + 10', detail: 'Incremento de 10s', pool: 'Rápida' },
  { code: 'classical-30-0', label: '30 + 0', detail: 'Trinta minutos', pool: 'Clássica' },
];

export default function PlayPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<TimeControlCode>('rapid-10-0');
  const [opponent, setOpponent] = useState<'human' | 'bot'>('human');
  const [difficulty, setDifficulty] = useState<BotDifficulty>('matched');
  const [playerColor, setPlayerColor] = useState<PlayerColorPreference>('random');
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function search() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setStatus('error');
      setMessage('Entre na sua conta para buscar uma partida.');
      return;
    }
    setStatus('searching');
    setMessage(
      opponent === 'bot'
        ? 'Preparando um adversário controlado pelo servidor…'
        : 'Procurando um adversário compatível; se ninguém estiver disponível, o bot entra na partida…',
    );
    try {
      const options = {
        botDifficulty: difficulty,
        playerColor,
        timeControlCode: selected,
      };
      const result =
        opponent === 'bot'
          ? await api.createBotGame(options, token)
          : await api.joinQueue({ ...options, fallbackToBot: true }, token);
      const gameId = 'id' in result ? result.id : result.gameId;
      if (gameId) router.push(`/app/partida/${gameId}`);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível entrar na fila.');
    }
  }

  async function cancel() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (token) await api.leaveQueue(token).catch(() => undefined);
    setStatus('idle');
    setMessage('');
  }

  return (
    <main className="playPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Pareamento</p>
          <h1>Escolha o seu ritmo.</h1>
        </div>
        <p>O rating Xadrez Essencial é separado por pool de tempo.</p>
      </header>
      <section className="playGrid">
        <div className="botPreferences">
          <fieldset>
            <legend>Adversário</legend>
            <label>
              <input
                checked={opponent === 'human'}
                name="opponent"
                onChange={() => setOpponent('human')}
                type="radio"
              />
              Buscar pessoa; usar bot se ninguém estiver online
            </label>
            <label>
              <input
                checked={opponent === 'bot'}
                name="opponent"
                onChange={() => setOpponent('bot')}
                type="radio"
              />
              Jogar diretamente contra o bot
            </label>
          </fieldset>
          <label>
            Dificuldade do bot
            <select
              onChange={(event) => setDifficulty(event.target.value as BotDifficulty)}
              value={difficulty}
            >
              <option value="matched">Mesmo rating que o meu</option>
              <option value="beginner">Iniciante · 800</option>
              <option value="intermediate">Intermediário · 1200</option>
              <option value="advanced">Avançado · 1600</option>
              <option value="expert">Especialista · 2000</option>
            </select>
          </label>
          <label>
            Quero jogar com
            <select
              onChange={(event) => setPlayerColor(event.target.value as PlayerColorPreference)}
              value={playerColor}
            >
              <option value="random">Cor aleatória</option>
              <option value="white">Peças brancas</option>
              <option value="black">Peças pretas</option>
            </select>
          </label>
          <p>Partidas contra o bot não alteram o rating Xadrez Essencial.</p>
        </div>
        <div className="timeControls" role="radiogroup" aria-label="Controle de tempo">
          {controls.map((control) => (
            <button
              aria-checked={selected === control.code}
              className={selected === control.code ? 'timeCard selectedTime' : 'timeCard'}
              key={control.code}
              onClick={() => setSelected(control.code)}
              role="radio"
              type="button"
            >
              <span>{control.pool}</span>
              <strong>{control.label}</strong>
              <small>{control.detail}</small>
            </button>
          ))}
        </div>
        <aside className="queueCard">
          <span className="queueIcon" aria-hidden="true">
            ♞
          </span>
          <h2>{status === 'searching' ? 'Preparando partida' : 'Pronto para jogar?'}</h2>
          <p>
            {message ||
              'Escolha o adversário, a dificuldade de fallback, sua cor e o ritmo da partida.'}
          </p>
          {status === 'searching' ? (
            <button className="secondaryButton" onClick={cancel} type="button">
              Sair da fila
            </button>
          ) : (
            <button className="primaryButton" onClick={search} type="button">
              {opponent === 'bot' ? 'Jogar contra o bot' : 'Buscar adversário'}
            </button>
          )}
          {status === 'searching' ? <div className="searchPulse" aria-hidden="true" /> : null}
        </aside>
      </section>
    </main>
  );
}
