import { webEnv } from '@/env';

const foundations = [
  'Frontend e backend independentes',
  'Servidor autoritativo para partidas',
  'Contratos versionados em /v1',
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Fase 1 · Fundação técnica</p>
        <h1 id="page-title">Xadrez Essencial</h1>
        <p className="lead">
          A base da plataforma está pronta para evoluir em fases verificáveis, preservando as regras
          do jogo, o tempo e o rating no servidor.
        </p>
        <div className="status" role="status">
          <span className="statusDot" aria-hidden="true" />
          Web operacional
        </div>
      </section>

      <section className="panel" aria-labelledby="foundations-title">
        <h2 id="foundations-title">Princípios do bootstrap</h2>
        <ul>
          {foundations.map((foundation) => (
            <li key={foundation}>{foundation}</li>
          ))}
        </ul>
        <p className="api">
          API configurada em <code>{webEnv.NEXT_PUBLIC_API_URL}</code>
        </p>
      </section>
    </main>
  );
}
