# Plano Biblioteca de Partidas + UX + 3D (memória de retomada)

Fonte de verdade para retomar após perda de sessão. Atualizar a cada passo.

## Ordem das fases

1. [~] F1 Biblioteca de partidas (dados + banco + API + UI + revisão IA com cache)
2. [ ] F2 Responsividade, tabuleiro fixo ao centro, sem alert()/confirm()/prompt(), remover exercícios do livro
3. [ ] F3 Tabuleiro 3D (three.js / react-three-fiber), rotação, animação de captura
4. [ ] F4 Testes, caça a erros, correção

## Decisões

- Fonte PGN: PGN Mentor (https://www.pgnmentor.com/players/<Nome>.zip), aberturas lichess-org/chess-openings (CC0, a-e.tsv). Brutos em /tmp/pgn (não commitar).
- Dataset compacto: `database/content/library/games.jsonl.gz`, gerado por `node scripts/library/build-library-dataset.mjs <dirPgn> <dirEcoTsv> [max]` (valida lances com chess.js, dedup, detecta abertura).
- Importação: `pnpm --filter @xadrez/api db:import-library` (já no ci.yml e deploy/remote-deploy.sh).
- Revisão IA: gerada 1x por partida em blocos de 10 lances, gravada em `library_game_reviews` (migration 0045), reutilizada; retomável se falhar. "melhor lance" validado como legal com chess.js.
- Exercícios do livro: removidos página /app/exercicios, menu e filtro "Livro". Dados e pool da Jornada (seed-learning-path) NÃO alterados (risco de pool vazio); link de recomendação aponta para /app/desafios.

## Estado atual (F1)

Feito: migration 0045, contracts/library.ts, módulo API `apps/api/src/library`, teste do prompt, OpenAPI+clientes regenerados, web: `components/library/*`, rotas `/app/biblioteca` e `/app/biblioteca/[gameId]`, menu.
Pendente F1: gerar dataset real (script rodando), testes web, rodar migration+import+e2e em Postgres se disponível, verificar visual.

## Próxima ação

Concluir dataset -> testar UI no navegador -> F2.

## Atualização final (2026-10-31)

- F1, F2, F3 implementadas; gates: API 132 testes ok, web 130 ok, contracts 37 ok, tsc/eslint ok, openapi parity ok.
- Verificado no navegador: 3D renderiza; sala de estudo (mock API) mantém tabuleiro na mesma posição entre lances.
- NÃO verificado: Postgres real (só PGlite: migration up/down e queries), geração IA real (sem chave), animação de captura visual, build `next build`, e2e.
- Pendências: rodar `pnpm build` + CI; decidir se filtra pool da Jornada só para tag challenge; commit/push/deploy aguardam pedido.

## Cache de áudio TTS (2026-10-31)
- Migration 0046 voice_audio_cache (sha256 de modelo|voz|instrução|texto normalizado -> mp3 bytea). VoiceService.synthesize consulta antes de chamar OpenAI, deduplica chamadas simultâneas; resposta com ETag + Cache-Control immutable (navegador também reaproveita). Sem poda automática (last_used_at permite).
