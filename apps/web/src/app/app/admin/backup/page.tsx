'use client';

import { useState } from 'react';

import styles from '@/components/portal/portal-pages.module.css';
import { webEnv } from '@/env';
import { getRealtimeAccessToken } from '@/lib/api/client';

const CONFIRMATION = 'APAGAR-E-RESTAURAR';

interface RestoreReport {
  migration: string;
  rows: number;
  tables: number;
}

// The stored value is only a session marker; getRealtimeAccessToken returns (and refreshes) the real JWT.
async function authHeader(): Promise<Record<string, string>> {
  const token = await getRealtimeAccessToken();
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
  const [withVoices, setWithVoices] = useState(false);
  const [withFiles, setWithFiles] = useState(false);

  async function save(path: string, fallbackName: string): Promise<string> {
    const response = await fetch(`${webEnv.NEXT_PUBLIC_API_URL}${path}`, {
      credentials: 'include',
      headers: await authHeader(),
    });
    if (!response.ok) throw new Error(await problemMessage(response, 'Falha ao gerar o backup'));
    const blob = await response.blob();
    const name =
      /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ??
      fallbackName;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    return `${name} (${(blob.size / 1024 / 1024).toFixed(1)} MB)`;
  }

  async function download() {
    setBusy(true);
    setMessage('Gerando o backup…');
    try {
      const saved = [await save(`/admin/backup?voices=${withVoices}`, 'xadrez-backup.xebak')];
      if (withFiles) saved.push(await save('/admin/backup/files', 'xadrez-arquivos.xefiles'));
      setMessage(`Backup baixado: ${saved.join(' e ')}.`);
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
        credentials: 'include',
        headers: {
          ...(await authHeader()),
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

      <section className={`${styles.card} ${styles.cardStack}`}>
        <h2>Fazer backup</h2>
        <p className={styles.helpText}>
          Gera e baixa um arquivo .xebak compactado. A plataforma continua funcionando durante o
          backup.
        </p>
        <label className={styles.checkbox}>
          <span>
            <input
              checked={withVoices}
              onChange={(event) => setWithVoices(event.target.checked)}
              type="checkbox"
            />{' '}
            Incluir as vozes geradas (arquivo maior)
          </span>
        </label>
        <label className={styles.checkbox}>
          <span>
            <input
              checked={withFiles}
              onChange={(event) => setWithFiles(event.target.checked)}
              type="checkbox"
            />{' '}
            Baixar também os arquivos de fotos (avatares e fotos do feed), num arquivo à parte
          </span>
        </label>
        <button
          className={styles.primaryButton}
          disabled={busy}
          onClick={() => void download()}
          type="button"
        >
          Baixar backup agora
        </button>
      </section>

      <section className={`${styles.card} ${styles.cardStack}`}>
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
