import Link from 'next/link';

export default function DashboardPage() {
  return (
    <main className="dashboardPage">
      <p className="eyebrow">Área de jogo</p>
      <h1>Seu próximo lance começa aqui.</h1>
      <p className="lead">
        Encontre uma partida no seu ritmo ou volte para uma partida em andamento.
      </p>
      <div className="dashboardCards">
        <Link className="primaryCard" href="/app/jogar">
          <span>Partida rápida</span>
          <strong>Entrar na fila</strong>
          <small>O pareamento considera rating e ritmo.</small>
        </Link>
        <Link className="secondaryCard" href="/app/partida/demo">
          <span>Tabuleiro</span>
          <strong>Visualizar interface</strong>
          <small>Explore o tabuleiro responsivo em modo demonstração.</small>
        </Link>
      </div>
    </main>
  );
}
