'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { AuthStatus } from '@/components/auth/auth-status';

const navigation = [
  { href: '/app', label: 'Visão geral' },
  { href: '/app/jogar', label: 'Jogar' },
  { href: '/app/partidas', label: 'Partidas' },
  { href: '/app/exercicios', label: 'Exercícios' },
  { href: '/app/desafios', label: 'Desafios' },
  { href: '/app/ranking', label: 'Ranking' },
  { href: '/app/cursos', label: 'Cursos e aulas' },
  { href: '/app/meus-dados', label: 'Meus dados' },
  { href: '/app/partida/demo', label: 'Tabuleiro demonstrativo' },
] as const;

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMenuOpen(false));
  }, [pathname]);

  return (
    <div className="appShell">
      <aside className={`appSidebar ${menuOpen ? 'mobileSidebarOpen' : ''}`} id="app-navigation">
        <Link className="sidebarBrand" href="/">
          <span>XE</span>
          <strong>Xadrez Essencial</strong>
        </Link>
        <nav aria-label="Navegação principal">
          {navigation.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/app' && pathname.startsWith(`${item.href}/`));
            return (
              <Link className={active ? 'activeNav' : undefined} href={item.href} key={item.href}>
                {item.label}
              </Link>
            );
          })}
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
          <AuthStatus />
        </header>
        {children}
      </div>
    </div>
  );
}
