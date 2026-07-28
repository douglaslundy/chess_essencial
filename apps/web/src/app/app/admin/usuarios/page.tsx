'use client';

import type { AdminUser, AdminUserRole, SubscriptionPlan } from '@xadrez/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDialogA11y } from '@/components/ui/dialog-a11y';
import { api } from '@/lib/api/client';

const statusLabels: Record<string, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  suspended: 'Suspenso',
  deleted: 'Excluído',
};

const roleLabels: Record<AdminUserRole, string> = {
  admin: 'Administrador',
  content_editor: 'Editor de conteúdo',
};

type PendingAction = { status: 'active' | 'suspended' | 'deleted'; user: AdminUser };

interface EditFormState {
  displayName: string;
  email: string;
  planId: string;
  roles: AdminUserRole[];
}

function toFormState(user: AdminUser): EditFormState {
  return {
    displayName: user.displayName ?? '',
    email: user.email,
    planId: user.planId ?? '',
    roles: user.roles,
  };
}

// Which fields actually changed, in the shape the PATCH endpoint expects —
// only send what's different so an admin editing just the name never
// accidentally touches roles/plan/e-mail.
function diffForm(original: AdminUser, form: EditFormState) {
  const patch: {
    displayName?: string;
    email?: string;
    planId?: string | null;
    roles?: AdminUserRole[];
  } = {};
  const displayName = form.displayName.trim();
  if (displayName && displayName !== (original.displayName ?? '')) patch.displayName = displayName;
  const email = form.email.trim().toLowerCase();
  if (email && email !== original.email) patch.email = email;
  const planId = form.planId || null;
  if (planId !== original.planId) patch.planId = planId;
  const sortedRoles = [...form.roles].sort();
  if (JSON.stringify(sortedRoles) !== JSON.stringify([...original.roles].sort())) {
    patch.roles = form.roles;
  }
  return patch;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('Carregando usuários…');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<EditFormState | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [confirmingEdit, setConfirmingEdit] = useState(false);
  const editCloseButtonRef = useRef<HTMLButtonElement>(null);

  // The sensitive-change ConfirmDialog stacks on top of this one — only the
  // topmost dialog should react to Escape, so this is "armed" only while
  // that confirmation isn't showing.
  useDialogA11y({
    busy: busyId === editing?.id,
    initialFocusRef: editCloseButtonRef,
    onCancel: closeEdit,
    open: editing !== null && !confirmingEdit,
  });

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

  function openEdit(user: AdminUser) {
    setEditing(user);
    setForm(toFormState(user));
    setEditMessage('');
    if (plans.length === 0) {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (token) api.adminListSubscriptionPlans(token).then((list) => setPlans(list.items));
    }
  }

  function closeEdit() {
    setEditing(null);
    setForm(null);
  }

  function requestSaveEdit() {
    if (!editing || !form) return;
    const patch = diffForm(editing, form);
    if (Object.keys(patch).length === 0) {
      setEditMessage('Nada foi alterado.');
      return;
    }
    // E-mail, roles e plano são alterações sensíveis — pedem confirmação.
    // Só o nome de exibição salva direto.
    const sensitive = 'email' in patch || 'roles' in patch || 'planId' in patch;
    if (sensitive) {
      setConfirmingEdit(true);
    } else {
      void saveEdit();
    }
  }

  async function saveEdit() {
    if (!editing || !form) return;
    const patch = diffForm(editing, form);
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    setBusyId(editing.id);
    try {
      const updated = await api.adminUpdateUser(editing.id, patch, token);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`Usuário ${updated.username} atualizado.`);
      setEditing(null);
      setForm(null);
      setConfirmingEdit(false);
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : 'Falha ao atualizar o usuário.');
      setConfirmingEdit(false);
    } finally {
      setBusyId(null);
    }
  }

  function toggleRole(role: AdminUserRole) {
    setForm((current) => {
      if (!current) return current;
      const has = current.roles.includes(role);
      return {
        ...current,
        roles: has ? current.roles.filter((r) => r !== role) : [...current.roles, role],
      };
    });
  }

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">Administração</p>
          <h1>Usuários</h1>
        </div>
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
      <p className="status" role="status">
        {message}
      </p>
      <div className="adminUserTable" role="table" aria-label="Usuários">
        <div className="adminUserRow adminUserTableHeader" role="row">
          <span role="columnheader">Usuário</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Ações</span>
        </div>
        {users.map((user) => (
          <div className="adminUserRow" role="row" key={user.id}>
            <div role="cell">
              <Avatar avatarUrl={user.avatarUrl} name={user.displayName ?? user.username} />
              <strong>{user.username}</strong>
              {user.isAdmin ? <span className="adminBadge">admin</span> : null}
              {user.planName ? <span className="adminBadge">{user.planName}</span> : null}
              <span className="adminUserEmail">{user.email}</span>
            </div>
            <span className={`adminStatus adminStatus-${user.status}`} role="cell">
              {statusLabels[user.status] ?? user.status}
            </span>
            <div className="adminUserActions" role="cell">
              <button disabled={busyId === user.id} onClick={() => openEdit(user)} type="button">
                Editar
              </button>
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
      {editing && form ? (
        <div
          className="dialogBackdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && busyId !== editing.id) closeEdit();
          }}
          role="presentation"
        >
          <section aria-modal="true" className="confirmationDialog" role="dialog">
            <div className="dialogHeader">
              <div>
                <span className="dialogEyebrow">Editar usuário</span>
                <h2>{editing.username}</h2>
              </div>
              <button
                aria-label="Fechar"
                className="dialogClose"
                disabled={busyId === editing.id}
                onClick={closeEdit}
                ref={editCloseButtonRef}
                type="button"
              >
                ×
              </button>
            </div>
            <label className="adminFormField">
              Nome de exibição
              <input
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                value={form.displayName}
              />
            </label>
            <label className="adminFormField">
              E-mail
              <input
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                type="email"
                value={form.email}
              />
            </label>
            <label className="adminFormField">
              Plano
              <select
                onChange={(event) => setForm({ ...form, planId: event.target.value })}
                value={form.planId}
              >
                <option value="">Nenhum</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Funções</legend>
              {(Object.keys(roleLabels) as AdminUserRole[]).map((role) => (
                <label key={role}>
                  <input
                    checked={form.roles.includes(role)}
                    onChange={() => toggleRole(role)}
                    type="checkbox"
                  />
                  {roleLabels[role]}
                </label>
              ))}
            </fieldset>
            <p>Redefinição de senha não é feita por aqui — use o fluxo de recuperação de senha.</p>
            {editMessage ? (
              <p className="status" role="status">
                {editMessage}
              </p>
            ) : null}
            <div className="dialogActions">
              <button disabled={busyId === editing.id} onClick={closeEdit} type="button">
                Cancelar
              </button>
              <button
                className="dialogConfirm"
                disabled={busyId === editing.id}
                onClick={requestSaveEdit}
                type="button"
              >
                {busyId === editing.id ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <ConfirmDialog
        busy={busyId === editing?.id}
        confirmLabel="Confirmar alteração"
        danger
        description={
          editing
            ? `Isso muda dados sensíveis de ${editing.username} (e-mail, função ou plano). Confirmar?`
            : ''
        }
        eyebrow="Alteração sensível"
        onCancel={() => setConfirmingEdit(false)}
        onConfirm={() => void saveEdit()}
        open={confirmingEdit}
        title="Confirmar alteração"
      />
    </main>
  );
}
