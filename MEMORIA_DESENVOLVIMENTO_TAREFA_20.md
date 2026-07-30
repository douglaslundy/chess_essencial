# Memória de desenvolvimento — Tarefa 20

## Objetivo e regra de trabalho

Auditar a plataforma existente e preparar sua evolução para o ciclo:

`JOGAR → ANALISAR → ENTENDER → RECOMENDAR → APRENDER → PRATICAR → RESOLVER → MEDIR → JOGAR NOVAMENTE`

Esta memória transforma `tarefa_20.txt.txt` em backlog executável. Nenhum código de produto será alterado antes da entrega da auditoria.

- Investigar antes de classificar; sustentar conclusões com evidências.
- Usar `EXISTING_SUPERIOR`, `EXISTING_EQUIVALENT`, `EXISTING_PARTIAL`, `EXISTING_INFERIOR`, `NOT_IMPLEMENTED`, `NOT_APPLICABLE` ou `UNKNOWN`.
- Preservar soluções superiores/equivalentes e completar as parciais pela arquitetura existente.
- Manter o servidor autoritativo para regras, relógio, resultado, rating, progresso, conquistas e mastery.
- Fazer um commit por tarefa concluída.
- Antes do commit: testes pertinentes, `git diff --check` e charset quando houver texto visível.
- Não fazer deploy sem pedido explícito do usuário.
- Preservar `livrocompleto/` e alterações não relacionadas.

## Entregáveis obrigatórios

1. `PRODUCT_AUDIT.md`
2. `FEATURE_MATRIX.md`
3. `ARCHITECTURE_AUDIT.md`
4. `IMPLEMENTATION_PLAN.md`
5. `ROADMAP.md`

Os documentos cobrirão os 23 itens da missão: resumo, mapa atual, recursos superiores/parciais/ausentes, riscos, impactos em banco/API/UI/arquitetura, prioridades, estimativas, dependências, autorizações e ciclo central.

## Fila de auditoria

Cada item é uma tarefa e termina em commit próprio.

### T20-A00 — Memória e governança

- [x] Ler regras, progresso, backlog e missão.
- [x] Registrar artefatos, gates, sequência e proibição de deploy.

### T20-A01 — Baseline verificável

- [ ] Registrar branch, commit-base, Git e não rastreados.
- [ ] Mapear workspaces, scripts, stack e comandos de validação.
- [ ] Separar fontes atuais de documentos históricos.
- [ ] Criar o esqueleto dos cinco entregáveis.

### T20-A02 — Descoberta arquitetural

- [ ] Mapear frontend, backend, mobile, banco/ORM, auth, APIs, realtime, cache, storage, jobs, analytics, engine, testes, CI/CD, deploy, estado e design system.
- [ ] Mapear páginas, rotas, componentes, hooks, stores, serviços, repositórios, modelos, schemas, controllers, workers, engines e testes.

### T20-A03 — Jogar, partidas, histórico e realtime

- [ ] Inventariar jogo humano, bots/treinador, controles de tempo, PGN/FEN, rating e histórico.
- [ ] Confirmar autoridade, idempotência, reconstrução e dados entregues ao ciclo.

### T20-A04 — Análise, engine e entendimento do erro

- [ ] Inventariar análise, avaliação, linhas, setas, variantes, feedback e limites.
- [ ] Verificar metodologia de classificação e relações Partida → Análise → Erro → Skill.
- [ ] Não aceitar explicações sem base técnica.

### T20-A05 — Problemas, Jornada e progressão

- [ ] Inventariar puzzles, desafios, Jornada, dificuldade, temas, dicas, timer, rating, progresso, pontos, níveis e streak.
- [ ] Verificar persistência, autoridade, adaptação e conexão com skills.

### T20-A06 — Aprender, cursos, prática e instrutor

- [ ] Inventariar aulas, cursos, learning path, biblioteca, aberturas, prática, finais e treinador.
- [ ] Verificar retomada, progresso, recomendações, autosave e preferências.
- [ ] Reutilizar conteúdo real; não criar aulas fictícias.

### T20-A07 — Recomendações, skills e mastery

- [ ] Identificar serviços, modelos, dados e taxonomias existentes.
- [ ] Distinguir ausência de evidência de domínio baixo.
- [ ] Avaliar recência, dificuldade, contexto, quantidade e confiança.
- [ ] Rejeitar média simples e recomendações aleatórias.

