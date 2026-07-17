'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { api, clearStoredSession } from '@/lib/api/client';

function subscribe(onStoreChange: () => void) {
  const handleChange = () => onStoreChange();
  window.addEventListener('storage', handleChange);
  window.addEventListener('xadrez-auth', handleChange);
  return () => {
    window.removeEventListener('storage', handleChange);
    window.removeEventListener('xadrez-auth', handleChange);
  };
}

function usernameSnapshot() {
  return window.localStorage.getItem('xadrez.username');
}

export function AuthStatus() {
  const username = useSyncExternalStore(subscribe, usernameSnapshot, () => null);

  async function logout() {
    const refreshToken = window.localStorage.getItem('xadrez.refresh_token');
    if (refreshToken) await api.logout(refreshToken).catch(() => undefined);
    clearStoredSession();
  }

  return username ? (
    <div className="userPill">
      <span aria-hidden="true">{username.slice(0, 2).toUpperCase()}</span>
      <strong>{username}</strong>
      <button onClick={logout} type="button">
        Sair
      </button>
    </div>
  ) : (
    <Link className="loginLink" href="/entrar">
      Entrar
    </Link>
  );
}
