# Auditoria de produto — Xadrez Essencial

## Estado

- Missão: Tarefa 20.
- Fase atual: T20-A09 concluída; T20-A10 é a próxima frente.
- Base Git: `main` em `0203a67e3762e1756438b498d2f9e8e81864022c`.
- Data do baseline: 2026-07-30.
- Regra: nenhuma afirmação de presença ou ausência é definitiva sem evidência.

## Resumo executivo

A preencher após o inventário dos domínios. O histórico indica uma plataforma madura, mas registros históricos não substituem verificação no código, contratos, banco, testes e fluxos atuais.

## Fontes de verdade

Prioridade de evidência:

1. código executável, migrations e schemas;
2. contratos/OpenAPI e comportamento coberto por testes;
3. configuração atual de build, CI e deploy;
4. documentação vigente;
5. histórico em `PROGRESSO.md` e `TAREFAS.md`, usado como pista, não como prova isolada.

Checkbox vazio ou menção antiga não comprova que uma funcionalidade está ausente.

## Mapa do sistema atual

Arquitetura confirmada em `ARCHITECTURE_AUDIT.md`: clientes Next.js/Expo consomem NestJS/Fastify por HTTP `/v1` e WebSocket; PostgreSQL é autoritativo; Redis atende relay/filas; MinIO armazena uploads; worker executa Stockfish, narração, bots e expirações. Detalhes dos demais domínios serão adicionados até T20-A12.

## Inventário por domínio

### Home e continuidade

Estado consolidado: `EXISTING_PARTIAL` na Home web, `EXISTING_SUPERIOR` na retomada autoritativa de partidas e aulas e `EXISTING_INFERIOR` nos handoffs entre etapas e na cobertura mobile.

Implementação confirmada:

- a Home web consulta o histórico do usuário e prioriza a partida ativa mais recente;
- sem partida ativa, oferece entrada no matchmaking e, como segundo card, o tabuleiro demonstrativo;
- histórico também lista todas as partidas ativas com ação de retomada e partidas concluídas com revisão;
- partida, aula e Jornada persistem estado no servidor; reconexão da partida é versionada e a aula retoma a tentativa iniciada;
- exercícios persistem sessões no servidor, mas a descoberta da sessão em andamento depende do ID guardado no `localStorage` daquele navegador e filtro;
- Jornada registra nível atual/desbloqueado e oferece próximo estágio/repetição dentro do próprio fluxo;
- a aula concluída oferece próxima aula e retorno ao curso;
- o shell web possui navegação responsiva, estado ativo e filtro por entitlement;
- o mobile possui quatro tabs focadas — Jogar, Cursos, Social e Perfil — sem Home/hub.

Evidências principais: `app/app/page.tsx`, `app-chrome.tsx`, `history-list.tsx`, `game-room.tsx`, `review-room.tsx`, `lesson-player.tsx`, `exercise-trainer.tsx`, componentes da Jornada, repositories de games/aulas/exercícios e tabs mobile.

Soluções superiores preservadas:

1. retomada de partida usa estado autoritativo, não snapshot do cliente;
2. tentativas de aula usam snapshot e log transacional;
3. navegação existente não será substituída sem evidência de descoberta/frequência;
4. mobile mantém tab bar curta em vez de copiar os 13 itens da sidebar web;
5. uma Home personalizada não será criada antes do motor rastreável definido em T20-A07.

Gaps:

