'use client';

import type { RatingProfile } from '@xadrez/contracts';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

const poolLabels: Record<string, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Clássico',
  correspondence: 'Correspondência',
};

// The rating shown in the pill: prefer rapid, then blitz, then the highest.
function headlineRating(ratings: RatingProfile[]): RatingProfile | null {
  if (ratings.length === 0) return null;
  return (
    ratings.find((r) => r.pool === 'rapid') ??
    ratings.find((r) => r.pool === 'blitz') ??
    [...ratings].sort((a, b) => b.rating - a.rating)[0]!
  );
}

export function AuthStatus() {
  const username = useSyncExternalStore(subscribe, usernameSnapshot, () => null);
  const [ratings, setRatings] = useState<RatingProfile[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!username) return;
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    let active = true;
    api
      .getRatings(token)
      .then((value) => {
        if (active) setRatings(value);
      })
      .catch(() => {
        if (active) setRatings([]);
      });
    return () => {
      active = false;
    };
  }, [username]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  async function logout() {
    const refreshToken = window.localStorage.getItem('xadrez.refresh_token');
    if (refreshToken) await api.logout(refreshToken).catch(() => undefined);
    clearStoredSession();
    setOpen(false);
  }

  if (!username) {
    return (
      <Link className="loginLink" href="/entrar">
        Entrar
      </Link>
    );
  }

  const headline = headlineRating(ratings);

  return (
    <div className="userMenu" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="userPill"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span aria-hidden="true" className="userAvatar">
          {username.slice(0, 2).toUpperCase()}
        </span>
        <strong>{username}</strong>
        {headline ? (
          <span className="userRating" title={`Rating ${poolLabels[headline.pool]}`}>
            {headline.rating}
          </span>
        ) : null}
        <span aria-hidden="true" className="userMenuCaret">
          ▾
        </span>
      </button>
      {open ? (
        <div className="userMenuPanel" role="menu">
          <div className="userMenuRatings">
            <span className="userMenuHeading">Meu rating</span>
            {ratings.length > 0 ? (
              <ul>
                {ratings.map((rating) => (
                  <li key={rating.pool}>
                    <span>{poolLabels[rating.pool] ?? rating.pool}</span>
                    <strong>
                      {rating.rating}
                      {rating.provisional ? '?' : ''}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="userMenuEmpty">Jogue partidas ranqueadas para receber seu rating.</p>
            )}
          </div>
          <Link
            className="userMenuLink"
            href="/app/meus-dados"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            Meus dados
          </Link>
          <button className="userMenuLogout" onClick={logout} role="menuitem" type="button">
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
