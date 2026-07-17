# Matriz de compatibilidade do blueprint

## Escopo e baseline

Esta matriz compara o conteúdo existente antes da implementação com os requisitos do blueprint e define o alvo da Fase 1. A leitura integral foi concluída em 2026-07-16.

### Versões verificadas

| Componente        |         Versão estável consultada |             Decisão | Motivo                                                                             |
| ----------------- | --------------------------------: | ------------------: | ---------------------------------------------------------------------------------- |
| Node.js           |         24.14.1 no ambiente local | >= 20.9.0, CI em 24 | Compatível com Next.js 16 e NestJS 11                                              |
| pnpm              | 11.13.1 no registro; 11.5.1 local |              11.5.1 | O Corepack não encontrou `@pnpm/exe@11.13.1`; fixado na versão executável validada |
| Next.js           |                           16.2.10 |             16.2.10 | Linha estável; 16.3 ainda estava em preview                                        |
| React / React DOM |                            19.2.7 |              19.2.7 | Compatível com o peer range do Next.js                                             |
| NestJS            |                           11.1.28 |             11.1.28 | Major atual, requer Node.js 20+                                                    |
| Fastify           |                            5.10.0 |              5.10.0 | Adaptador HTTP obrigatório                                                         |
| Turborepo         |                            2.10.5 |              2.10.5 | Orquestração do monorepo                                                           |
| TypeScript        |                             7.0.2 |               6.0.3 | Última versão aceita por `typescript-eslint` 8.64.0 (`<6.1.0`)                     |
| ESLint            |                            10.7.0 |              9.39.5 | Plugins oficiais do Next.js 16 ainda declaram peer até ESLint 9                    |
| Prettier          |                             3.9.5 |               3.9.5 | Formatação compartilhada                                                           |
| Vitest            |                            4.1.10 |              4.1.10 | Testes unitários rápidos em TypeScript                                             |
| Zod               |                             4.4.3 |               4.4.3 | Validação de ambiente e contratos                                                  |

As versões exatas foram consultadas no registro oficial do npm. A estabilidade do Next.js 16.2 e o requisito Node.js 20+ do NestJS 11 foram conferidos na documentação oficial.

## Compatibilidade da Fase 1

| Área             | Requisito do blueprint                               | Estado encontrado                   | Alvo da Fase 1                                  | Estado   |
| ---------------- | ---------------------------------------------------- | ----------------------------------- | ----------------------------------------------- | -------- |
| Estrutura        | Monorepo pnpm/Turborepo                              | Somente documentos                  | Workspace com `apps/*` e `packages/*`           | Atendido |
| Web              | Next.js, App Router, TS strict                       | Ausente                             | `apps/web` com página inicial e `/api/health`   | Atendido |
| API              | NestJS + Fastify, REST `/v1`                         | Contrato conceitual apenas          | `apps/api` com `GET /v1/health`                 | Atendido |
| Worker           | BullMQ separado                                      | Ausente                             | `apps/worker` inicial com configuração validada | Atendido |
| Compartilhamento | Contratos e configurações sem acesso direto ao banco | Arquivos conceituais dispersos      | Pacotes de contratos, tsconfig e ESLint         | Atendido |
| TypeScript       | Strict em todo o código                              | Sem configuração executável         | Configurações strict por aplicação/pacote       | Atendido |
| Qualidade        | ESLint, Prettier, lint e typecheck                   | Ausente                             | Scripts Turbo na raiz                           | Atendido |
| Ambiente         | Validação de variáveis                               | Lista documental                    | Schemas Zod com defaults locais seguros         | Atendido |
| Infra local      | PostgreSQL, Redis e Mailpit em Compose               | Exemplo parcial                     | `compose.yml` com health checks                 | Atendido |
| Saúde            | Health checks web e API                              | Ausentes                            | Endpoints e testes automatizados                | Atendido |
| Testes           | `pnpm test` funcional                                | Plano documental apenas             | Vitest por aplicação/pacote                     | Atendido |
| CI               | Install, lint, typecheck, tests e build              | Ausente                             | GitHub Actions inicial                          | Atendido |
| Execução         | README com um fluxo local                            | Blueprint, sem comandos executáveis | Instruções para infra, install e dev            | Atendido |
| OpenAPI          | Contrato versionado                                  | Existe sem health endpoint          | Documentar `/health` sob servidor `/v1`         | Atendido |

## Compatibilidade das fases seguintes

| Fase | Área                               | Compatibilidade documental                                | Implementação |
| ---: | ---------------------------------- | --------------------------------------------------------- | ------------- |
|    2 | Banco, migrations, auth e usuários | Schema e arquitetura definidos                            | Pendente      |
|    3 | Domínio de xadrez                  | Regras e persistência especificadas                       | Pendente      |
|    4 | WebSocket e relógios               | Eventos e servidor autoritativo especificados             | Pendente      |
|    5 | Matchmaking e rating               | Pools, tabela e ledger especificados                      | Pendente      |
|    6 | Interface de jogo                  | Páginas e design system definidos                         | Pendente      |
|    7 | Histórico e revisão                | Fluxos e persistência definidos                           | Pendente      |
|    8 | Curso e CMS                        | Currículo, schema e modelo SQL definidos                  | Pendente      |
|    9 | Runtime de aulas                   | Máquina de estados especificada                           | Pendente      |
|   10 | Exercícios                         | Importação e validações especificadas; JSON fonte ausente | Pendente      |
|   11 | Segurança e observabilidade        | Controles e métricas especificados                        | Pendente      |
|   12 | Homologação e release              | Plano de testes e deployment definidos                    | Pendente      |

## Lacunas e riscos registrados

- O diretório não contém uma aplicação prévia; a estratégia correta é bootstrap, não migração.
- A pasta `.git` existe, mas não é um repositório Git válido. Nenhum commit será criado sem inicialização explícita.
- Docker não está disponível no PATH local; o Compose será validado estruturalmente, mas a subida real dos containers dependerá da instalação do Docker.
- O JSON `Xadrez_Essencial_Exercicios_1_a_1298.json` não está presente e bloqueará a Fase 10, não a Fase 1.
- TypeScript 7 não será adotado enquanto a cadeia oficial de lint usada no projeto não declarar compatibilidade.

## Evidências finais da Fase 1

Validação concluída em 2026-07-16:

- `pnpm install --frozen-lockfile`: aprovado com pnpm 11.5.1.
- `pnpm peers check`: nenhum problema de peer dependency.
- `pnpm format:check`: aprovado.
- `pnpm lint`: 4 workspaces com código aprovados.
- `pnpm typecheck`: 4 workspaces com código aprovados em TypeScript strict.
- `pnpm test`: 4 arquivos e 7 testes aprovados; inclui injeção HTTP real no Fastify.
- `pnpm build`: web, API, worker e contratos aprovados; rota dinâmica `/api/health` gerada.
- `pnpm smoke:dev`: web, API e worker responderam `status=ok` em portas isoladas.
- OpenAPI e Compose: YAML analisado com sucesso; serviços PostgreSQL, Redis e Mailpit presentes.
- Segurança básica do repositório: nenhum padrão de secret encontrado.
- Charset: 104 arquivos reais verificados, sem mojibake, BOM, interrogação no lugar de acento ou whitespace final.
- `git diff --check`: indisponível porque a pasta `.git` não é um repositório válido; a verificação equivalente de whitespace passou.
- Docker runtime: não executado porque o comando `docker` não está disponível no PATH local.

A Fase 2 permanece pendente e não foi iniciada.