- a Home não mostra Jornada atual, última aula, treino em andamento, análise pendente/concluída ou revisão recente;
- não há endpoint agregador de continuidade; ampliar a Home hoje exigiria várias chamadas e lógica duplicada no cliente;
- durante a consulta da partida ativa, a Home exibe inicialmente “Entrar na fila”, podendo trocar de CTA após a resposta;
- não foram encontrados testes da Home;
- o resultado de partida oferece apenas “Fechar”; não leva a revisar, jogar novamente ou treinar;
- a revisão concluída volta somente ao histórico e não preserva erro/skill/destino;
- aula concluída não oferece os exercícios vinculados; treino livre concluído só inicia outro desafio;
- sessão de exercícios pode ser retomada apenas no mesmo navegador/perfil de filtro;
- o nível atual da Jornada e `last_lesson_id` existem, mas não aparecem na Home;
- a sidebar web é uma lista plana de 13 destinos, misturando ações frequentes, plano, regras e tabuleiro demonstrativo;
- brand do shell aponta para a landing pública, não para a visão geral autenticada;
- não há breadcrumb/título contextual no topbar;
- o mobile não possui Jornada, exercícios, desafios, histórico ou revisão;
- nenhum handoff transporta o motivo partida → fraqueza → treino;
- `home_opened` e cliques de continuidade não foram confirmados.

Recomendação: criar primeiro um `ContinuityService`/endpoint agregador que devolva somente próximos passos reais e autorizados: partida ativa, análise acionável, etapa atual, aula retomável e sessão de treino. A Home deve renderizar carregamento explícito, ordenar continuidade antes de descoberta e limitar cards. Em paralelo, fechar becos com CTAs determinísticos: partida → revisão/nova partida; aula → prática vinculada; treino → aplicar em jogo; Jornada → próximo estágio. Só adicionar cards de fraqueza após T20-A07. Preservar a navegação atual e medir uso antes de agrupar em Início/Jogar/Treinar/Aprender/Mais; não copiar a sidebar para o mobile.

### Jogar, partidas e histórico

Estado consolidado do domínio: `EXISTING_SUPERIOR` no núcleo autoritativo e `EXISTING_PARTIAL` na integração com o ciclo de aprendizagem.

Implementação confirmada:

- criação direta, matchmaking, desafios entre usuários, bot compartilhado, personas e modo Treinador;
- Bullet, Blitz, Rapid, Classical e modo sem tempo; rating separado por pool;
- PostgreSQL controla FEN, relógios, turno, resultado, versão e término;
- lances idempotentes por `(game_id, client_move_id)` e concorrência por `expectedVersion`;
- reconstrução integral pela sequência UCI, validação contra `current_fen` e PGN com SHA-256;
- mate, stalemate, repetição, 50 lances, material insuficiente, timeout, desistência e acordo;
- realtime versionado com snapshot/replay, backoff, refresh e relay Redis multi-instância;
- histórico paginado e filtrável, partidas ativas retomáveis, PGN e anotações privadas por ply;
- análise Stockfish automática após término e narração opcional;
- rating transacional/idempotente, ledger, reversão e leaderboard.

Evidências principais: `games.repository.ts`, `games.gateway.ts`, `game-clock.ts`, `matchmaking.repository.ts`, `ratings.repository.ts`, `chess-domain`, migrations 0001/0002/0003/0004/0010/0028 e testes e2e de games/realtime/matchmaking.

Soluções consideradas superiores e preservadas:

1. autoridade completa do servidor com relógio do PostgreSQL;
2. idempotência, lock por partida e reconstrução antes de cada mutação;
3. rating por pool com ledger e reversão idempotente;
4. reconexão por versão e relay entre instâncias com degradação local.

Gaps:

- outbox recebe eventos, mas não existe publisher/consumer nem atualização de `published_at`; a tabela tende a crescer e não integra módulos;
- partida chega automaticamente à análise por polling, mas ainda não há vínculo comprovado Erro → Skill → Recomendação;
- modo `untimed` reutiliza o pool `correspondence` com relógio de 20 dias; não é uma modalidade Daily/correspondência real;
- histórico usa paginação por offset; aceitável hoje, mas requer medição para volumes altos;
- matchmaking continua em polling REST de 3 s; realtime cobre apenas partidas criadas;
- analytics de produto para `game_completed` e funil não foi confirmado.

Recomendação: preservar o núcleo e evoluir somente as integrações. Não substituir engine, relógio, ledger ou protocolo. Tratar outbox e sinais do ciclo antes de adicionar modalidades.

