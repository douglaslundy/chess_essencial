'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { TimeControlCode } from '@xadrez/contracts';

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
    setMessage('Procurando um adversário compatível…');
    try {
      const result = await api.joinQueue(selected, token);
      if (result.gameId) router.push(`/app/partida/${result.gameId}`);
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
          <h2>{status === 'searching' ? 'Buscando partida' : 'Pronto para jogar?'}</h2>
          <p>
            {message ||
              'Selecione um ritmo ranqueado e entre na fila. O servidor cria a partida quando encontrar um par.'}
          </p>
          {status === 'searching' ? (
            <button className="secondaryButton" onClick={cancel} type="button">
              Sair da fila
            </button>
          ) : (
            <button className="primaryButton" onClick={search} type="button">
              Buscar adversário
            </button>
          )}
          {status === 'searching' ? <div className="searchPulse" aria-hidden="true" /> : null}
        </aside>
      </section>
    </main>
  );
}
