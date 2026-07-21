# Progresso do Projeto

## Última atualização

2026-07-20 - Segunda leva de correções (movimento de peças, layout, exercícios/desafios, quiz) implementada e validada localmente; nada commitado ainda desta leva.
## Tarefa em andamento

Corrigir bug relatado pelo usuário: peças não se movem em nenhuma tela com tabuleiro (partida ao vivo, exercícios, desafios); cabeçalhos grandes forçando scroll; barra inicial sem navegação/login; exercícios com filtros demais; quiz das aulas escondendo o tabuleiro; poucos temas de Desafios.
## Contexto necessário

- Phase 15 merged through PR #15 at commit 8d9bb94; PR/main CI and automatic Git-pull deploy passed.
- Current branch: main at commit aae9c80; CI final passou nos três jobs e deploy automático está em andamento.
- Confirmed defects: menu links point to nonexistent /ranking and /cursos; no Meus dados page; sidebar has no mobile mode; exercises render FEN/text instead of ChessBoard; demo game attempts realtime lookup for id demo.
- Required bot behavior: automatic fallback when no compatible human is queued, optional difficulty/color, server-authoritative legal moves, bot games unrated.
- Mobile/portal acceptance passed locally: web TypeScript passed and 8 web tests passed, including legal moves and incomplete illustrative FEN rendering.
- New portal routes use /app/ranking, /app/cursos, /app/cursos/[slug] and /app/meus-dados; the authenticated shell provides an accessible mobile drawer.
- Demo game id demo is fully local and no longer opens API/WebSocket connections; visual exercises use ChessBoard when the canonical item has FEN.
- Migration 0010 creates the internal bot identity and game_bots metadata; rollback preserves reconstructable historical games.
- Bot moves are selected and committed only by the server, bot games are unrated, fallback is opt-in at the API and enabled by the web flow when no human is queued.
- User can choose direct bot/human fallback, matched/beginner/intermediate/advanced/expert difficulty and white/black/random pieces.
- Local gates passed: lint, typecheck, all non-database tests, OpenAPI generation/check and production build. Docker/PostgreSQL are unavailable locally, so clean migration/rollback and bot DB e2e await GitHub database-integration.
- PR #16 merged at main commit f7bf942; both PR and main runs passed quality, container-validation and database-integration, including clean migration 0010, rollback and reapply.
- No SSH deployment was used. HTTP checks to 192.168.0.233 failed because port 80 was unreachable; the VPS timer must Git-pull main when the server returns.
- Fixed the realtime race: game.join is sent only after auth.authenticated; online state starts only after game.snapshot.
- Board now restricts live input to the authenticated player's color/turn, shows external coordinates, symmetric glyph designs and explicit SAN plus from/to notation.
- Exercise boards maintain move history with Voltar lance/Repetir lance controls.
- Human matchmaking never falls back to a bot; an unmatched search leaves the queue and reports that no online opponent was found. Bot setup remains explicit.
- Ranking and play pages explain the time pools in beginner-friendly language.
- Migration 0011 seeds eight server-scored playable challenges across rating bands: mate in 1/2, save king, fork, pin, skewer, discovered attack and double check; rollback deletes only this catalog.
- Dedicated /app/desafios route selects technique/difficulty and suggests a band from the student's rating.
- Horizontal page overflow is clipped at the shell while wide ranking tables scroll only inside their card.
- All local gates passed after final formatting: lint, typecheck, all non-database tests, SDK/OpenAPI generation check and production build; /app/desafios is included in the Next production route manifest.
- Charset scan checked 27 changed/untracked files as strict UTF-8 with no BOM/mojibake; secret candidate scan and git diff --check passed.
- GitHub database-integration passed clean migration 0011, challenge scoring, rollback and reapply.
- Future validation context: authenticated mobile acceptance for live games, exercises/challenges, play and ranking after the VPS returns.
- Seven course/web/contract files appear modified locally without content diff; never stage them.
- A única chamada nativa encontrada foi window.confirm na desistência; ConfirmDialog reutilizável já foi adicionado e integrado.
- Causa visual confirmada: ambos os lados usam o glifo Unicode preto e dependem de recoloração do navegador; substituir por SVG com fill explícito.
- Causa provável do realtime: as chamadas HTTP renovam o access token, mas GameSocket conserva o token expirado anterior; o access token vence em 15 minutos.
- GameSocket agora obtém/renova o token a cada autenticação; sessões antigas recuperam userId do JWT para liberar a cor correta do jogador.
- Peças agora usam SVG com preenchimento explícito, sem depender da recoloração de glifo Unicode no celular.
- Varredura global não encontrou alert/confirm/prompt executável; somente strings intencionais no teste de sanitização da API.
- Gates locais passaram: 18 testes web, lint, typecheck, build de produção, Prettier e git diff --check.
- Erro Body cannot be empty corrigido: Content-Type JSON só é enviado quando a requisição possui corpo.
- Histórico mantém partidas por desistência/abandono, mas remove Revisar partida; URL direta exibe Revisão indisponível e não carrega dados de revisão.
- Gates do complemento passaram: 21 testes direcionados, lint, typecheck e build de produção.
- Tipografia unificada por tokens CSS: títulos de página entre 1.9rem e 3rem, títulos de seção/cartão menores e espaçamentos verticais reduzidos.
- Varredura cobriu home, dashboard, jogar, cursos, ranking, dados, desafios, exercícios, aulas, histórico e revisão.
- Gates após tipografia passaram: 23 testes web, lint, typecheck e build de produção.
- Desafios agora usam um modo guiado sem filtros/listagem: a sessão inicia ou retoma automaticamente e persiste no navegador.
- Tentativas incorretas não avançam mais a sessão; desafios são ordenados por dificuldade e a resposta adversária é reproduzida automaticamente.
- Tabuleiros de partida, desafio, aula e revisão receberam centralização e limite baseado na altura da viewport.
- Bug transacional corrigido: `attempt()` avançava `current_position` e marcava o item concluído mesmo em tentativa incorreta; agora só avança quando `correct` é verdadeiro, alinhado ao teste e2e já existente.
- challenge-level.ts/challenge-level.test.ts removidos por código morto: challenge-hub.tsx não seleciona mais dificuldade por rating no cliente.
- Gates locais revalidados após a correção: 24 testes web, 22 testes api (45 e2e de banco seguem pulados por falta de Docker local), lint, typecheck e build de produção (web) passaram.
- Correção do treino guiado ainda não foi validada contra Postgres real; depende do database-integration do CI.
- IMPORTANTE: commit 178c831 (Desafios guiado + fix transacional) está local, NUNCA foi enviado (push) nem passou por CI/deploy. O usuário está testando o site em PRODUÇÃO, que ainda roda a versão ANTERIOR a esse commit (aae9c80).
- Usuário relatou (2026-07-20, mesma sessão): peças não se movem em nenhuma tela com tabuleiro quando é a vez dele (só o lance do adversário aparece); cabeçalhos/menus grandes forçam scroll antes de ver exercícios/desafios; barra inicial (`/`) sem menu/login; página de Desafios com poucos botões desnecessários e só 2 temas (mate em 1, salvar o rei); mesmo problema em Exercícios; quiz das aulas aparece "na frente" do tabuleiro (na verdade o tabuleiro simplesmente some no step tipo quiz) e o aluno não lembra a posição para responder.
- Diagnóstico do bug de movimento: não foi possível reproduzir ao vivo (sem navegador conectado, sem Docker/Postgres local). Tracei toda a cadeia (chess-board.tsx seleção/destino -> game-room.tsx canMove/movableColor -> game-socket.ts -> games.gateway.ts -> games.repository.ts commitMove) e não achei bug de lógica. Hipótese mais forte: o aviso de rejeição do servidor (`<p className="gameMessage">`) já existe mas era pequeno/discreto (0.8rem, cor muted) e provavelmente ficava fora da área visível por causa do próprio problema de layout/scroll — por isso parecia "silencioso". `.gameMessage` foi reforçado (fundo, padding, negrito, 0.9rem) para nunca passar despercebido. Se o usuário ainda reportar o bug após o deploy desta correção, o próximo passo é reproduzir ao vivo com o navegador conectado (Chrome extension) para capturar a mensagem real de rejeição.
- Descoberta importante sobre Desafios: os 8 temas (mate em 1/2, salvar o rei, garfo, cravada, espeto, ataque descoberto, xeque duplo) da migration 0011 JÁ estavam todos no banco/produção. O usuário só via 2 porque a versão antiga (ainda em produção) tinha um seletor manual de dificuldade que começava em "iniciante" e escondia o resto por padrão. O modo guiado (commit 178c831, ainda não publicado) já resolve isso ao ordenar os 8 automaticamente por dificuldade.
- Livro já processado em `database/content/Xadrez_Essencial_Exercicios_1_a_1298.json` (1.298 exercícios) e `Xadrez_Essencial_Aulas_1_a_119.json` (119 aulas); o PDF original (`Xadrez_Essencial_Volumes_1_a_10.pdf`, citado em docs/PHASE14_CONTENT_IMPORT.md) NÃO está no repo/sessão Claude, só o conteúdo já extraído e importado.
- Usuário aprovou usar posições táticas clássicas verificadas (não do livro) para desafios extras, e pediu um bloco "Clássicos" filtrável em Exercícios, separado do "Livro", com "Todos" mostrando tudo misturado por dificuldade por padrão.
- 5 novas posições táticas foram desenhadas e VERIFICADAS programaticamente com chess.js (script rodado, `ALL PUZZLES VERIFIED OK`): mate de dama+rei (canto), mate em escada (2 torres), mate abafado (cavalo), mate árabe (torre+cavalo), garfo de cavalo (rei+dama). As 4 primeiras (mates) foram gravadas em DOBRO: uma cópia tag `challenge` (entra na trilha de Desafios, migration 0012, IDs 12000000-...-0001 a 0004) e uma cópia tag `classico` (entra no pool de Exercícios, IDs ...-0005 a 0008); o garfo só existe como `classico` (ID ...-0009).
- Migration `database/migrations/0012_classic_tactics.up/down.sql` criada (9 linhas de exercises) mas AINDA NÃO APLICADA em nenhum banco (nem local, que não tem Postgres, nem produção). Só será validada de verdade pelo database-integration do CI após o push.
- `ExerciseTrainer` (exercise-trainer.tsx) generalizado: prop `guided` agora cai graciosamente para o fluxo normal (input de resposta + botão "Confirmar resposta" pequeno) quando o exercício atual não tem uma linha cravada em `guided-challenge-lines.ts` (isso só existe para os 12 desafios curados). Nova prop `showSourceFilter` adiciona um filtro compacto Todos/Clássicos/Livro (pill buttons pequenos) que reinicia o treino ao trocar. Nova prop `storageKey` evita que Desafios e Exercícios pisem na mesma chave de localStorage ao retomar sessão (antes ambos usavam `xadrez.challenge_training_session`; agora `xadrez.desafios_session` e `xadrez.exercicios_session`).
- Backend: novo parâmetro `source` (`classic`|`book`) em `exerciseSearchQuerySchema`/`exerciseTrainingFiltersSchema` (packages/contracts) e em `api/openapi.yaml` (+ web `openapi.d.ts` e SDK `generated/openapi.ts` regenerados via `openapi-typescript`). `exercises.repository.ts` aplica o filtro via tag (`classico` = ANY(tags) / NOT classico AND NOT challenge) nas 3 queries (search count, search select, startTraining). Também adicionado: por padrão (sem `q` explícito) as buscas de exercícios EXCLUEM itens tag `challenge`, para os 12 desafios não vazarem para o pool geral de Exercícios; a página de Desafios continua funcionando pois ela busca explicitamente com `q=challenge`.
- `/app/exercicios/page.tsx` agora usa `<ExerciseTrainer guided showSourceFilter storageKey="xadrez.exercicios_session" .../>` (antes era `<ExerciseTrainer />` sem nada, com todos os filtros antigos).
- `lesson-player.tsx`: tabuleiro agora também aparece em steps tipo `quiz` quando o step tem `initialFen` (antes só aparecia em `board_instruction`/`checkpoint`, sumindo justamente quando a pergunta precisava da posição). Board fica `disabled` em steps quiz (só referência visual). CSS `lessonRuntimeGridStacked` força layout empilhado (tabuleiro em cima, pergunta embaixo) só para steps quiz; board_instruction/checkpoint continuam lado a lado no desktop.
- `apps/web/src/app/page.tsx` (rota `/`, antes da autenticação) reescrita: era um placeholder de bootstrap da Fase 1 sem navegação nem login (`Princípios do bootstrap`, `API configurada em...`). Agora é uma landing simples com barra superior (`landingBar`) com marca + links Entrar/Criar conta, hero com CTA e lista de destaques. CSS classes mortas removidas de globals.css (`.shell`, `.status`, `.statusDot`, `.api`) por não serem mais usadas em lugar nenhum.
- Redução geral de tipografia/paddings em globals.css: `--font-page-title` de `clamp(1.9rem,4vw,3rem)` para `clamp(1.55rem,3.2vw,2.35rem)`, `--font-section-title`/`--font-card-title`/`--page-padding` também reduzidos, visando eliminar scroll desnecessário em exercícios/desafios/aulas. Botões de ação da partida (`.gameActions button`) e do treino guiado (exercise-trainer.module.css `.filters button`, `.actions button`, `.boardControls button`) reduzidos (menor min-height/padding/font-size), conforme pedido de "botões pequenos". `.gameMessage` reforçado (ver acima).
- Gates locais completos passaram nesta leva: typecheck limpo (contracts, api, web), lint limpo (api, web), testes 24/24 web + 22/22 api (45 e2e de banco pulados, sem Docker local), build de produção do web passou incluindo `/app/exercicios` e `/app/desafios` no manifesto de rotas.
- NADA desta leva foi commitado ainda. Arquivos alterados/novos: api/openapi.yaml, apps/api/src/exercises/exercises.repository.ts, apps/web/src/app/app/exercicios/page.tsx, apps/web/src/app/globals.css, apps/web/src/app/page.tsx, apps/web/src/components/challenges/challenge-hub.tsx, apps/web/src/components/exercises/exercise-trainer.module.css, apps/web/src/components/exercises/exercise-trainer.tsx, apps/web/src/components/lessons/lesson-player.tsx, apps/web/src/lib/api/openapi.d.ts, packages/contracts/src/exercise.ts, packages/sdk/src/generated/openapi.ts, e os dois arquivos novos database/migrations/0012_classic_tactics.up.sql e .down.sql.
## Concluído