### Análise e entendimento do erro

Estado consolidado do domínio: `EXISTING_SUPERIOR` na separação entre cálculo objetivo e linguagem natural, `EXISTING_EQUIVALENT` na revisão e `EXISTING_PARTIAL` na transformação do erro em aprendizado estruturado.

Implementação confirmada:

- Stockfish 18 local avalia a posição inicial e cada posição após um ply, em profundidade 14;
- avaliações são normalizadas para a perspectiva de quem jogou antes da comparação;
- cada lance recebe avaliação anterior/posterior, melhor lance, perda em centipawns, qualidade e oportunidade perdida;
- posições terminais são tratadas antes do motor, evitando classificar mate como erro por ausência de score UCI;
- revisão oferece resumo por jogador, navegação lance a lance, melhor alternativa, voz, PGN e anotações privadas;
- narração por IA seleciona até seis momentos-chave, usa somente fatos do motor e produz resumo, padrões e plano de estudo;
- sem IA disponível, a web constrói uma narração determinística gratuita a partir da análise;
- explicações de posições idênticas são reutilizadas por cache SHA-256 de FEN, lance, alternativa e qualidade;
- `skill_mastery` e o vocabulário de `exercises.tags` já existem, mas hoje recebem sinais das etapas da Jornada, não das partidas.

Evidências principais: `stockfish-engine.ts`, `game-analysis-job.ts`, `move-quality.ts`, `game-narration-job.ts`, `review-room.tsx`, migrations 0028/0032 e testes correspondentes.

Soluções consideradas superiores e preservadas:

1. Stockfish é a fonte de fatos; o LLM nunca decide avaliação, melhor lance ou qualidade;
2. terminalidade, perspectiva e mate possuem tratamento explícito e regressões automatizadas;
3. falha ou ausência de IA não bloqueia partida nem remove a explicação básica;
4. cache de momentos reduz custo sem compartilhar identidade ou comentário privado.

Gaps:

- não existe diagnóstico semântico normalizado do erro — tema, motivo, fase, padrão tático e skill não são persistidos;
- `patterns` e `study_plan` são texto livre do LLM, sem IDs de skill, confiança, evidência ou destino clicável;
- nenhum processo converte `game_move_analyses` em `skill_mastery`, recomendação ou sessão de prática;
- a narração escolhe os seis maiores centipawn losses dos dois jogadores; isso pode omitir um erro instrutivo do aluno;
- o worker cria um subprocesso Stockfish novo e sequencial para cada posição; protege a VPS compartilhada, mas tem baixo throughput;
- uma queda após o claim deixa análise/narração em `processing`; não há lease, timeout de recuperação ou retry de `failed`;
- quando existe provedor ativo, o worker gera narração paga para toda análise concluída; entitlement e cota só são verificados na leitura da API, depois do custo;
- profundidade fixa e centipawn loss absoluto não são calibrados por ritmo, fase ou nível do jogador;
- não há telemetria confirmada de tempo de fila, duração, taxa de falha, custo ou utilidade da recomendação.

Recomendação: preservar a arquitetura de verdade objetiva e acrescentar uma camada determinística `ErrorSignal` ligada ao catálogo de skills. Só então usar o LLM para explicar o sinal e gerar links rastreáveis para prática. Antes disso, corrigir seleção por entitlement/demanda, recuperação de jobs e métricas. Não aumentar paralelismo do Stockfish sem benchmark e limites de CPU/memória, pois isso pode piorar a VPS compartilhada.

### Problemas, desafios e Jornada

Estado consolidado do domínio: `EXISTING_SUPERIOR` na reutilização dos runtimes autoritativos, `EXISTING_EQUIVALENT` na progressão guiada e `EXISTING_PARTIAL` na adaptação por domínio.

Implementação confirmada:

