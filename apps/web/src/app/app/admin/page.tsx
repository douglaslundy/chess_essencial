import Link from 'next/link';

const sections = [
  {
    href: '/app/admin/usuarios',
    title: 'Usuários',
    description: 'Buscar, suspender, reativar ou excluir (soft-delete) contas de jogadores.',
  },
  {
    href: '/app/admin/curso',
    title: 'Curso e aulas',
    description: 'Editar e publicar o conteúdo do curso.',
  },
  {
    href: '/app/admin/bots',
    title: 'Bots sociais',
    description: 'Estatísticas das contas-bot: total, online agora, amizades e partidas.',
  },
  {
    href: '/app/admin/smtp',
    title: 'Configuração de e-mail (SMTP)',
    description: 'Definir o servidor SMTP usado para verificação de conta e redefinição de senha.',
  },
  {
    href: '/app/admin/mercado-pago',
    title: 'Configuração de pagamento (Mercado Pago)',
    description: 'Chaves de acesso do Mercado Pago para processar pagamentos, sem redeploy.',
  },
  {
    href: '/app/admin/planos',
    title: 'Planos de assinatura',
    description: 'Criar planos, escolher recursos liberados e a quantidade diária de cada um.',
  },
  {
    href: '/app/admin/indicacoes',
    title: 'Programa de indicação',
    description: 'Configurar a recompensa opcional de quem indica novos jogadores.',
  },
  {
    href: '/app/admin/recursos',
    title: 'Recursos experimentais',
    description:
      'Ativar ou desativar recursos como a partida assistida do tabuleiro demonstrativo.',
  },
  {
    href: '/app/admin/narracao-ia',
    title: 'Narração por IA',
    description: 'Chave de API usada para gerar a narração falada da revisão pós-partida.',
  },
  {
    href: '/app/admin/metricas',
    title: 'Métricas',
    description: 'Usuários, partidas, exercícios, aulas, assinaturas e indicações em um só lugar.',
  },
];

export default function AdminHubPage() {
  return (
    <main className="dashboardPage">
      <header className="pageHeader">
        <h1>Administração</h1>
        <p>Ferramentas restritas a administradores da plataforma.</p>
      </header>
      <div className="adminHubGrid">
        {sections.map((section) => (
          <Link className="adminHubCard" href={section.href} key={section.href}>
            <strong>{section.title}</strong>
            <span>{section.description}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
