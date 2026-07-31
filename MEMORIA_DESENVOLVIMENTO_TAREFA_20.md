# Memória de desenvolvimento — Tarefa 20

## Estado desta memória

- Data de criação: 2026-07-30.
- Fonte primária: `tarefa_20.txt.txt`.
- Estado: planejamento da auditoria; nenhuma funcionalidade da Tarefa 20 foi implementada.
- Regra de execução: concluir e apresentar a auditoria antes de alterar produto, arquitetura, banco, APIs ou UX.
- Identidade do produto: a referência Chess.com serve apenas para comparação de padrões; não autoriza copiar código, textos, assets, personagens, mapas, marcas, nomes, conteúdo ou layouts.

## Objetivo

Evoluir a plataforma existente de um conjunto de recursos de xadrez para um sistema integrado de evolução do jogador, orientado pelo ciclo:

`JOGAR -> ANALISAR -> ENTENDER O ERRO -> RECOMENDAR TREINAMENTO -> APRENDER -> PRATICAR -> RESOLVER DESAFIOS -> MEDIR DOMÍNIO -> JOGAR NOVAMENTE`

O resultado deve permitir responder, com dados rastreáveis: **o jogador melhorou depois do treinamento recomendado?**

## Leitura crítica inicial

1. A Tarefa 20 não é uma autorização para reconstruir o produto. Ela exige investigação antes de qualquer conclusão sobre ausência ou inferioridade de uma funcionalidade.
2. O projeto está maduro e o histórico registra implementações recentes de Jornada de Aprendizagem, exercícios, partidas, análise, instrutor, configurações administrativas, IA, ratings, recursos sociais e mobile. Esses registros são pistas, não prova final; cada item ainda deve ser confirmado no código, contratos, banco, testes e interface.
3. O roadmap P0/P1/P2/P3 contido na tarefa é uma hipótese. Ele não deve ser copiado para o backlog sem a matriz comparativa.
4. A Tarefa 20 contém iniciativas que podem piorar o produto se forem aplicadas sem evidência: substituir navegação madura, acrescentar pontos ou streaks artificiais, mostrar rankings sem massa crítica, executar análise de engine cara em dispositivos fracos, criar clubes/mensagens prematuramente, duplicar históricos e introduzir um número mágico de habilidade. Essas iniciativas ficam bloqueadas por gates de decisão.
5. A auditoria deve distinguir falta de evidência (`UNKNOWN`) de ausência (`NOT_IMPLEMENTED`) e falta de dados de domínio baixo.
6. O servidor permanece autoritativo para regras, relógio, resultado, rating, progresso, conquistas, leaderboard e mastery. Nenhuma evolução pode confiar nesses valores enviados pelo cliente.

## Classificação obrigatória

Cada requisito deve receber exatamente um estado, acompanhado de evidência:

| Estado                | Uso                                                              | Ação padrão                                                    |
| --------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| `EXISTING_SUPERIOR`   | A solução atual é objetivamente melhor que a referência/proposta | Preservar e pedir autorização antes de substituir ou refatorar |
| `EXISTING_EQUIVALENT` | A solução atual atende de forma equivalente                      | Preservar; mudar apenas com ganho mensurável                   |
| `EXISTING_PARTIAL`    | Há base reutilizável, mas o fluxo está incompleto                | Completar incrementalmente; não reimplementar do zero          |
| `EXISTING_INFERIOR`   | Existe, mas há deficiência objetiva e demonstrável               | Propor evolução com métricas, risco e regressões cobertas      |
| `NOT_IMPLEMENTED`     | A busca sistemática confirmou ausência                           | Planejar somente se houver valor e dependências viáveis        |
| `NOT_APPLICABLE`      | Não faz sentido para o produto/plataforma atual                  | Não implementar e justificar                                   |
| `UNKNOWN`             | Evidência insuficiente mesmo após investigação                   | Registrar a lacuna e a verificação necessária; não presumir    |

## Evidência mínima por item