- catálogo pesquisável por origem, dificuldade, categoria, aula e tema, com sessões persistidas em PostgreSQL;
- avaliação server-side de texto ou sequência de lances; respostas do adversário são deduzidas pelo servidor;
- tentativa, score, dica, solução, métricas, repetição e navegação por exercícios resolvidos;
- Jornada em Mundos, Níveis e etapas `lesson`, `challenge`, `review`, `checkpoint` e `boss`;
- desbloqueio sequencial, placement baseado em histórico suficiente e proteção server-side contra pular etapa;
- etapas reaproveitam o runtime real de aula ou uma sessão real de exercício, sem duplicar correção/progresso;
- repetição de etapa concluída cria sessão descartável nova e preserva o registro histórico que concedeu progresso;
- revisão escolhe a skill de menor score e um exercício ainda não resolvido dentro da faixa do nível;
- `skill_mastery` reaproveita `exercises.tags`; XP, streak e quatro tipos enxutos de conquista são idempotentes por chave;
- dicas usadas e acerto de primeira são obtidos de dados do servidor, não do cliente.

Evidências principais: `exercise-grader.ts`, `exercises.repository.ts`, `learning-path.service.ts`, `learning-path.repository.ts`, `stage-runner.tsx`, `exercise-trainer.tsx`, migrations 0007/0036–0040 e testes unitários/e2e.

Soluções consideradas superiores e preservadas:

1. Jornada compõe runtimes existentes de exercícios e aulas em vez de criar corretores paralelos;
2. desbloqueio, conclusão, dicas e domínio são decididos no servidor;
3. vocabulário de mastery reutiliza tags do conteúdo;
4. replay não altera a conclusão histórica nem reconcede XP/badges.

Gaps:

- mastery recebe somente conclusões de exercícios dentro da Jornada; treino avulso e erros de partidas não alimentam o mesmo perfil;
- score é a razão histórica simples de sucessos por tentativas, sem recência, confiança, dificuldade, decaimento ou próxima revisão;
- adaptação ocorre apenas na etapa `review`; challenges/checkpoints/bosses continuam previamente fixados pelo seed;
- a revisão escolhe aleatoriamente um exercício não resolvido da skill mais fraca, não agenda repetição espaçada de itens já vistos;
- usar dica sem errar ainda conta como `correctFirstTry`, concede bônus completo de XP e pode preservar “Nível perfeito”;
- a correção de sequência reconhece apenas linhas cadastradas; uma alternativa legal equivalente fora delas é marcada incorreta;
- o feedback de erro diz se a linha divergiu, mas não entrega um motivo pedagógico estruturado nem vínculo com o erro da partida;
- não há desafio diário rotativo; a própria migration evita criar esse subsistema sem necessidade comprovada;
- não foram confirmadas métricas de abandono por etapa, dica → sucesso, retenção D1/D7 ou ganho por skill.

Recomendação: preservar a Jornada atual e unificar sinais de partida, treino e aulas no mesmo domínio de skill. Evoluir mastery com evidência, dificuldade, recência e agenda de revisão antes de ampliar gamificação. Corrigir a semântica de dica/perfeição conforme regra de produto e manter desafio diário fora da navegação até existir conteúdo e operação reais.

### Aprender, prática e instrutor

Estado consolidado: `EXISTING_SUPERIOR` no conteúdo versionado e no runtime autoritativo, `EXISTING_EQUIVALENT` na experiência web e `EXISTING_PARTIAL` na continuidade aula → prática e no instrutor transversal.

Implementação confirmada:

- catálogo canônico com 119 aulas reais, páginas de origem, pré-requisitos, versões, importação idempotente e publicação protegida;
- runtime transacional que registra cada ação, avalia no servidor, retoma a tentativa iniciada e preserva snapshot imutável do conteúdo;
- progresso por usuário e matrícula com `last_lesson_id` e percentual do curso;
- 1.282 vínculos aula–exercício, consulta de estudo e validação server-side do vínculo;
- conteúdo substancial de aberturas e finais já distribuído no curso;
- player web com tabuleiro, quiz, feedback, histórico local e navegação anterior/próxima;
- player mobile funcional, porém sem a navegação e continuidade completas da web;
- modo Treinador web não ranqueado e persistido, com Stockfish local, voz e LLM opcional com fallback determinístico;
- Jornada com bolha, avatar fixo, estados e mensagens do instrutor.

