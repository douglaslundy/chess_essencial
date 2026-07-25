'use client';

import type { MercadoPagoSettings } from '@xadrez/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

export default function AdminMercadoPagoPage() {
  const [settings, setSettings] = useState<MercadoPagoSettings | null>(null);
  const [message, setMessage] = useState('Carregando configuração…');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre com uma conta de administrador.');
        return;
      }
      api
        .adminGetMercadoPagoSettings(token)
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
    const accessToken = String(data.get('accessToken') ?? '').trim();
    const webhookSecret = String(data.get('webhookSecret') ?? '').trim();
    setMessage('Salvando…');
    try {
      const updated = await api.adminUpdateMercadoPagoSettings(
        {
          accessToken: accessToken || null,
          environment: String(data.get('environment') ?? 'sandbox') as 'sandbox' | 'production',
          publicKey: String(data.get('publicKey') ?? '').trim() || null,
          webhookSecret: webhookSecret || null,
        },
        token,
      );
      setSettings(updated);
      setMessage('Configuração do Mercado Pago salva com sucesso.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar a configuração.',
      );
    }
  }

  async function testConnection() {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setTestMessage('Testando…');
    try {
      const result = await api.adminTestMercadoPagoConnection(token);
      setTestMessage(
        result.accountEmail
          ? `Conexão validada com a conta ${result.accountEmail}.`
          : 'Conexão validada.',
      );
    } catch (error) {
      setTestMessage(
        error instanceof Error ? error.message : 'Não foi possível validar as credenciais.',
      );
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Administração</span>
        <h1>Configuração de pagamento (Mercado Pago)</h1>
        <p>
          Chaves usadas para processar pagamentos. Salvar aqui não exige redeploy da plataforma.
        </p>
      </header>
      <p className={styles.status} role="status">
        {message}
      </p>
      {settings ? (
        <form className={styles.formCard} onSubmit={save}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Ambiente
              <select defaultValue={settings.environment} name="environment">
                <option value="sandbox">Sandbox (testes)</option>
                <option value="production">Produção</option>
              </select>
            </label>
            <label className={styles.field}>
              Public key
              <input defaultValue={settings.publicKey ?? ''} name="publicKey" />
            </label>
            <label className={styles.field}>
              Access token {settings.hasAccessToken ? '(deixe em branco para manter o atual)' : ''}
              <input name="accessToken" type="password" />
            </label>
            <label className={styles.field}>
              Webhook secret{' '}
              {settings.hasWebhookSecret ? '(deixe em branco para manter o atual)' : ''}
              <input name="webhookSecret" type="password" />
            </label>
          </div>
          <p>
            Configure a URL de notificação no painel do Mercado Pago apontando para{' '}
            <code>/v1/webhooks/mercado-pago</code> e cole aqui a chave secreta gerada lá — sem ela,
            as confirmações de pagamento são recusadas por segurança.
          </p>
          <button className={styles.primaryButton} type="submit">
            Salvar configuração
          </button>
        </form>
      ) : null}
      {settings ? (
        <section className={styles.formCard} aria-label="Testar conexão">
          <h2>Testar credenciais</h2>
          <p>Confirma junto ao Mercado Pago se o access token salvo é válido.</p>
          <button
            className={styles.primaryButton}
            onClick={() => void testConnection()}
            type="button"
          >
            Testar conexão
          </button>
          <p className={styles.status} role="status">
            {testMessage}
          </p>
        </section>
      ) : null}
    </main>
  );
}