Uma classificação só é válida quando registrar, conforme aplicável:

- arquivos, módulos, rotas, componentes, serviços e testes encontrados;
- tabelas, migrations, índices, seeds e política de rollback;
- contratos/OpenAPI, validação, autorização e comportamento de erro;
- fluxo de UI, estados vazio/erro/carregamento e persistência de preferências;
- dados recebidos e produzidos no ciclo central;
- métricas/analytics já emitidos;
- limitações observadas e grau de confiança da conclusão.

Busca por palavra-chave isolada não comprova implementação. Documento histórico ou checkbox vazio também não comprova presença ou ausência.

## Entregáveis obrigatórios antes de código

- [x] `PRODUCT_AUDIT.md`: resumo executivo, mapa do produto, inventário validado, recursos superiores/equivalentes/parciais/inferiores/ausentes/não aplicáveis e quick wins.
- [x] `FEATURE_MATRIX.md`: todos os requisitos da Tarefa 20 com estado, evidência atual, referência, recomendação, risco, prioridade, estimativa e dependências.
- [x] `ARCHITECTURE_AUDIT.md`: stack, limites de módulos, dados, APIs, realtime, jobs, engine, segurança, observabilidade, testes, CI/CD, deploy e dívidas.
- [x] `IMPLEMENTATION_PLAN.md`: ondas de entrega, critérios de aceite, arquivos previstos, migrations/rollback, contratos, testes, feature flags, métricas e plano de rollout.
- [x] `ROADMAP.md`: reconciliado com a auditoria e com o roadmap existente; não substituir o conteúdo atual sem preservar decisões válidas.
- [x] Apresentação dos 23 tópicos pedidos em “Entrega da auditoria”, incluindo pontos que exigem autorização.

## Plano de execução

### Fase A — Preparação e baseline

- [x] A01. Registrar commit/branch de referência, estado do Git e arquivos não rastreados, sem incorporar alterações do usuário.
- [x] A02. Ler somente as fontes de contexto necessárias: `AGENTS.md`, `PROGRESSO.md`, `TAREFAS.md`, `README.md`, documentos de arquitetura e contratos relevantes.
- [x] A03. Levantar scripts de build, lint, typecheck, testes, migrations, seeds e deploy.
- [x] A04. Definir o catálogo único de requisitos da Tarefa 20 e atribuir um ID estável a cada linha da futura matriz.
- [x] A05. Definir critérios objetivos de superioridade, equivalência, risco e prioridade antes de classificar features.

Saída: escopo auditável, baseline reproduzível e catálogo sem duplicatas.

### Fase B — Descoberta arquitetural

- [x] B01. Mapear monorepo, aplicações web/mobile/API/worker, pacotes compartilhados e fronteiras de responsabilidade.
- [x] B02. Confirmar linguagem, frameworks, banco, ORM/query layer, cache, storage, filas/jobs e realtime.
- [x] B03. Mapear autenticação, autorização, planos/entitlements, papéis administrativos e privacidade.
- [x] B04. Mapear API versionada, OpenAPI/SDK, Problem Details e validação de entrada, especialmente PGN/FEN.
- [x] B05. Mapear engine de xadrez/análise, limites de execução, cache, falhas e comportamento em dispositivos fracos.
- [x] B06. Mapear estado de frontend, design system, navegação, acessibilidade, responsividade e persistência local/servidor/dispositivo.
- [x] B07. Mapear testes unitários, integração com PostgreSQL/Redis, e2e, CI, release, deploy e rollback.
- [x] B08. Mapear logs, métricas, tracing/error tracking, alertas, backups e restauração.

Saída: `ARCHITECTURE_AUDIT.md` e mapa do sistema atual.

### Fase C — Inventário funcional por domínio

Em todos os itens: localizar implementação, provar o comportamento, identificar dados/contratos/testes, classificar e registrar lacunas.

