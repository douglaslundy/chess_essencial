'use client';

import type { Conversation, DirectMessage } from '@xadrez/contracts';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { api } from '@/lib/api/client';

function formatMessageTime(createdAt: string) {
  return new Date(createdAt).toLocaleString('pt-BR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('Carregando conversas…');
  const [busy, setBusy] = useState(false);

  function token() {
    return window.localStorage.getItem('xadrez.access_token');
  }

  const loadConversations = useCallback(async () => {
    const accessToken = token();
    if (!accessToken) {
      setMessage('Entre na sua conta para ver suas mensagens.');
      return;
    }
    try {
      setConversations(await api.listConversations(accessToken));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar conversas.');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadConversations);
  }, [loadConversations]);

  async function openConversation(conversation: Conversation) {
    const accessToken = token();
    if (!accessToken) return;
    setSelected(conversation);
    try {
      setMessages(await api.listMessages(conversation.userId, accessToken));
      setConversations((current) =>
        current.map((item) =>
          item.userId === conversation.userId ? { ...item, unreadCount: 0 } : item,
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar mensagens.');
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = token();
    const body = draft.trim();
    if (!accessToken || !selected || !body) return;
    setBusy(true);
    try {
      const sent = await api.sendMessage(selected.userId, { body }, accessToken);
      setMessages((current) => [...current, sent]);
      setDraft('');
      await loadConversations();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Mensagens</h1>
        <p>Converse diretamente com seus amigos.</p>
      </header>

      <p role="status">{message}</p>

      <div className="messagesLayout">
        <section aria-label="Conversas" className="conversationList">
          {conversations.length === 0 ? (
            <p>Adicione amigos para começar a trocar mensagens.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                aria-pressed={selected?.userId === conversation.userId}
                className="conversationItem"
                key={conversation.userId}
                onClick={() => void openConversation(conversation)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={conversation.presence.online ? 'onlineDot' : 'onlineDot offlineDot'}
                />
                <span className="conversationItemBody">
                  <strong>{conversation.displayName}</strong>
                  <small>{conversation.lastMessage?.body ?? 'Nenhuma mensagem ainda'}</small>
                </span>
                {conversation.unreadCount > 0 ? (
                  <span className="conversationUnread">{conversation.unreadCount}</span>
                ) : null}
              </button>
            ))
          )}
        </section>

        <section aria-label="Conversa selecionada" className="messageThread">
          {selected ? (
            <>
              <h2>{selected.displayName}</h2>
              <div className="messageList">
                {messages.map((item) => (
                  <p
                    className={item.mine ? 'messageBubbleMine' : 'messageBubbleTheirs'}
                    key={item.id}
                  >
                    {item.body}
                    <time dateTime={item.createdAt}>{formatMessageTime(item.createdAt)}</time>
                  </p>
                ))}
              </div>
              <form className="messageComposer" onSubmit={submitMessage}>
                <input
                  disabled={busy}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Escreva uma mensagem…"
                  value={draft}
                />
                <button disabled={busy || !draft.trim()} type="submit">
                  Enviar
                </button>
              </form>
            </>
          ) : (
            <p>Selecione uma conversa para começar.</p>
          )}
        </section>
      </div>
    </main>
  );
}
