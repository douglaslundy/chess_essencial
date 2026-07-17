import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="appShell">
      <aside className="appSidebar">
        <Link className="sidebarBrand" href="/">
          <span>XE</span>
          <strong>Xadrez Essencial</strong>
        </Link>
        <nav aria-label="Navegação principal">
          <Link href="/app">Visão geral</Link>
          <Link className="activeNav" href="/app/jogar">
            Jogar
          </Link>
          <Link href="/app/partidas">Partidas</Link>
          <Link href="/ranking">Ranking</Link>
          <Link href="/cursos">Cursos</Link>
        </nav>
        <div className="sidebarFooter">
          <span className="onlineDot" />
          Servidor autoritativo
        </div>
      </aside>
      <div className="appContent">
        <header className="appTopbar">
          <Link className="mobileBrand" href="/">
            XE
          </Link>
          <span>Plataforma de jogo</span>
          <div className="userPill">
            <span aria-hidden="true">DL</span>
            <strong>Minha conta</strong>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