Evidências principais: `courses.repository.ts`, `lesson-importer.ts`, `lesson-runtime.repository.ts`, contratos, migration 0007, testes e2e, `lesson-player.tsx`, player mobile, `game-room.tsx`, `useCoachEngine`, `speech.ts` e `stage-runner.tsx`.

Soluções superiores preservadas:

1. versões, proveniência, pré-requisitos e snapshot protegem tentativas contra alterações editoriais;
2. autosave/resume usa log transacional do servidor, sem depender do cliente;
3. aberturas e finais já têm conteúdo real; duplicá-lo criaria divergência;
4. partidas do Treinador são sempre persistidas, reconstruíveis, não ranqueadas e marcadas `coach_mode`;
5. voz e fallback determinístico mantêm o treino utilizável sem o provedor de IA.

Gaps:

- `last_lesson_id` é gravado, mas não há ação explícita de “continuar de onde parou”;
- os vínculos são consumidos sobretudo como exercício → estudo; a conclusão da aula não oferece práticas relacionadas clicáveis;
- após retomar, ações persistidas anteriores não são exibidas para revisão;
- mobile não oferece overview, anterior/próxima ou retorno orientado ao curso;
- não foram confirmados testes de UI dos players web/mobile;
- aberturas e finais têm conteúdo, mas descoberta e passagem direta para prática são limitadas;
- engine, mensagens, bolha, voz, narração e preferências não formam um domínio transversal único;
- não há instrutor selecionável, lembretes pedagógicos ou Treinador mobile;
- o Treinador web não possui setas de ameaça, barra de avaliação ou overlays equivalentes;
- tornar opcional o salvamento das partidas permitiria perder histórico e sinais pedagógicos.

Recomendação: preservar conteúdo, runtime e persistência. Priorizar aula → exercícios vinculados e “continuar aula”; depois corrigir paridade mobile e consolidar um contrato transversal do instrutor. Não duplicar cursos de abertura/final. `autoSaveInstructorGames` permanece bloqueado. Em 2026-07-30, o usuário negou explicitamente tornar o salvamento opcional; as partidas de treino continuarão sempre salvas e sem afetar rating.

### Recomendações, skills e mastery

Estado consolidado: `NOT_IMPLEMENTED` para recomendações transversais, `EXISTING_PARTIAL` para mastery/prática adaptativa e `EXISTING_SUPERIOR` como princípio na preservação das tags e runtimes atuais.

Implementação confirmada:

- `skill_mastery` registra score, tentativas, sucessos, erros e último contato por usuário e string de skill;
- a conclusão de exercício na Jornada soma sucessos/falhas reais obtidos no servidor;
- o vocabulário vem de `exercises.tags`, excluindo `challenge`, `lichess` e `classico`;
- a etapa `review` escolhe a skill de menor score e prefere item jogável, ainda não resolvido, da mesma tag e faixa;
- sem mastery ou item compatível, o seletor degrada para a faixa e, por último, permite repetição;
- tentativas já guardam acerto, score, dicas, duração e instante; exercícios possuem dificuldade numérica;
- foram observadas 62 tags no acervo tático e 23 rótulos editoriais amplos no livro: metadado legado e skill canônica não são equivalentes;
- `composition`, `allowed_themes`, `preferred_themes` e `instructional_metadata` existem no schema, mas não dirigem o runtime;
- não existem contrato, API, persistência, serviço ou UI de `Recommendation`.

Evidências principais: migration 0036, `learning-path.repository.ts`, `learning-path.service.ts`, e2e da Jornada, `exercises.repository.ts`, contratos, migrations de conteúdo e datasets canônicos.

Soluções superiores preservadas:

1. mastery deriva de ações confirmadas pelo servidor;
2. review reutiliza o runtime real e rejeita itens não jogáveis;
3. tags legadas permanecem no conteúdo; aliases canônicos devem ser adicionados sem reescrever o acervo;
4. falta de evidência causa fallback, não falsa afirmação de fraqueza;
5. recomendações aleatórias não serão apresentadas como personalização.

Gaps:

- só exercícios concluídos dentro da Jornada atualizam mastery; prática livre, aulas, partidas e análises não contribuem;
- score é média histórica simples, sem recência, dificuldade, dicas, duração, contexto, peso ou confiança;
- uma observação pode virar “skill mais fraca”; não há `insufficient_data`;
- todas as tags não estruturais recebem o mesmo resultado, misturando peça, padrão, subtipo e tema amplo;
- não há registro canônico com ID, categoria, aliases, versão e relações;
- campos de composição e temas permanecem sem uso;
- prática livre usa filtros manuais e não consulta mastery;
- não há API/UI de mastery nem ledger que explique os eventos por trás do agregado;
- não há repetição espaçada, `next_review_at` ou decaimento;
- não existe ligação partida → `ErrorSignal` → skill → recomendação → conteúdo/prática;
- não há recomendação com motivo, fonte, destino, prioridade, ciclo de vida e contexto;
- não se mede treinamento recomendado → nova partida → redução do mesmo erro.

Recomendação: implementar na ordem: (1) registry versionado de skills com aliases para tags legadas; (2) ledger idempotente `LearningEvidence` com fonte, evento, dificuldade, resultado, dicas, instante e peso; (3) projeção de mastery que diferencie dados insuficientes de baixo domínio; (4) mapeamento rastreável entre `ErrorSignal`, skills, aulas e exercícios; (5) `RecommendationService` determinístico com motivo, fonte, destino e estado; (6) analytics do efeito após o treino. Não criar primeiro cards personalizados nem substituir tags existentes.

### Perfil, estatísticas e gamificação

Estado consolidado: `EXISTING_SUPERIOR` na separação de ratings e na gamificação enxuta, `EXISTING_PARTIAL` no perfil/indicadores atuais e `NOT_IMPLEMENTED` para dashboard temporal e insights sustentados.

Implementação confirmada:

- perfil web edita identidade, avatar, bio, país, data de nascimento, locale, timezone, privacidade, tema, voz e preferências do Treinador;
- menu do usuário mostra ratings separados por Bullet, Blitz, Rapid, Classical e Correspondence;
- cada rating possui jogos, vitórias, empates, derrotas, pico, provisional e ledger/histórico imutável;
- ranking também é separado por pool e deixa explícito que o rating é interno à plataforma;
- exercícios mostram tentativas, acertos, precisão e duração média;
- Jornada expõe XP, streak, nível atual e badges;
- XP concede 10 por etapa e bônus de 5 por primeira tentativa; replay não reconcede;
- catálogo de badges é pequeno: primeira etapa, primeiro nível perfeito, mundos concluídos e streak de 7 dias;
- badges são idempotentes; mundo usa chave contextual;
- mobile Perfil exibe somente nome, username e logout;
- não existe endpoint/dashboard unificado de estatísticas do jogador.

Evidências principais: contratos/repository de ratings, ledger e testes, `auth-status.tsx`, `meus-dados/page.tsx`, métricas de exercícios, learning path service/repository, migration 0039, e2e da Jornada, public profile social e perfil mobile.

Soluções superiores preservadas:

1. rating competitivo, progresso, XP, mastery e conquistas são conceitos separados;
2. rating usa ledger imutável, pools reais, provisional e reversão;
3. gamificação evita dezenas de badges artificiais, conteúdo diário vazio e pay-to-win;
4. replay não duplica XP ou badges;
5. estatísticas inexistentes não são simuladas com cards vazios.

Gaps:

