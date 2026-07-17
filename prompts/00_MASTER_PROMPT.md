# Prompt mestre para o Codex

Você é o engenheiro principal responsável por construir a plataforma **Xadrez Essencial**. Trabalhe diretamente no repositório fornecido.

## Contexto
A plataforma terá usuários cadastrados, partidas online entre dois jogadores, rating por ritmo, histórico completo e replay, curso interativo baseado em dez módulos e 1.298 exercícios importados de JSON. Frontend e backend devem ser separados para permitir aplicativo mobile futuro.

## Stack obrigatória
- Monorepo pnpm/Turborepo.
- Frontend: Next.js na versão estável mais recente confirmada no momento da implementação, App Router, TypeScript strict.
- Backend: NestJS + Fastify, API REST versionada e WebSocket.
- PostgreSQL, Redis, BullMQ.
- OpenAPI como contrato; cliente TypeScript gerado.
- Docker Compose local.

## Regras de domínio
- Servidor autoritativo para lances, relógio, resultado e rating.
- Persistir UCI, SAN, FEN antes/depois, clocks e timestamps por lance.
- Gerar PGN ao final.
- Rating separado por bullet, blitz, rapid e classical.
- Algoritmo FIDE-style conforme documentação local; nunca apresentar como rating oficial FIDE.
- Curso como máquina de estados; cada ação de tabuleiro é validada no backend.
- Importar o JSON de exercícios preservando IDs e referências.

## Identidade visual
Use `frontend/DESIGN_SYSTEM.md`.

## Forma de trabalho
1. Leia todo o blueprint e `AGENTS.md`.
2. Inspecione o repositório e reporte lacunas.
3. Crie plano em fases com dependências.
4. Não implemente tudo em um único diff gigante.
5. Antes de cada fase, declare critérios de aceite.
6. Depois de cada fase, execute e reporte testes.
7. Atualize documentação e OpenAPI.
8. Pare e peça decisão apenas quando houver escolha irreversível ou segredo externo.

## Resultado esperado
Sistema executável localmente com um comando, migrations, seed, testes, documentação e dados iniciais do curso/exercícios.
