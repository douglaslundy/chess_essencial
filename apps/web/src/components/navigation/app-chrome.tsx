'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { AuthStatus } from '@/components/auth/auth-status';
import { BoardSettingsMenu } from '@/components/navigation/board-settings-menu';
import { api } from '@/lib/api/client';
import { useEntitlements } from '@/lib/subscriptions/use-entitlements';

const navigation = [
  { href: '/app', label: 'Visão geral' },
  { href: '/app/treinamento', label: 'Treinamento' },
  { href: '/app/jogar', label: 'Jogar' },
  { href: '/app/partidas', label: 'Partidas' },
  { href: '/app/biblioteca', label: 'Biblioteca de partidas' },
  { href: '/app/desafios', label: 'Desafios' },
  { href: '/app/ranking', label: 'Ranking', requiresFeature: 'social_access' },
  { href: '/app/amigos', label: 'Amigos', requiresFeature: 'social_access' },
  { href: '/app/mensagens', label: 'Mensagens', requiresFeature: 'social_access' },
  { href: '/app/feed', label: 'Feed', requiresFeature: 'social_access' },
  { href: '/app/planos', label: 'Planos' },
  { href: '/app/partida/demo', label: 'Tabuleiro demonstrativo' },
  { href: '/regras', label: 'Regras da comunidade' },
] as const;

const HEARTBEAT_INTERVAL_MS = 30_000;

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { hasFeature } = useEntitlements();

  useEffect(() => {
    queueMicrotask(() => setMenuOpen(false));
  }, [pathname]);

  useEffect(() => {
    const token = window.localStorage.getItem('xadrez.access_token');
    if (!token) return;
    let active = true;
    // Probe the admin-guarded endpoint: only admins get a 200.
    api
      .adminListUsers(new URLSearchParams({ limit: '1' }), token)
      .then(() => {
        if (active) setIsAdmin(true);
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    function ping() {
      const token = window.localStorage.getItem('xadrez.access_token');
      if (token) void api.heartbeat(token).catch(() => undefined);
    }
    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="appShell">
      <aside className={`appSidebar ${menuOpen ? 'mobileSidebarOpen' : ''}`} id="app-navigation">
        <Link className="sidebarBrand" href="/">
          <span>XE</span>
          <strong>Xadrez Essencial</strong>
        </Link>
        <nav aria-label="Navegação principal">
          {navigation
            .filter((item) => !('requiresFeature' in item) || hasFeature(item.requiresFeature))
            .map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/app' && pathname.startsWith(`${item.href}/`));
              return (
                <Link className={active ? 'activeNav' : undefined} href={item.href} key={item.href}>
                  {item.label}
                </Link>
              );
            })}
          {isAdmin ? (
            <Link
              className={pathname.startsWith('/app/admin') ? 'activeNav' : undefined}
              href="/app/admin"
            >
              Administração
            </Link>
          ) : null}
        </nav>
        <div className="sidebarFooter">
          <span className="onlineDot" />
          Servidor autoritativo
        </div>
      </aside>
      {menuOpen ? (
        <button
          aria-label="Fechar menu"
          className="mobileMenuBackdrop"
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      ) : null}
      <div className="appContent">
        <header className="appTopbar">
          <button
            aria-controls="app-navigation"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Fechar menu principal' : 'Abrir menu principal'}
            className="mobileMenuButton"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            <span aria-hidden="true">☰</span>
            Menu
          </button>
          <Link className="mobileBrand" href="/">
            XE
          </Link>
          <span>Plataforma de jogo</span>
          <BoardSettingsMenu />
          <AuthStatus />
        </header>
        {children}
      </div>
    </div>
  );
}
