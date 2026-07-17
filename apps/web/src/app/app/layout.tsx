import Link from 'next/link';
import type { ReactNode } from 'react';

import { AuthStatus } from '@/components/auth/auth-status';

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
          <Link href="/app/exercicios">Exercícios</Link>
          <Link href="/ranking">Ranking</Link>
          <Link href="/cursos">Cursos</Link>
          <Link href="/app/admin/curso">CMS do curso</Link>
          <Link href="/app/aula/00000000-0000-4000-8000-000000000901">Aula demonstrativa</Link>
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
          <AuthStatus />
        </header>
        {children}
      </div>
    </div>
  );
}
