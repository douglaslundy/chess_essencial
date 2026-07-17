# Auditoria pós-release — Fase 13

## Baseline e método

Auditoria executada em 2026-07-17 na branch `codex/phase13-audit`, partindo de `d3a6803`. Foram comparados os prompts 00–12 e 90, contratos, controladores, guards, migrations, testes, OpenAPI, frontend, scripts de release e o estado do banco da VPS de teste.

A release anterior em `main` possuía os jobs `quality`, `database-integration` e `container-validation` aprovados. As alterações desta fase ainda precisam repetir esses gates antes de integração e deploy.

## Matriz de conformidade

| Área                          | Estado                     | Evidência ou gate                                                                                                        |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Separação web/API             | Conforme                   | Next.js consome REST/WebSocket; somente a API acessa PostgreSQL.                                                         |
| Autorização                   | Conforme                   | Rotas privadas usam Bearer guard; CMS também exige papel admin ou content_editor.                                        |
| Domínio de xadrez             | Conforme                   | O servidor reconstrói o estado, valida UCI/legalidade e deriva SAN, FEN, PGN e resultado.                                |
| Persistência/idempotência     | Conforme                   | clientMoveId, versionamento, transação e outbox impedem confirmação duplicada.                                           |
| Realtime e relógio            | Conforme                   | Autenticação inicial, snapshot/reconexão e decisão de tempo persistida sob lock.                                         |
| Matchmaking                   | Corrigido na F13           | Frontend agora usa os sete códigos reais com hífen; contrato compartilhado rejeita o formato antigo.                     |
| Rating                        | Conforme                   | Pool separado, ledger imutável, versão do cálculo e reversão por nova entrada.                                           |
| Cadastro e sessão             | Corrigido na F13           | Tela de cadastro/login, SMTP, reenvio genérico e refresh automático adicionados.                                         |
| Curso e runtime de aula       | Conforme na infraestrutura | CMS versionado e runtime autoritativo possuem testes; conteúdo real ainda está incompleto.                               |
| Exercícios                    | Parcial, gate F14          | Fonte tem 1.298 IDs válidos, mas a VPS possui zero exercícios importados.                                                |
| Segurança/observabilidade     | Conforme com risco aceito  | Rate limit, Problem Details, redaction, métricas protegidas e audit log implementados.                                   |
| Backup/restore                | Conforme                   | Backup pré-migration, SHA-256, restore drill e retenção de 14 dias existem; teste automatizado da expiração fica na F17. |
| Acessibilidade/responsividade | Baseline conforme          | Tabuleiro usa grid, botões, teclado e estados ARIA; homologação formal fica na F16.                                      |
| Deploy                        | Conforme                   | Origem única GitHub; timer executa `git pull --ff-only` e o script impede árvore alterada.                               |

## Achados por severidade

### P0

Nenhum achado P0 aberto.

### P1

| Achado                                                         | Estado                                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| VPS com 10 módulos, 1 aula e 0/1.298 exercícios                | Aberto exclusivamente na F14; impede declarar o conteúdo completo.                     |
| Cadastro sem interface e token de verificação sem entrega      | Corrigido na F13 com tela web, SMTP e Mailpit na VPS de teste.                         |
| Falha de SMTP após criar conta deixava usuário sem recuperação | Corrigido com `POST /v1/auth/resend-verification` e resposta anti-enumeração.          |
| Códigos de matchmaking do frontend incompatíveis com o seed    | Corrigido e coberto por contrato que rejeita underscores.                              |
| Access token expirava sem renovação no frontend                | Corrigido com rotação centralizada e retry único após 401.                             |
| SMTP atual suporta relay simples sem TLS/autenticação          | Aceito apenas para VPS local; F17 bloqueia produção pública até integrar relay seguro. |

### P2

- Recuperação de senha ainda não existe; incluída no ciclo de autenticação da F15.
- Auditoria formal de foco, contraste, leitor de tela e viewports permanece na F16.
- Teste de expiração da retenção e otimização dos três builds permanecem na F17.
- Ações GitHub baseadas em Node legado devem ser atualizadas durante manutenção da F17.

## Fonte de conteúdo

O arquivo ignorado ` helper_files/Xadrez_Essencial_Exercicios_1_a_1298.json` foi inspecionado sem versionar seu conteúdo:

- 10 módulos;
- 300 diagramas;
- 1.298 exercícios;
- 1.298 IDs e números únicos;
- zero referências de diagrama ausentes;
- zero checksums inválidos na validação estática.

O dry-run do importador TypeScript foi bloqueado localmente por `spawn EPERM` e deve ser repetido na CI/F14 antes de qualquer escrita no banco.

## Validações desta branch

Aprovadas localmente:

- contratos: 9 arquivos e 24 testes;
- API direcionada: 3 arquivos e 8 testes;
- typecheck de contratos, API e web;
- geração do cliente OpenAPI;
- formatação direcionada.

Pendente como gate de integração:

- teste web do refresh: 1 arquivo e 2 testes aprovados com configuração local mínima;
- suite web completa no config oficial e build final, ambos bloqueados localmente por criação de processo no sandbox; lint e typecheck completos foram aprovados; três jobs da CI ainda pendentes;
- deploy por `main` e verificação da VPS.

## Decisão

A Fase 13 somente pode ser encerrada após CI verde, merge em `main`, deploy automático e healthchecks. A Fase 14 não deve iniciar antes desses gates.
