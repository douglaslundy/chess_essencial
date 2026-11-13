import Link from 'next/link';

import { SessionRedirect } from '@/components/auth/session-redirect';

const highlights = [
  'Partidas ao vivo com servidor autoritativo',
  'Exercícios e desafios progressivos, do iniciante ao avançado',
  'Biblioteca de partidas de grandes mestres com revisão comentada por IA',
];

export default function HomePage() {
  return (
    <main className="landingPage">
      <SessionRedirect />
      <header className="landingBar">
        <Link className="landingBrand" href="/">
          <span>XE</span>
          <strong>Xadrez Essencial</strong>
        </Link>
        <nav aria-label="Acesso">
          <Link className="secondaryButton" href="/entrar">
            Entrar
          </Link>
          <Link className="primaryButton" href="/entrar">
            Criar conta grátis
          </Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Plataforma de xadrez</p>
        <h1 id="page-title">Aprenda e jogue xadrez do jeito certo</h1>
        <p className="lead">
          Aulas, exercícios e desafios organizados por dificuldade, partidas ao vivo com regras e
          tempo validados pelo servidor, e ranking para acompanhar sua evolução.
        </p>
        <div className="landingCtas">
          <Link className="primaryButton" href="/entrar">
            Começar agora
          </Link>
        </div>
      </section>

      <section className="panel" aria-labelledby="highlights-title">
        <h2 id="highlights-title">O que você encontra na plataforma</h2>
        <ul>
          {highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </section>

      <footer className="landingFooter">
        <Link href="/regras">Regras da comunidade</Link>
      </footer>
    </main>
  );
}
