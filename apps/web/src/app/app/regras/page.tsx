import { RulesContent } from '@/components/community/rules-content';

export const metadata = {
  description:
    'Regras de convivência, jogo limpo e conteúdo para a comunidade do Xadrez Essencial.',
  title: 'Regras da Comunidade | Xadrez Essencial',
};

export default function AppRulesPage() {
  return (
    <main className="landingPage appRulesPage">
      <RulesContent />
    </main>
  );
}
