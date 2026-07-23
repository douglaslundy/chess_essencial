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
