import Link from 'next/link';

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

      <section className="hero" aria-labelledby="rules-title">
        <p className="eyebrow">Comunidade</p>
        <h1 id="rules-title">Regras da comunidade</h1>
        <p className="lead">
          Estas regras existem para que jogar e conversar no Xadrez Essencial seja seguro, divertido
          e justo para todo mundo. Ao usar a plataforma, você concorda em segui-las.
        </p>
      </section>

      <section className="panel" aria-labelledby="conduct-title">
        <h2 id="conduct-title">Como tratamos uns aos outros</h2>
        <ul>
          <li>Trate outros jogadores com respeito, mesmo depois de uma derrota difícil.</li>
          <li>
            Não é permitido discurso de ódio, assédio, ameaças, bullying ou qualquer forma de
            discriminação (raça, gênero, orientação sexual, religião, nacionalidade, deficiência,
            entre outras).
          </li>
          <li>Não envie conteúdo sexual, spam ou links maliciosos por mensagem direta.</li>
          <li>
            Se alguém estiver incomodando você, use o bloqueio de usuário e denuncie o comportamento
            — nossa equipe analisa cada denúncia.
          </li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="fairplay-title">
        <h2 id="fairplay-title">Jogo limpo</h2>
        <ul>
          <li>
            É proibido usar motores de xadrez, tabelas de finais ou qualquer assistência externa
            durante partidas ao vivo.
          </li>
          <li>
            É proibido perder de propósito (&ldquo;sandbagging&rdquo;) para manipular seu rating ou
            o de outra pessoa.
          </li>
          <li>
            Cada pessoa deve manter apenas uma conta. Contas extras usadas para burlar o pareamento,
            o ranking ou uma suspensão serão removidas.
          </li>
          <li>
            Partidas contra o bot de treino não valem para o ranking quando jogadas no modo sem
            tempo; nos demais controles de tempo, elas contam normalmente.
          </li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="content-title">
        <h2 id="content-title">Feed, fotos e perfil</h2>
        <ul>
          <li>
            Você é responsável pelo que publica. Não são permitidas fotos com nudez, violência
            gráfica, discurso de ódio ou conteúdo ilegal.
          </li>
          <li>
            Não publique spam, propaganda não solicitada ou conteúdo protegido por direitos autorais
            que não seja seu.
          </li>
          <li>
            Publicações no feed só ficam visíveis para você e para seus amigos aceitos — mesmo
            assim, publique como se qualquer pessoa pudesse ver.
          </li>
          <li>
            Use uma foto de perfil e um nome de exibição verdadeiros; não se passe por outra pessoa.
          </li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="account-title">
        <h2 id="account-title">Sua conta</h2>
        <ul>
          <li>
            Mantenha seu e-mail e sua data de nascimento corretos em &ldquo;Meus dados&rdquo;.
          </li>
          <li>Não compartilhe sua senha nem acesse a conta de outra pessoa.</li>
          <li>
            Guarde screenshots ou detalhes de qualquer comportamento que você queira denunciar —
            isso ajuda nossa equipe a revisar o caso.
          </li>
        </ul>
      </section>

      <section className="panel" aria-labelledby="enforcement-title">
        <h2 id="enforcement-title">O que acontece quando uma regra é quebrada</h2>
        <p>
          Dependendo da gravidade e da reincidência, uma conta pode receber uma advertência, ficar
          suspensa temporariamente ou ser desativada. Decisões de suspensão ou reativação podem ser
          revertidas por um administrador caso tenha havido engano.
        </p>
      </section>

      <section className="panel" aria-labelledby="updates-title">
        <h2 id="updates-title">Atualizações</h2>
        <p>
          Podemos atualizar estas regras conforme a plataforma cresce. Mudanças relevantes serão
          comunicadas na própria plataforma.
        </p>
      </section>
    </main>
  );
}
