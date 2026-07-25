'use client';

import type { AssistedGameSettings } from '@xadrez/contracts';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

export default function AdminFeaturesPage() {
  const [settings, setSettings] = useState<AssistedGameSettings | null>(null);
  const [message, setMessage] = useState('Carregando configuração…');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre com uma conta de administrador.');
        return;
      }
      api
        .adminGetAssistedGameSettings(token)
        .then((value) => {
          setSettings(value);
          setMessage('');
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : 'Falha ao carregar configuração.'),
        );
    });
  }, []);

  async function toggle(enabled: boolean) {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setSettings((current) => (current ? { ...current, enabled } : current));
    try {
      setSettings(await api.adminUpdateAssistedGameSettings({ enabled }, token));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Administração</span>
        <h1>Recursos experimentais</h1>
        <p>Ativar ou desativar recursos ainda em avaliação, sem precisar de um novo deploy.</p>
      </header>
      <p className={styles.status} role="status">
        {message}
      </p>
      {settings ? (
        <section className={styles.formCard} aria-label="Partida assistida">
          <h2>Partida assistida</h2>
          <p>
            Quando ativado, o tabuleiro de demonstração ganha um botão para o usuário escolher uma
            cor e jogar as duas, recebendo sugestões do Treinador apenas para a cor escolhida.
          </p>
          <label className={styles.checkbox}>
            <input
              checked={settings.enabled}
              onChange={(event) => void toggle(event.target.checked)}
              type="checkbox"
            />{' '}
            Disponibilizar o botão &quot;Partida assistida&quot;
          </label>
        </section>
      ) : null}
    </main>
  );
}
