'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { BotDifficulty, PlayerColorPreference, TimeControlCode } from '@xadrez/contracts';

import { GroupedListbox } from '@/components/ui/grouped-listbox';
import { api } from '@/lib/api/client';
import { useEntitlements } from '@/lib/subscriptions/use-entitlements';

const controls: Array<{ code: TimeControlCode; label: string; detail: string; pool: string }> = [
  { code: 'bullet-1-0', label: '1 + 0', detail: 'Ultrarrápida · 1 min', pool: 'Bullet' },
  { code: 'bullet-2-1', label: '2 + 1', detail: 'Ultrarrápida · +1s/lance', pool: 'Bullet' },
  { code: 'blitz-3-0', label: '3 + 0', detail: 'Muito rápida · 3 min', pool: 'Blitz' },
  { code: 'blitz-3-2', label: '3 + 2', detail: 'Muito rápida · +2s/lance', pool: 'Blitz' },
  { code: 'rapid-10-0', label: '10 + 0', detail: 'Mais tempo para pensar', pool: 'Rápida' },
  { code: 'rapid-15-10', label: '15 + 10', detail: 'Reflexiva · +10s/lance', pool: 'Rápida' },
  {
    code: 'classical-30-0',
    label: '30 + 0',
    detail: 'Longa e profunda · 30 min',
    pool: 'Clássica',
  },
  {
    code: 'untimed',
    label: 'Sem tempo',
    detail: 'Jogo livre, sem relógio · não ranqueado',
    pool: 'Livre',
  },
];

const controlPools = Array.from(
  controls.reduce((pools, control) => {
    const group = pools.get(control.pool) ?? [];
    group.push({ detail: control.detail, label: control.label, value: control.code });
    pools.set(control.pool, group);
    return pools;
  }, new Map<string, Array<{ detail: string; label: string; value: TimeControlCode }>>()),
).map(([label, options]) => ({ label, options }));

export default function PlayPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<TimeControlCode>('untimed');
  const [opponent, setOpponent] = useState<'human' | 'bot' | 'coach'>('human');
  const [difficulty, setDifficulty] = useState<BotDifficulty>('matched');
  const [playerColor, setPlayerColor] = useState<PlayerColorPreference>('random');
  const [status, setStatus] = useState<'idle' | 'searching' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const { hasFeature } = useEntitlements();
  const coachModeAllowed = hasFeature('coach_mode_access');

  async function search() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setStatus('error');
      setMessage('Entre na sua conta para buscar uma partida.');
      return;
    }
    setStatus('searching');
    setMessage(
      opponent === 'coach'
        ? 'Preparando o Treinador no seu nível…'
        : opponent === 'bot'
          ? 'Preparando um adversário controlado pelo servidor…'
          : 'Verificando se existe um adversário compatível online…',
    );
    try {
      const result =
        opponent === 'bot' || opponent === 'coach'
          ? await api.createBotGame(
              {
                botDifficulty: opponent === 'coach' ? 'matched' : difficulty,
                coachMode: opponent === 'coach',
                playerColor,
                timeControlCode: selected,
              },
              token,
            )
          : await api.joinQueue(
              {
                botDifficulty: 'matched',
                fallbackToBot: false,
                playerColor: 'random',
                timeControlCode: selected,
              },
              token,
            );
      const gameId = 'id' in result ? result.id : result.gameId;
      if (gameId) router.push(`/app/partida/${gameId}`);
      else {
        await api.leaveQueue(token);
        setStatus('idle');
        setMessage(
          'Nenhum adversário online foi encontrado agora. Tente novamente ou escolha jogar contra o bot.',
        );
      }
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
          <label>
            Adversário
            <select
              onChange={(event) => setOpponent(event.target.value as 'human' | 'bot' | 'coach')}
              value={opponent}
            >
              <option value="human">Buscar adversário online</option>
              <option value="bot">Jogar contra o bot</option>
              <option disabled={!coachModeAllowed} value="coach">
                Treinador (dicas e avisos){coachModeAllowed ? '' : ' · indisponível no seu plano'}
              </option>
            </select>
          </label>
          {opponent === 'bot' ? (
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
          ) : null}
          {opponent === 'bot' || opponent === 'coach' ? (
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
          ) : null}
          {opponent === 'coach' ? (
            <p>
              O bot do Treinador sempre joga no seu rating atual, avisa antes de um lance muito ruim
              (com opção de escolher outro) e pode sugerir o melhor lance, se você ativar em Meus
              dados. Partidas do Treinador nunca alteram o rating Xadrez Essencial.
            </p>
          ) : opponent === 'bot' ? (
            <p>Partidas contra o bot não alteram o rating Xadrez Essencial.</p>
          ) : (
            <p>A busca procura somente outra pessoa. O bot nunca será iniciado automaticamente.</p>
          )}
        </div>
        <div className="timeControls">
          <span className="timeControlsLabel">Controle de tempo</span>
          <GroupedListbox
            ariaLabel="Controle de tempo"
            groups={controlPools}
            onChange={setSelected}
            value={selected}
          />
        </div>
        <aside className="queueCard">
          <span className="queueIcon" aria-hidden="true">
            ♞
          </span>
          <h2>{status === 'searching' ? 'Preparando partida' : 'Pronto para jogar?'}</h2>
          <p>
            {message ||
              'Escolha entre uma pessoa online ou o bot, depois selecione o ritmo da partida.'}
          </p>
          {status === 'searching' ? (
            <button className="secondaryButton" onClick={cancel} type="button">
              Sair da fila
            </button>
          ) : (
            <button className="primaryButton" onClick={search} type="button">
              {opponent === 'coach'
                ? 'Jogar com o Treinador'
                : opponent === 'bot'
                  ? 'Jogar contra o bot'
                  : 'Buscar adversário'}
            </button>
          )}
          {status === 'searching' ? <div className="searchPulse" aria-hidden="true" /> : null}
        </aside>
      </section>
    </main>
  );
}