### T20-A08 — Home, navegação e continuidade

- [ ] Avaliar dashboard, recomendações, recentes, próximo desafio, streak, bots e coach.
- [ ] Mapear entradas/saídas, becos sem saída e perda de contexto.
- [ ] Preservar navegação madura equivalente ou superior.

### T20-A09 — Perfil, estatísticas, conquistas e gamificação

- [ ] Inventariar perfil, ratings, estatísticas, insights, atividade, conquistas e recompensas.
- [ ] Exigir dados reais; evitar número mágico global, conquistas artificiais e pay-to-win.

### T20-A10 — Social, rankings e privacidade

- [ ] Inventariar amigos, solicitações, desafios, mensagens, leaderboards e privacidade.
- [ ] Verificar autorização, visibilidade, rate limiting e massa crítica.
- [ ] Não implementar clubes, contatos ou redes sociais automaticamente.

### T20-A11 — Configurações, tabuleiro, mobile e acessibilidade

- [ ] Inventariar preferências e classificar persistência local, por dispositivo ou conta.
- [ ] Avaliar toque, safe areas, orientação, performance, teclado, contraste, leitor de tela, escala e reduced motion.

### T20-A12 — Analytics, observabilidade, performance e segurança

- [ ] Inventariar eventos, métricas e funil do ciclo.
- [ ] Auditar logs, falhas, dados sensíveis, históricos, agregações e engine.
- [ ] Auditar PGN/FEN, autorização, rate limiting e confiança no cliente.

### T20-A13 — Feature Matrix

- [ ] Cobrir todos os requisitos sem presumir ausência.
- [ ] Preencher estado, evidência, referência, recomendação, risco e prioridade.
- [ ] Usar `UNKNOWN` quando não houver conclusão segura e revisar contradições.

### T20-A14 — Soluções superiores e autorizações

- [ ] Documentar implementação atual, proposta, ganhos, perdas e justificativa.
- [ ] Separar decisões automáticas das bloqueadas.
- [ ] Não alterar funcionalidades bloqueadas.

### T20-A15 — Plano e roadmap

- [ ] Produzir quick wins, P0/P1/P2/P3 e XS/S/M/L/XL.
- [ ] Registrar dependências, migrações, contratos, UI, arquitetura, flags e testes.
- [ ] Priorizar o fechamento do ciclo, não volume de features.

### T20-A16 — Validação e entrega

- [ ] Confirmar os 23 itens, validar documentação, diff e charset.
- [ ] Apresentar resumo, riscos e autorizações.
- [ ] Não iniciar código de produto no mesmo commit.

## Depois da auditoria

As features concretas serão criadas em `IMPLEMENTATION_PLAN.md` e `TAREFAS.md`. Cada uma seguirá: localizar/classificar; definir critérios, dados, dependências e impacto; reutilizar módulos; implementar; testar; atualizar migration/rollback, OpenAPI e docs; validar; commitar; não fazer deploy.

## Gates de autorização

Pausar somente a funcionalidade afetada antes de:

- substituir/refatorar `EXISTING_SUPERIOR`;
- mudar significativamente uma UX `EXISTING_EQUIVALENT`;
- remover funcionalidade madura ou histórico;
- trocar framework, banco, engine ou arquitetura central;
- criar clubes ou subsistema social grande;
- importar contatos, integrar redes ou adotar SaaS/dados pessoais adicionais;
- executar migração destrutiva, reset ou exclusão;
- piorar performance, segurança, acessibilidade, confiabilidade ou UX.

As demais tarefas independentes seguem automaticamente pela opção recomendada.

## Itens preventivamente fora da fila automática

- ranking sem massa crítica;
- mastery com poucos dados ou média simples;
- recomendações aleatórias;
- análise pesada indiscriminada no cliente;
- conteúdo ou insights fictícios;
- gamificação artificial ou pay-to-win;
- navegação/design copiados;
- histórico único sem tipagem;
- degradar desafios para forçar uma taxonomia.

## Retomada

- Concluído: `T20-A00`.
- Próxima: `T20-A01 — Baseline verificável`.
- Contexto: `AGENTS.md`, `PROGRESSO.md`, `TAREFAS.md`, `tarefa_20.txt.txt` e esta memória.
- Deploy proibido até solicitação explícita.