- [x] C01. **Home/hub:** dashboard, recomendações, partidas recentes, próximo desafio, aprendizado, desafio diário, bots, instrutor e streak; verificar se a Home orquestra o próximo passo do ciclo.
- [x] C02. **Jogar:** modalidades, controles de tempo, casual/competitivo/treino, histórico, PGN, posição final, adversário, origem e alimentação da análise.
- [x] C03. **Problemas/desafios:** catálogo, Jornada, dificuldade adaptativa, objetivo, rating, pontos/progressão separados, streak, timer, dicas progressivas, feedback de erro e seleção do próximo desafio.
- [x] C04. **Aprender:** cursos, aulas, biblioteca, trilha, aberturas, progresso, retomada, ligação entre fraqueza e conteúdo real.
- [x] C05. **Instrutor/treinador:** personalidade própria, hints, feedback, voz, lembretes, autosave, configurações e partida contra instrutor.
- [x] C06. **Prática/exercícios/finais:** prática guiada, livre, adaptativa, revisão/reforço, finais disponíveis e seleção por dificuldade/mastery.
- [x] C07. **Análise:** hub, nova análise, editor, importação PGN/FEN, análise pós-partida, avaliação centipawn/mate, linhas, tempo máximo, feedback de lance, exploração de variantes e ameaças.
- [x] C08. **Tabuleiro e preferências:** sons, haptic, coordenadas, último lance, lances legais, animações, notação, roque, reduced motion e celebrações.
- [x] C09. **Estatísticas/insights:** períodos, modalidades reais, partidas, ratings, puzzles, aulas, treino, precisão, forças e fraquezas sustentadas por dados.
- [x] C10. **Conquistas/recompensas:** modelos, progresso, desbloqueios, badges/títulos/cosméticos, autoridade do servidor e ausência de pay-to-win.
- [x] C11. **Social:** solicitações, amigos, busca, desafios, mensagens, privacidade, filtros de rating, rankings e massa crítica.
- [x] C12. **Clubes:** apenas diagnóstico de viabilidade e arquitetura; não implementar nesta fase.
- [x] C13. **Perfil/histórico:** identidade, ratings por pool, progresso, conquistas, estatísticas e atividade recente, com históricos tipados e não misturados indevidamente.
- [x] C14. **Navegação/design system/configurações:** arquitetura de informação atual, componentes reutilizáveis, preferências centralizadas e identidade visual própria.
- [x] C15. **Mobile/acessibilidade:** touch, safe areas, orientação, teclado, tamanho do tabuleiro, performance, screen reader, contraste, alvo de toque e escala de texto.
- [x] C16. **Analytics/observabilidade:** eventos de produto, minimização de dados, funil do ciclo, falhas de API/engine e métricas de melhoria após treino.
- [x] C17. **Segurança/performance:** autorização, rate limiting, visibilidade, inputs de xadrez, paginação, histories, leaderboards, engine, animações e agregações.

Saída: inventário evidenciado para `PRODUCT_AUDIT.md` e `FEATURE_MATRIX.md`.

### Fase D — Auditoria do ciclo central

- [x] D01. Desenhar o ciclo atual com serviços, eventos, entidades e transições realmente existentes.
- [x] D02. Verificar se uma partida concluída produz dados suficientes para análise posterior sem duplicação.
- [x] D03. Verificar se a análise identifica decisões críticas e erros com base técnica, não só score do engine.
- [x] D04. Verificar o vínculo conceitual e persistido `Game -> Analysis -> Mistake -> Skill`.
- [x] D05. Verificar se explicações têm tipo, gravidade, posição, lance, recomendação e confiança sem conteúdo inventado.
- [x] D06. Verificar se recomendações têm motivo, origem, skill, prioridade e rastreabilidade.
- [x] D07. Verificar se a fraqueza leva a aula real ou, na ausência dela, a prática/desafio correspondente.
- [x] D08. Verificar a ligação de puzzles e práticas à taxonomia de skills sem adulterar metadados legados.
- [x] D09. Verificar se mastery consolida quantidade, recência, dificuldade, contexto e confiança, distinguindo falta de dados de domínio baixo.
- [x] D10. Verificar o retorno a jogo com contexto da recomendação preservado entre módulos.
- [x] D11. Verificar continuidade: toda tela concluída deve oferecer próximo passo útil ou retorno claro.
- [x] D12. Mapear dados ausentes, serviços reutilizáveis e contratos/eventos necessários para fechar gaps.