- [x] Phases 1-13 implemented, tested and deployed.
- [x] Phase 14 source PDF and canonical dataset validated: 476 pages, 119 lessons, 714 steps and 1,282 links.
- [x] Transactional/idempotent lesson import, audit, migration 0009, rollback/restore and publication gates passed.
- [x] PR #14 and main CI passed; automatic Git-pull deploy and external API/web/worker checks passed.
- [x] Production database and public course counts match the canonical dataset.
- [x] Phase 15 SDK/auth/realtime contracts merged, CI-approved and deployed as image 8d9bb949f612.
- [x] Corrected mobile navigation, missing Ranking/Cursos/Meus dados routes, board containment and visible text contrast.
- [x] Added board interaction to FEN-backed exercises and safe diagram rendering for illustrative positions without legal kings.
- [x] Made the demonstration board local/offline and removed its false realtime disconnect state.
- [x] Implemented legal server-authoritative bot moves, persistence, automatic matchmaking fallback, difficulty and color selection.
- [x] Updated OpenAPI/generated clients, migration rollback CI checks and bot unit/database integration coverage.
- [x] PR #16 and main CI passed all three required jobs.
- [x] Corrected WebSocket authentication ordering and live move availability.
- [x] Added visible coordinates, symmetric piece designs and explicit beginner-readable notation.
- [x] Added exercise undo/repeat controls and separated human search from explicit bot play.
- [x] Added rhythm explanations, overflow containment and the playable Challenges area.
- [x] PR #17 merged; all required PR and main CI jobs passed.
- [x] Deploy de a0c54ac concluído exclusivamente por Git pull automático; timer ativo e health da API retornando 200.
## Próxima tarefa

1. Revisar rapidamente com o usuário se ele quer commitar/enviar tudo (commit 178c831 já local + esta segunda leva ainda não commitada) de uma vez ou em commits separados.
2. Commit e push apenas dos arquivos pretendidos (ver lista de arquivos alterados acima; nunca stage os arquivos que só mudam por CRLF/LF).
3. Aguardar quality, container-validation e database-integration; confirmar que a migration 0012 aplica limpo, que o rollback funciona, e que o fix transacional do treino guiado passa.
4. Após deploy, pedir para o usuário testar de novo especificamente: (a) mover peças numa partida ao vivo real, (b) a página de Desafios (deve mostrar os 12 temas em ordem de dificuldade, sem filtros), (c) Exercícios com o novo filtro Todos/Clássicos/Livro, (d) um quiz de aula (tabuleiro deve continuar visível).
5. Se o bug de movimento de peças persistir mesmo após o deploy, próximo passo é reproduzir ao vivo com a extensão Chrome conectada (o usuário precisa instalar/conectar `claude.ai/chrome`) para capturar a mensagem real de erro em `.gameMessage` e o console/network da partida.
