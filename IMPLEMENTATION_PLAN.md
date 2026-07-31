# Plano de implementação — Tarefa 20

## Estado

Plano consolidado na T20-A15. A execução começa somente depois da validação T20-A16, um item por commit e sem deploy automático.

## Critérios para uma feature entrar no plano

- classificação sustentada por evidência;
- ganho objetivo para UX, aprendizado, arquitetura, desempenho, acessibilidade, confiabilidade ou manutenção;
- contribuição explícita ao ciclo central;
- dados de entrada, saída e consumidor definidos;
- critérios de aceite e métrica de sucesso;
- dependências e riscos conhecidos;
- gate de autorização resolvido quando aplicável.

## Ondas executáveis

### Onda 0 — Auditoria

T20-A01 a T20-A16. Gate documental obrigatório.

### Onda 1 — Segurança, privacidade e recuperabilidade (P0)

| Ordem | Entrega                         | IDs principais           | Estimativa | Dependência               | Aceite mínimo                                                                  |
| ----- | ------------------------------- | ------------------------ | ---------- | ------------------------- | ------------------------------------------------------------------------------ |
| 1.1   | Política social central         | COR-T20-006, COR-T20-007 | M          | auth/social/feed/messages | flags e bloqueio negam perfil, ranking, contato, mensagem, feed, like/presença |
| 1.2   | Moderação administrativa mínima | COR-T20-008              | M/L        | 1.1, RBAC, audit log      | fila, decisão, histórico, evidência preservada e testes de autorização         |
| 1.3   | Jobs recuperáveis e econômicos  | COR-T20-001, COR-T20-002 | M          | worker/entitlements       | entitlement antes do custo; lease, retry limitado, idempotência e métricas     |
| 1.4   | Gate de release e contrato      | COR-T20-012, COR-T20-016 | M          | CI/GitHub/OpenAPI         | deploy recusa commit sem CI verde; controllers e especificação sem drift       |
| 1.5   | Disaster recovery externo       | COR-T20-013              | M          | destino externo/segredos  | cópia criptografada, retenção, checksum e restore periódico documentado        |

As entregas 1.1–1.5 são independentes entre si, exceto as dependências explícitas; podem ser executadas na ordem de menor risco operacional.

### Onda 2 — Segurança de cliente, acessibilidade e confiança (P0/P1)

| Ordem | Entrega                         | IDs principais | Estimativa | Dependência               | Aceite mínimo                                                        |
| ----- | ------------------------------- | -------------- | ---------- | ------------------------- | -------------------------------------------------------------------- |
| 2.1   | Sessão web e limite distribuído | COR-T20-014    | L          | auth, Redis, realtime     | HttpOnly/CSRF/CSP e fallback testados sem quebrar refresh/socket     |
| 2.2   | Upload validado e normalizado   | COR-T20-015    | M          | storage/image             | magic bytes, formato permitido, normalização e casos hostis          |
| 2.3   | Tabuleiro mobile acessível      | COR-T20-009    | M          | React Native/QA assistiva | nomes, roles, estados, ações e promoção compreensíveis               |
| 2.4   | Teclado e diálogos web          | COR-T20-010    | S          | hook de foco existente    | sem travessia h↔a; foco inicial, Escape e restauração testados       |
| 2.5   | Preferências confiáveis         | COR-T20-011    | S/M        | profile contracts         | falha visível/revertida; paridade mobile somente do estado relevante |
| 2.6   | Semântica de dica/perfeição     | COR-T20-004    | S/M        | decisão de produto        | regra única, histórico preservado e testes de XP/perfeição           |

### Onda 3 — Fechar o ciclo pedagógico (P0/P1)

1. versionar a taxonomia canônica de skills e mapear conteúdo existente (M);
2. produzir `ErrorSignal` com proveniência/confiança a partir da análise (M/L);
3. ligar erro → skill → exercício/aula e concluir COR-T20-003 (L);
4. calcular mastery com evidência, recência, dificuldade e incerteza (L);
5. tornar recomendações explicáveis, idempotentes e consumíveis por Home/revisão (L);
6. criar continuidade pós-partida, pós-análise, pós-aula e pós-prática (M/L);
7. criar Home agregadora somente depois dos contratos anteriores (M/L);
8. medir melhoria em partidas comparáveis sem alegar causalidade prematura (L).

### Onda 4 — Operação e evolução baseada em dados (P1/P2)

- COR-T20-005: medir CPU/memória/fila/custo antes de qualquer paralelismo do Stockfish;
- observabilidade de worker, jobs, filas, web e mobile, com histogramas, SLOs e alertas;
- outbox publicado de forma idempotente e analytics mínimo/consentido do ciclo central;
- carga por fluxos críticos e orçamento p95/p99;
- dashboard temporal e insights somente após dados confiáveis;
- pipeline assinado de release mobile.

### P3 — Bloqueado/experimental

Clubes, equipes, fóruns, eventos, feed público, puzzle rating, torneios e anti-cheat avançado exigem estudo próprio, massa crítica, privacidade/moderação e autorização. Não entram no piloto automático atual.

## Template obrigatório por feature

### Identificação

- ID:
- Classificação atual:
- Evidências:
- Problema:
- Mudança mínima:
- Contribuição ao ciclo:

### Dados e contratos

- Dados recebidos:
- Dados produzidos:
- Próximo consumidor:
- API/OpenAPI/SDK:
- Banco/migration:
- Rollback:

### Qualidade

- Testes unitários:
- Testes de integração:
- E2E:
- Acessibilidade:
- Mobile:
- Performance:
- Segurança:
- Observabilidade:
- Analytics:

### Entrega

- Feature flag:
- Rollout:
- Métrica de sucesso:
- Risco de regressão:
- Exige autorização:
- Commit previsto:
- Deploy: proibido sem pedido explícito.

## Dependências centrais

1. privacidade, bloqueio, jobs, contratos e recuperação formam a base de segurança;
2. dados confiáveis de partida/análise e taxonomia versionada precedem `ErrorSignal`;
3. `ErrorSignal` e conteúdo mapeado precedem mastery e recomendação;
4. recomendação rastreável precede handoffs e Home personalizada;
5. eventos idempotentes e consentidos precedem analytics e insights;
6. métricas de capacidade precedem paralelismo, realtime adicional ou expansão social.

## Gates

Ver `PRODUCT_AUDIT.md` e `MEMORIA_DESENVOLVIMENTO_TAREFA_20.md`. Antes de cada entrega:

- confirmar linha da matriz, correção e dependências;
- preencher o template desta página;
- preservar recursos superiores e decisões do usuário;
- usar migration nova, aditiva e testada; nunca reescrever migration aplicada;
- atualizar contratos/OpenAPI/clientes no mesmo trabalho;
- validar negação, idempotência, acessibilidade, observabilidade e rollback seguro;
- rodar gates locais, charset e `git diff --check`;
- fazer exatamente um commit da tarefa concluída;
- não fazer deploy sem pedido explícito.