Saída: mapa atual, gaps, conexões, dados faltantes e serviços reutilizáveis.

### Fase E — Matriz, decisão e roadmap

- [x] E01. Preencher todas as linhas de `FEATURE_MATRIX.md`; nenhuma linha pode ficar sem evidência ou justificativa de `UNKNOWN`.
- [x] E02. Consolidar duplicidades entre módulos, preferências e fluxos para evitar serviços/tabelas paralelos.
- [x] E03. Identificar quick wins de alto impacto e baixo risco.
- [x] E04. Registrar riscos de UX, arquitetura, desempenho, segurança, privacidade, custo e operação.
- [x] E05. Listar mudanças potenciais de banco, API, UI e arquitetura, ainda sem implementá-las.
- [x] E06. Estimar cada proposta em XS/S/M/L/XL e declarar dependências.
- [x] E07. Priorizar P0/P1/P2/P3 pela evidência da auditoria, impacto no ciclo e custo, substituindo a hipótese inicial quando necessário.
- [x] E08. Separar explicitamente itens preservados, itens recomendados e itens bloqueados por autorização.
- [x] E09. Apresentar os resultados ao usuário antes de qualquer implementação.

Saída: cinco entregáveis concluídos e decisão informada sobre execução.

### Fase F — Implementação posterior, somente após a auditoria

Para cada feature aprovada/recomendada:

- [ ] F01. Reconfirmar a implementação atual e sua classificação.
- [ ] F02. Definir mudança mínima, dependências, dados recebidos/produzidos e contribuição ao ciclo.
- [ ] F03. Definir critérios de aceite, métricas de sucesso e plano de regressão.
- [ ] F04. Projetar contrato versionado, migrations preservando dados e rollback documentado.
- [ ] F05. Adicionar feature flag para iniciativas grandes ou de rollout arriscado.
- [ ] F06. Implementar reutilizando serviços e componentes maduros.
- [ ] F07. Cobrir regras críticas com testes unitários e fluxos com integração/e2e.
- [ ] F08. Validar acessibilidade, mobile, performance, segurança e observabilidade pertinentes.
- [ ] F09. Executar lint, typecheck, testes, build e validação de contratos/conteúdo pertinentes.
- [ ] F10. Atualizar OpenAPI, SDK, documentação, `PROGRESSO.md` e a matriz com o resultado real.
- [ ] F11. Antes de commit/push/deploy: executar `git diff --check`, varredura de charset/mojibake e secrets.
- [ ] F12. Fazer rollout gradual e medir se a mudança melhorou o funil e o desempenho do jogador.

## Gates de autorização — não executar automaticamente

Solicitar autorização prévia, com comparação de ganhos e perdas, quando ocorrer qualquer caso abaixo:

1. Uma funcionalidade for classificada como `EXISTING_SUPERIOR` e a proposta pretender substituí-la ou refatorá-la.
2. Uma funcionalidade `EXISTING_EQUIVALENT` sofrer mudança significativa de comportamento ou UX.
3. A mudança substituir navegação madura, engine, banco, framework, design system ou fronteira arquitetural estável.
4. Houver remoção de funcionalidade, perda de compatibilidade, reset/reprocessamento arriscado de progresso ou alteração destrutiva de dados.
5. A proposta envolver clubes, mensagens/comunidade ampla, importação de contatos, redes sociais ou dependência externa relevante.
6. A proposta introduzir custo recorrente relevante de IA/engine/SaaS, coleta adicional de dados pessoais ou mudança de defaults de privacidade.
7. Rankings forem propostos sem massa crítica; mastery sem evidência suficiente; recomendações sem motivo rastreável; pontos/streaks/conquistas sem valor pedagógico demonstrável.
8. Análise, animações ou MultiPV puderem degradar bateria, latência, estabilidade ou acessibilidade em dispositivos suportados.

