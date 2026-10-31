import Link from 'next/link';

import { RulesContent } from '@/components/community/rules-content';

export const metadata = {
  description:
    'Regras de convivência, jogo limpo e conteúdo para a comunidade do Xadrez Essencial.',
  title: 'Regras da Comunidade | Xadrez Essencial',
};

export default function RulesPage() {
  return (
    <main className="landingPage">
      <header className="landingBar">
        <Link className="landingBrand" href="/">
          <span>XE</span>
          <strong>Xadrez Essencial</strong>
        </Link>
        <nav aria-label="Acesso">
          <Link className="secondaryButton" href="/app">
            Ir para a plataforma
          </Link>
        </nav>
      </header>

      <RulesContent />
    </main>
  );
}
