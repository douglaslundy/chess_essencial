'use client';

import type { SmtpSettings } from '@xadrez/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';
import styles from '@/components/portal/portal-pages.module.css';

export default function AdminSmtpPage() {
  const [settings, setSettings] = useState<SmtpSettings | null>(null);
  const [message, setMessage] = useState('Carregando configuração…');
  const [testEmail, setTestEmail] = useState('');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    queueMicrotask(() => {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (!token) {
        setMessage('Entre com uma conta de administrador.');
        return;
      }
      api
        .adminGetSmtpSettings(token)
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
    const password = String(data.get('password') ?? '').trim();
    setMessage('Salvando…');
    try {
      const updated = await api.adminUpdateSmtpSettings(
        {
          fromAddress: String(data.get('fromAddress') ?? '').trim(),
          fromName: String(data.get('fromName') ?? '').trim(),
          host: String(data.get('host') ?? '').trim(),
          password: password || null,
          port: Number(data.get('port')),
          secure: data.get('secure') === 'on',
          username: String(data.get('username') ?? '').trim() || null,
        },
        token,
      );
      setSettings(updated);
      setMessage('Configuração de SMTP salva com sucesso.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar a configuração.',
      );
    }
  }

  async function sendTestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setTestMessage('Enviando…');
    try {
      await api.adminSendSmtpTestEmail({ toEmail: testEmail }, token);
      setTestMessage('E-mail de teste enviado com sucesso.');
    } catch (error) {
      setTestMessage(
        error instanceof Error ? error.message : 'Não foi possível enviar o e-mail de teste.',
      );
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Administração</span>
        <h1>Configuração de SMTP</h1>
        <p>Defina o servidor usado para enviar e-mails de verificação e redefinição de senha.</p>
      </header>
      <p className={styles.status} role="status">
        {message}
      </p>
      {settings ? (
        <form className={styles.formCard} onSubmit={save}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Servidor (host)
              <input defaultValue={settings.host ?? ''} name="host" required />
            </label>
            <label className={styles.field}>
              Porta
              <input
                defaultValue={settings.port ?? 587}
                max={65535}
                min={1}
                name="port"
                required
                type="number"
              />
            </label>
            <label className={styles.field}>
              Usuário
              <input defaultValue={settings.username ?? ''} name="username" />
            </label>
            <label className={styles.field}>
              Senha {settings.hasPassword ? '(deixe em branco para manter a atual)' : ''}
              <input name="password" type="password" />
            </label>
            <label className={styles.field}>
              E-mail remetente
              <input
                defaultValue={settings.fromAddress ?? ''}
                name="fromAddress"
                required
                type="email"
              />
            </label>
            <label className={styles.field}>
              Nome do remetente
              <input defaultValue={settings.fromName ?? ''} name="fromName" required />
            </label>
          </div>
          <label className={styles.checkbox}>
            <input defaultChecked={settings.secure} name="secure" type="checkbox" /> Conexão segura
            (TLS/SSL implícito)
          </label>
          <button className={styles.primaryButton} type="submit">
            Salvar configuração
          </button>
        </form>
      ) : null}
      {settings ? (
        <section className={styles.formCard} aria-label="Enviar e-mail de teste">
          <h2>Testar envio</h2>
          <form onSubmit={sendTestEmail}>
            <label className={styles.field}>
              Enviar e-mail de teste para
              <input
                onChange={(event) => setTestEmail(event.target.value)}
                required
                type="email"
                value={testEmail}
              />
            </label>
            <button className={styles.primaryButton} type="submit">
              Enviar teste
            </button>
          </form>
          <p className={styles.status} role="status">
            {testMessage}
          </p>
        </section>
      ) : null}
    </main>
  );
}
