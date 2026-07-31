'use client';

import type {
  ModerationReportDetail,
  ModerationReportStatus,
  ModerationReportSummary,
} from '@xadrez/contracts';
import { useCallback, useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

const labels: Record<ModerationReportStatus, string> = {
  dismissed: 'Arquivada',
  open: 'Aberta',
  resolved: 'Resolvida',
  reviewing: 'Em análise',
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<ModerationReportSummary[]>([]);
  const [status, setStatus] = useState<ModerationReportStatus | 'all'>('open');
  const [selected, setSelected] = useState<ModerationReportDetail | null>(null);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('Carregando denúncias…');
  const [busy, setBusy] = useState(false);
  const token = () => window.localStorage.getItem('xadrez.access_token') ?? '';

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (status !== 'all') query.set('status', status);
      const result = await api.adminListReports(query, token());
      setReports(result.items);
      setMessage(result.items.length ? '' : 'Nenhuma denúncia neste filtro.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Não foi possível carregar as denúncias.',
      );
    }
  }, [status]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function open(reportId: string) {
    setBusy(true);
    try {
      setSelected(await api.adminGetReport(reportId, token()));
      setNote('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível abrir a denúncia.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(nextStatus: 'reviewing' | 'resolved' | 'dismissed') {
    if (!selected) return;
    if (nextStatus !== 'reviewing' && note.trim().length < 3) {
      setMessage('Registre a justificativa antes de encerrar a denúncia.');
      return;
    }
    setBusy(true);
    try {
      const updated = await api.adminModerateReport(
        selected.id,
        { note: note.trim() || undefined, status: nextStatus },
        token(),
      );
      setSelected(updated);
      setNote('');
      setMessage('Decisão registrada no histórico.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível registrar a decisão.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Segurança</p>
          <h1>Denúncias</h1>
        </div>
        <label className="adminFormField">
          Estado{' '}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="open">Abertas</option>
            <option value="reviewing">Em análise</option>
            <option value="resolved">Resolvidas</option>
            <option value="dismissed">Arquivadas</option>
            <option value="all">Todas</option>
          </select>
        </label>
      </header>

      {message ? <p aria-live="polite">{message}</p> : null}

      <div className="adminHubGrid">
        {reports.map((report) => (
          <button
            aria-expanded={selected?.id === report.id}
            className="adminHubCard adminHubCardClickable"
            disabled={busy}
            key={report.id}
            onClick={() => void open(report.id)}
            type="button"
          >
            <strong>
              {labels[report.status]} · {report.category}
            </strong>
            <span>{report.description ?? 'Sem descrição'}</span>
            <span>
              {report.reportedUser?.username ?? 'Partida'} ·{' '}
              {new Date(report.createdAt).toLocaleString('pt-BR')}
            </span>
            {report.overdue ? <span>⚠ SLA de 72 horas vencido</span> : null}
          </button>
        ))}
      </div>

      {selected ? (
        <section className="adminHubCard" aria-label="Detalhes da denúncia">
          <h2>Denúncia {selected.id}</h2>
          <p>{selected.description ?? 'Sem descrição.'}</p>
          <p>
            Denunciante: {selected.reporter.username} · Denunciado:{' '}
            {selected.reportedUser?.username ?? 'não informado'}
          </p>
          <h3>Histórico</h3>
          <ol>
            {selected.history.map((event) => (
              <li key={event.id}>
                {labels[event.toStatus]} — {event.note ?? 'Sem observação'} (
                {new Date(event.createdAt).toLocaleString('pt-BR')})
              </li>
            ))}
          </ol>
          {selected.status === 'open' || selected.status === 'reviewing' ? (
            <>
              <label className="adminFormField">
                Registro da análise
                <textarea
                  maxLength={1000}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  value={note}
                />
              </label>
              <div className="adminSearch">
                {selected.status === 'open' ? (
                  <button disabled={busy} onClick={() => void decide('reviewing')} type="button">
                    Iniciar análise
                  </button>
                ) : null}
                <button disabled={busy} onClick={() => void decide('resolved')} type="button">
                  Resolver
                </button>
                <button disabled={busy} onClick={() => void decide('dismissed')} type="button">
                  Arquivar
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
