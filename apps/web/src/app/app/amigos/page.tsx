'use client';

import type { Friend, FriendRequestsView } from '@xadrez/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';

const emptyRequests: FriendRequestsView = { incoming: [], outgoing: [] };

function formatLastSeen(lastSeenAt: string | null) {
  if (!lastSeenAt) return 'nunca esteve online';
  const diffMs = Date.now() - Date.parse(lastSeenAt);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'visto agora há pouco';
  if (minutes < 60) return `visto há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `visto há ${hours} h`;
  return `visto há ${Math.floor(hours / 24)} d`;
}

export default function FriendsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequestsView>(emptyRequests);
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('Carregando amigos…');
  const [busy, setBusy] = useState(false);

  function token() {
    return window.localStorage.getItem('xadrez.access_token');
  }

  const load = useCallback(async () => {
    const accessToken = token();
    if (!accessToken) {
      setMessage('Entre na sua conta para ver seus amigos.');
      return;
    }
    try {
      const [friendList, requestList] = await Promise.all([
        api.listFriends(accessToken),
        api.listFriendRequests(accessToken),
      ]);
      setFriends(friendList);
      setRequests(requestList);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar amigos.');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function sendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = token();
    if (!accessToken || !username.trim()) return;
    setBusy(true);
    try {
      await api.sendFriendRequest({ username: username.trim() }, accessToken);
      setUsername('');
      setMessage(`Pedido enviado para ${username.trim()}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o pedido.');
    } finally {
      setBusy(false);
    }
  }

  async function accept(requestUsername: string) {
    const accessToken = token();
    if (!accessToken) return;
    setBusy(true);
    try {
      await api.acceptFriendRequest(requestUsername, accessToken);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível aceitar o pedido.');
    } finally {
      setBusy(false);
    }
  }

  async function decline(requestUsername: string) {
    const accessToken = token();
    if (!accessToken) return;
    setBusy(true);
    try {
      await api.declineFriendRequest(requestUsername, accessToken);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível recusar o pedido.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(requestUsername: string) {
    const accessToken = token();
    if (!accessToken) return;
    setBusy(true);
    try {
      await api.cancelFriendRequest(requestUsername, accessToken);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível cancelar o pedido.');
    } finally {
      setBusy(false);
    }
  }

  async function challenge(friend: Friend) {
    const accessToken = token();
    if (!accessToken) return;
    setBusy(true);
    try {
      const result = await api.createDirectChallenge(
        { challengedUserId: friend.userId, challengerColor: null, timeControlCode: 'blitz-3-0' },
        accessToken,
      );
      if (result.status === 'accepted' && result.gameId) {
        router.push(`/app/partida/${result.gameId}`);
        return;
      }
      setMessage(`Desafio enviado para ${friend.displayName}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível desafiar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(friend: Friend) {
    const accessToken = token();
    if (!accessToken) return;
    setBusy(true);
    try {
      await api.removeFriend(friend.userId, accessToken);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível remover o amigo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Amigos</h1>
        <p>Adicione outros jogadores, veja quem está online e gerencie pedidos.</p>
      </header>

      <form className="adminSearch" onSubmit={sendRequest}>
        <input
          disabled={busy}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Nome de usuário"
          value={username}
        />
        <button disabled={busy || !username.trim()} type="submit">
          Adicionar
        </button>
      </form>

      <p role="status">{message}</p>

      {requests.incoming.length > 0 ? (
        <section aria-label="Pedidos recebidos" className="cardGrid">
          <h2>Pedidos recebidos</h2>
          <div className="adminUserTable" role="table">
            {requests.incoming.map((request) => (
              <div className="adminUserRow" key={request.userId} role="row">
                <strong>{request.displayName}</strong>
                <span>@{request.username}</span>
                <div className="adminUserActions">
                  <button
                    disabled={busy}
                    onClick={() => void accept(request.username)}
                    type="button"
                  >
                    Aceitar
                  </button>
                  <button
                    className="dangerAction"
                    disabled={busy}
                    onClick={() => void decline(request.username)}
                    type="button"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {requests.outgoing.length > 0 ? (
        <section aria-label="Pedidos enviados">
          <h2>Pedidos enviados</h2>
          <div className="adminUserTable" role="table">
            {requests.outgoing.map((request) => (
              <div className="adminUserRow" key={request.userId} role="row">
                <strong>{request.displayName}</strong>
                <span>@{request.username}</span>
                <div className="adminUserActions">
                  <button
                    disabled={busy}
                    onClick={() => void cancel(request.username)}
                    type="button"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-label="Lista de amigos">
        <h2>{friends.length} amigo(s)</h2>
        <div className="adminUserTable" role="table">
          {friends.map((friend) => (
            <div className="adminUserRow" key={friend.userId} role="row">
              <div>
                <span
                  aria-hidden="true"
                  className={friend.presence.online ? 'onlineDot' : 'onlineDot offlineDot'}
                />
                <strong>{friend.displayName}</strong> <span>@{friend.username}</span>
              </div>
              <span>
                {friend.presence.online
                  ? 'online agora'
                  : formatLastSeen(friend.presence.lastSeenAt)}
              </span>
              <div className="adminUserActions">
                <button disabled={busy} onClick={() => void challenge(friend)} type="button">
                  Jogar
                </button>
                <button
                  className="dangerAction"
                  disabled={busy}
                  onClick={() => void remove(friend)}
                  type="button"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
