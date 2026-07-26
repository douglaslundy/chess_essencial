'use client';

import type { NarrationAiSettings } from '@xadrez/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

export default function AdminNarrationAiPage() {
  const [settings, setSettings] = useState<NarrationAiSettings | null>(null);
  const [message, setMessage] = useState('Carregando configuração…');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre com uma conta de administrador.');
        return;
      }
      api
        .adminGetNarrationAiSettings(token)
        .then((value) => {
          setSettings(value);
          setMessage('');
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : 'Falha ao carregar configuração.'),
        );
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    const data = new FormData(event.currentTarget);
    const apiKey = String(data.get('apiKey') ?? '').trim();
    setMessage('Salvando…');
    try {
      const updated = await api.adminUpdateNarrationAiSettings(
        {
          apiKey: apiKey || null,
          model: String(data.get('model') ?? '').trim(),
          provider: 'anthropic',
        },
        token,
      );
      setSettings(updated);
      setMessage('Configuração salva com sucesso.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar a configuração.',
      );
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Administração</span>
        <h1>Narração por IA (revisão pós-partida)</h1>
        <p>
          Chave de API usada para gerar a narração falada da revisão pós-partida (resumo, momentos-
          chave, padrões e plano de estudo). Sem uma chave configurada, essa narração simplesmente
          não é gerada — o resto da revisão continua funcionando normalmente.
        </p>
      </header>
      <p className={styles.status} role="status">
        {message}
      </p>
      {settings ? (
        <form className={styles.formCard} onSubmit={save}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Modelo
              <input
                defaultValue={settings.model ?? 'claude-sonnet-5'}
                name="model"
                placeholder="claude-sonnet-5"
                required
              />
            </label>
            <label className={styles.field}>
              Chave de API (Anthropic){' '}
              {settings.hasApiKey ? '(deixe em branco para manter a atual)' : ''}
              <input name="apiKey" type="password" />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit">
            Salvar configuração
          </button>
        </form>
      ) : null}
    </main>
  );
}