Formato da solicitação:

```text
FUNCIONALIDADE:
IMPLEMENTAÇÃO ATUAL:
PROPOSTA:
POR QUE A ATUAL É MELHOR OU A MUDANÇA É ARRISCADA:
O QUE SERIA PERDIDO:
O QUE SERIA GANHO:
RECOMENDAÇÃO:
```

Pergunta obrigatória: “Seu sistema já possui uma solução que considero superior nesse aspecto, ou a mudança pode piorá-lo. Deseja realmente substituí-la/refatorá-la?”

As frentes independentes de auditoria podem continuar enquanto esse item aguarda decisão.

## Riscos já identificados antes da auditoria

| Risco                                               | Consequência                                           | Tratamento                                                          |
| --------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Tratar o roadmap hipotético como lista de ausências | Duplicação e regressão de recursos maduros             | Exigir matriz e evidência antes do backlog                          |
| Usar Chess.com como especificação literal           | Perda de identidade e risco de propriedade intelectual | Comparar padrões, nunca copiar expressão concreta                   |
| Criar módulos isolados                              | O ciclo central continua fragmentado                   | Exigir entrada, saída, consumidor e métrica para cada feature       |
| Explicação ou recomendação sem base                 | Perda de confiança e treino incorreto                  | Registrar confiança, fonte e fallback honesto                       |
| Mastery com poucos dados ou média simples           | Diagnóstico enganoso                                   | Modelo explícito de evidência, recência, dificuldade e incerteza    |
| Gamificação artificial                              | Otimização por cliques em vez de aprendizado           | Vincular recompensa a comportamento pedagógico útil                 |
| Engine/análise excessiva no cliente                 | Bateria, latência e travamentos                        | Limites configuráveis, capacidade do dispositivo e execução gradual |
| Social/clubs prematuros                             | Grande custo, moderação, abuso e privacidade           | Gate de autorização e estudo de massa crítica                       |
| Preferências duplicadas local/servidor              | Estados inconsistentes                                 | Definir autoridade e escopo por preferência                         |
| Histórico ou schema unificado à força               | Perda semântica e migração arriscada                   | Tipagem explícita, preservação e rollback                           |

## Hipótese de dependências

Esta ordem foi confirmada e detalhada no plano consolidado:

1. Inventário e taxonomia de skills existente.
2. Qualidade e completude dos dados de partida/análise.
3. Classificação tecnicamente defensável de erros.
4. Vínculo entre erro, skill e conteúdo/prática/puzzle.
5. RecommendationService rastreável.
6. SkillMastery com evidência suficiente.
7. Home/hub como orquestrador e retorno a jogo.
8. Analytics do funil e avaliação de melhoria após treinamento.

RecommendationService adaptativo depende de análise e taxonomia confiáveis. SkillMastery depende de sinais consistentes. Home personalizada depende de recomendações. Insights e rankings dependem de dados e massa crítica. Nenhum desses componentes deve ser antecipado com placeholders enganosos.

## Critérios de conclusão da auditoria

A Fase 0 estará concluída somente quando:

- todos os requisitos tiverem estado e evidência, ou justificativa clara de `UNKNOWN`;
- os cinco documentos obrigatórios estiverem coerentes entre si;
- os 23 tópicos de entrega estiverem respondidos;
- recursos superiores e mudanças potencialmente regressivas estiverem destacados;
- alterações de banco, API, UI e arquitetura estiverem identificadas, sem terem sido aplicadas;
- roadmap, estimativas e dependências refletirem o sistema real;
- o usuário tiver recebido os resultados e os pontos que exigem autorização.

## Próxima ação automática recomendada

Executar `COR-T20-006 — Fazer os controles de privacidade produzirem efeito real`, primeira correção P0 da onda de segurança. Preservar os gates, fazer um commit ao concluir e não realizar deploy.