- “Meus dados” mistura configurações com progresso e não funciona como perfil consolidado;
- histórico de rating existe na API, mas não há gráfico/tendência na UI;
- não há períodos 7D/30D/90D/1Y/ALL nem agregação de partidas, aulas, treino e puzzles;
- métricas de exercícios são vitalícias e globais, sem origem, dificuldade, skill ou período;
- não há precisão agregada de partidas, aberturas, forças, fraquezas ou evolução por domínio;
- não há puzzle rating distinto; há apenas rating de xadrez, progresso da Jornada e mastery parcial;
- XP/streak/badges são efeitos sequenciais depois de marcar a etapa concluída, sem transação/ledger único; falha intermediária pode deixar progresso sem recompensa e o retry não recompensa;
- streak usa o dia do banco/UTC e ignora timezone do perfil;
- dica ainda pode preservar first try, bônus de XP e “Nível perfeito”;
- badge `perfect_level` não possui contexto do nível e só pode ser concedido uma vez;
- XP não possui ledger explicável;
- perfil público expõe ratings, mas não progresso/conquistas com granularidade de consentimento;
- mobile não mostra ratings, progresso, badges, edição ou métricas;
- não há teste de utilidade pedagógica ou impacto da gamificação.

Recomendação: primeiro tornar conclusão + XP + streak + badges atômicos ou baseados em ledger idempotente e corrigir a semântica de dica/perfeição. Depois criar um `PlayerStatsService` que agregue fontes existentes por período sem fundi-las em um score global. Expor rating/histórico, partidas, exercícios, aulas, Jornada e mastery em seções distintas, com timezone correto e explicações de origem. Só gerar insights quando T20-A07 fornecer evidência/confiança. Preservar o catálogo pequeno de conquistas; não adicionar cosméticos ou recompensas antes de medir valor.

### Social, rankings e privacidade

Estado: `UNKNOWN`.

### Configurações, tabuleiro, mobile e acessibilidade

Estado: `UNKNOWN`.

### Analytics, observabilidade, performance e segurança

Estado: `UNKNOWN`.

## Classificações consolidadas

### Recursos existentes

A preencher.

### Recursos superiores à referência

A preencher. Qualquer substituição ficará bloqueada por autorização.

### Recursos parciais

A preencher.

### Recursos inferiores

A preencher com ganho objetivo e mensurável.

### Recursos ausentes

A preencher somente após busca sistemática.

### Recursos não aplicáveis

A preencher com justificativa de produto/plataforma.

## Ciclo central

### Mapa atual

A preencher com serviços, entidades, eventos e transições reais.

### Gaps

A preencher.

### Dados faltantes

A preencher.

### Serviços reutilizáveis

A preencher.

## Quick wins

A preencher após a matriz comparativa.

## Riscos

A preencher. Riscos preventivos já constam em `MEMORIA_DESENVOLVIMENTO_TAREFA_20.md`.

## Pontos que exigem autorização

A preencher conforme recursos superiores, mudanças significativas de UX, operações destrutivas e subsistemas sociais.

## Checklist dos 23 itens de entrega

- [ ] 1. Resumo executivo
- [ ] 2. Mapa do sistema atual
- [ ] 3. Feature Matrix
- [ ] 4. Recursos já existentes
- [ ] 5. Recursos superiores à referência
- [ ] 6. Recursos parciais
- [ ] 7. Recursos ausentes
- [ ] 8. Recursos não aplicáveis
- [ ] 9. Quick wins
- [ ] 10. Riscos
- [ ] 11. Alterações de banco
- [ ] 12. Alterações de API
- [ ] 13. Alterações de UI
- [ ] 14. Alterações de arquitetura
- [ ] 15. Roadmap P0/P1/P2/P3
- [ ] 16. Estimativas XS/S/M/L/XL
- [ ] 17. Dependências entre features
- [ ] 18. Pontos de autorização
- [ ] 19. Mapa do ciclo central atual
- [ ] 20. Gaps do ciclo central
- [ ] 21. Conexões entre módulos
- [ ] 22. Dados faltantes para fechar o ciclo
- [ ] 23. Serviços existentes reutilizáveis
