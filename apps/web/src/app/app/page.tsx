'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

export default function DashboardPage() {
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const query = new URLSearchParams({ limit: '1', page: '1', status: 'active' });
    api
      .getHistory(query, token)
      .then((value) => setActiveGameId(value.items[0]?.id ?? null))
      .catch(() => setActiveGameId(null));
  }, []);

  return (
    <main className="dashboardPage">
      <p className="eyebrow">Área de jogo</p>
      <h1>Seu próximo lance começa aqui.</h1>
      <p className="lead">
        Encontre uma partida no seu ritmo ou volte para uma partida em andamento.
      </p>
      <div className="dashboardCards">
        {activeGameId ? (
          <Link className="primaryCard" href={'/app/partida/' + activeGameId}>
            <span>Partida em andamento</span>
            <strong>Continuar partida</strong>
            <small>Retome de onde parou — o servidor guarda o tabuleiro e o relógio.</small>
          </Link>
        ) : (
          <Link className="primaryCard" href="/app/jogar">
            <span>Partida rápida</span>
            <strong>Entrar na fila</strong>
            <small>O pareamento considera rating e ritmo.</small>
          </Link>
        )}
        <Link className="secondaryCard" href="/app/partida/demo">
          <span>Tabuleiro</span>
          <strong>Visualizar interface</strong>
          <small>Explore o tabuleiro responsivo em modo demonstração.</small>
        </Link>
      </div>
    </main>
  );
}
