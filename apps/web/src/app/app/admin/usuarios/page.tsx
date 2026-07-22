'use client';

import type { AdminUser } from '@xadrez/contracts';
import { useCallback, useEffect, useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/api/client';

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  suspended: 'Suspenso',
  deleted: 'Excluído',
};

type PendingAction = { status: 'active' | 'suspended' | 'deleted'; user: AdminUser };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('Carregando usuários…');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const load = useCallback(async () => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) {
      setMessage('Entre com uma conta de administrador.');
      return;
    }
    const search = new URLSearchParams();
    if (query.trim()) search.set('q', query.trim());
    try {
      const result = await api.adminListUsers(search, token);
      setUsers(result.items);
      setTotal(result.total);
      setMessage(result.total ? '' : 'Nenhum usuário encontrado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar usuários.');
    }
  }, [query]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function confirmChange() {
    if (!pending) return;
    const { user, status } = pending;
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setBusyId(user.id);
    try {
      const updated = await api.adminUpdateUserStatus(user.id, { status }, token);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`Usuário ${user.username} agora está ${statusLabels[status]?.toLowerCase()}.`);
      setPending(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao atualizar o usuário.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Usuários</h1>
        <p>{total} usuário(s). Excluir é reversível (soft-delete).</p>
      </header>
      <div className="adminSearch">
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por usuário ou e-mail"
          value={query}
        />
        <button onClick={() => void load()} type="button">
          Buscar
        </button>
      </div>
      <p role="status">{message}</p>
      <div className="adminUserTable" role="table" aria-label="Usuários">
        {users.map((user) => (
          <div className="adminUserRow" role="row" key={user.id}>
            <div>
              <strong>{user.username}</strong>
              {user.isAdmin ? <span className="adminBadge">admin</span> : null}
              <span className="adminUserEmail">{user.email}</span>
            </div>
            <span className={`adminStatus adminStatus-${user.status}`}>
              {statusLabels[user.status] ?? user.status}
            </span>
            <div className="adminUserActions">
              {user.status !== 'active' ? (
                <button
                  disabled={busyId === user.id || user.isAdmin}
                  onClick={() => setPending({ status: 'active', user })}
                  type="button"
                >
                  Reativar
                </button>
              ) : (
                <button
                  disabled={busyId === user.id || user.isAdmin}
                  onClick={() => setPending({ status: 'suspended', user })}
                  type="button"
                >
                  Suspender
                </button>
              )}
              <button
                className="dangerAction"
                disabled={busyId === user.id || user.isAdmin || user.status === 'deleted'}
                onClick={() => setPending({ status: 'deleted', user })}
                type="button"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        busy={busyId !== null}
        confirmLabel={
          pending?.status === 'suspended'
            ? 'Suspender'
            : pending?.status === 'deleted'
              ? 'Excluir'
              : 'Reativar'
        }
        danger={pending?.status !== 'active'}
        description={
          pending
            ? `${
                pending.status === 'suspended'
                  ? 'Suspender'
                  : pending.status === 'deleted'
                    ? 'Excluir (soft-delete, reversível)'
                    : 'Reativar'
              } a conta de ${pending.user.username}? As sessões ativas serão encerradas.`
            : ''
        }
        eyebrow="Administração"
        onCancel={() => setPending(null)}
        onConfirm={() => void confirmChange()}
        open={pending !== null}
        title={pending ? `Ação sobre ${pending.user.username}` : ''}
      />
    </main>
  );
}
