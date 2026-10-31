'use client';

import { useState } from 'react';

import styles from '@/components/portal/portal-pages.module.css';
import { webEnv } from '@/env';

const CONFIRMATION = 'APAGAR-E-RESTAURAR';

interface RestoreReport {
  migration: string;
  rows: number;
  tables: number;
}

function authHeader(): Record<string, string> {
  const token = window.localStorage.getItem('xadrez.access_token');
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function problemMessage(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { detail?: string } | null;
  return body?.detail ?? `${fallback} (${response.status}).`;
}

export default function AdminBackupPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState('');

  async function download() {
    setBusy(true);
    setMessage('Gerando o backup…');
    try {
      const response = await fetch(`${webEnv.NEXT_PUBLIC_API_URL}/admin/backup`, {
        headers: authHeader(),
      });
      if (!response.ok) throw new Error(await problemMessage(response, 'Falha ao gerar o backup'));
      const blob = await response.blob();
      const name =
        /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ??
        'xadrez-backup.xebak';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Backup baixado: ${name} (${(blob.size / 1024 / 1024).toFixed(1)} MB).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao gerar o backup.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!file || confirmation !== CONFIRMATION) return;
    setBusy(true);
    setMessage('Restaurando… não feche esta página.');
    try {
      const response = await fetch(`${webEnv.NEXT_PUBLIC_API_URL}/admin/backup/restore`, {
        body: file,
        headers: {
          ...authHeader(),
          'content-type': 'application/octet-stream',
          'x-confirm-restore': CONFIRMATION,
        },
        method: 'POST',
      });
      if (!response.ok) throw new Error(await problemMessage(response, 'Falha ao restaurar'));
      const report = (await response.json()) as RestoreReport;
      setMessage(
        `Restauração concluída: ${report.tables} tabelas e ${report.rows.toLocaleString('pt-BR')} registros (versão ${report.migration}). Entre novamente se a sua sessão expirar.`,
      );
      setFile(null);
      setConfirmation('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao restaurar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <span>Administração</span>
        <h1>Backup e restauração</h1>
        <p>
          O backup reúne todos os dados da plataforma: usuários e perfis, partidas e lances,
          ratings, histórico, exercícios, desafios, biblioteca, revisões da IA, planos e
          configurações. Guarde o arquivo em local seguro: ele contém dados pessoais e senhas
          criptografadas.
        </p>
      </header>

      <section className={styles.card}>
        <h2>Fazer backup</h2>
        <p className={styles.helpText}>
          Gera e baixa um arquivo .xebak compactado. A plataforma continua funcionando durante o
          backup.
        </p>
        <button
          className={styles.primaryButton}
          disabled={busy}
          onClick={() => void download()}
          type="button"
        >
          Baixar backup agora
        </button>
      </section>

      <section className={styles.card}>
        <h2>Restaurar de um backup</h2>
        <p className={styles.helpText}>
          Substitui todos os dados atuais pelos do arquivo, numa única operação: se algo falhar,
          nada é alterado. O arquivo precisa ser da mesma versão do banco deste servidor. Faça um
          backup antes de restaurar.
        </p>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            Arquivo de backup (.xebak)
            <input
              accept=".xebak,application/gzip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <label className={styles.field}>
            Para confirmar, digite {CONFIRMATION}
            <input
              autoComplete="off"
              onChange={(event) => setConfirmation(event.target.value)}
              value={confirmation}
            />
          </label>
          <button
            className={styles.primaryButton}
            disabled={busy || !file || confirmation !== CONFIRMATION}
            onClick={() => void restore()}
            type="button"
          >
            Apagar dados atuais e restaurar
          </button>
        </div>
      </section>

      {message ? (
        <p className={styles.status} role="status">
          {message}
        </p>
      ) : null}
    </main>
  );
}
