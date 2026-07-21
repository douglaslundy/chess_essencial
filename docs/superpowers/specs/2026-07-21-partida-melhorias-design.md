# Melhorias de partida, exercícios e desafios (2026-07-21)

## Contexto

Depois de corrigir o bug de "peças não se movem" (causa raiz: `crypto.randomUUID` indisponível em contexto HTTP inseguro), o usuário pediu uma leva de melhorias de experiência para partidas ao vivo, exercícios e desafios. Todas usam a mesma base de componentes já existente: `ChessBoard` (tabuleiro puro, controlado por `fen`), `GameRoom` (partida ao vivo, via WebSocket) e `ExerciseTrainer` (exercícios/desafios, compartilhado entre as duas telas via prop `guided`).

## Escopo

1. Lag de 1s do bot depois do lance do jogador (partidas contra bot).
2. Botão de visualizar lances passados sem desfazer (partidas ao vivo).
3. Balão de mensagem para lances importantes: captura, xeque, xeque-mate, roque, promoção (partidas ao vivo).
4. Sons de lance e captura, gerados por código, com botão de mudo (partidas ao vivo).
5. Três temas de peças/tabuleiro selecionáveis (Clássico, Staunton 3D, Madeira/Rústico), persistidos no perfil do usuário.
6. Reaproveitar o som de lance (item 4) em Exercícios e Desafios.
7. Confirmar/corrigir os controles de histórico (Voltar/Repetir lance) em Exercícios e Desafios.
8. Reaproveitar o balão de mensagem (item 3) em Exercícios e Desafios para sinalizar acerto/erro.

Fora de escopo: tabuleiro 3D navegável de verdade (só imagens estáticas geradas do modelo 3D); sons via arquivo de áudio externo; qualquer refatoração não relacionada a essas 8 melhorias.

## 1. Lag do bot (1s)

**Situação atual:** `GamesService.commitMoveSequence()` chama `commitMove()` do jogador e, na mesma chamada, `commitBotMoveIfNeeded()` — o gateway (`games.gateway.ts`) só transmite os eventos depois que TUDO terminou, então o lance do bot chega quase junto com a confirmação do lance do jogador.

**Mudança:**
- `GamesGateway.submitMove` deixa de aguardar o lance do bot. `GamesService.commitMove` (novo método, sem o bot embutido) roda e é transmitido imediatamente.
- Depois de transmitir o lance do jogador, se for a vez do bot (`games.botTurn(gameId)` teria um turno), o gateway agenda `commitBotMoveIfNeeded` num `setTimeout` de 1000ms. Quando o timer dispara, computa e persiste o lance do bot e transmite `game.move_committed` separadamente para a sala.
- Timers de partida (`scheduleTimeout`, relógio) continuam sendo agendados a partir do estado mais recente depois de cada broadcast (do jogador e do bot), sem mudança de comportamento ali.
- Se o socket cair ou a partida terminar antes do timer disparar (ex: desistência), o timer verifica `games.botTurn()` de novo antes de commitar — se a partida não estiver mais ativa ou não for turno do bot, ele não faz nada (idempotente, sem side-effect).

**Erros:** se `commitBotMoveIfNeeded` falhar dentro do timer (ex: erro de banco), o erro é logado via `console.error`/observabilidade existente; não há client esperando resposta síncrona nesse ponto, então não há um `game.error` a emitir — apenas registrar e não travar o processo.

**Fora do alcance do atraso:** o lance de abertura do bot quando ele joga de brancas (`GamesService.createBotGame`, antes de qualquer lance do jogador) continua imediato — o atraso de 1s só se aplica à resposta do bot depois de um lance do jogador via `move.submit`.

**Teste:** teste de integração no `games.service.test.ts`/e2e existente, usando fake timers (`vi.useFakeTimers`) para avançar 1000ms e confirmar que o lance do bot só é persistido/transmitido depois disso.

## 2. Navegar lances sem desfazer

**Estado novo em `GameRoom`:** `viewIndex: number | null` (null = "ao vivo"/posição atual). Lista derivada `moves` já existe; cada `GameMove` tem `fenAfter`.

- Cada linha em `.moveRow` (lista de lances) fica clicável — clicar define `viewIndex` para o índice daquele lance.
- Novos botões ←/→ abaixo do tabuleiro (mesmo padrão visual de `.boardControls` já usado em `ExerciseTrainer`) andam `viewIndex` um lance por vez; ← a partir de "ao vivo" vai para o penúltimo lance.
- Quando `viewIndex !== null`: `ChessBoard` recebe `fen={moves[viewIndex].fenAfter}` em vez de `state.currentFen`, e `disabled` fica sempre `true` (bloqueia lance) independente de `canMove`. Aparece uma faixa "Vendo lance X de Y · Voltar ao vivo" com botão que zera `viewIndex`.
- Um lance novo chegando via `game.move_committed` NÃO altera `viewIndex` automaticamente (o jogador continua vendo o histórico até clicar em "Voltar ao vivo"), exceto se `viewIndex` apontava para o ÚLTIMO lance antes da atualização — nesse caso ele acompanha o novo último lance (comportamento tipo "seguir ao vivo" só quando já estava na ponta).

**Teste:** teste de componente cobrindo clicar num lance antigo (tabuleiro muda, fica desabilitado), clicar "Voltar ao vivo" (volta a refletir `state.currentFen` e reabilita conforme `canMove`).

## 3. Balão de mensagem para lances importantes

**Novo componente compartilhado** `MoveAnnouncement` (`apps/web/src/components/game/move-announcement.tsx` + `.module.css`): recebe `text: string | null` e `tone: 'neutral' | 'success' | 'danger'`; renderiza um balão com `role="status" aria-live="polite"`, animação de entrada/saída via CSS, e timer interno de ~2.5s que o esconde sozinho (limpo com `useEffect`/`clearTimeout` a cada novo texto).

**Detecção do evento** a partir de um `GameMove` recebido (via `move` handler do `GameSocket`, tanto para o lance do jogador quanto do adversário/bot):
- `move.san.includes('#')` → "Xeque-mate!"
- `move.san.includes('+')` → "Xeque!"
- `move.flags.promotion` → "Promoção! `<SAN>`"
- `move.flags.castling` → "Roque"
- `move.flags.capture` → "Captura em `<to>`"
- (prioridade nessa ordem; xeque-mate cobre e substitui os demais textos daquele lance)
- Lances "quietos" (nenhuma das condições acima) não mostram balão.

Usado em `GameRoom` (dispara a cada `move` recebido do socket) e em `ExerciseTrainer` (item 8, dispara em `submit()`).

## 4. Sons de lance e captura

**Novo módulo** `apps/web/src/lib/sound.ts`: usa `AudioContext`/`webkitAudioContext` (com checagem de disponibilidade — se não existir, todas as chamadas viram no-op silencioso, sem quebrar nada). Duas funções, `playMoveSound()` e `playCaptureSound()`, cada uma criando um `OscillatorNode` + `GainNode` curtos (envelope de ~80-150ms) com frequências diferentes (lance: tom único agudo curto; captura: dois tons curtos em sequência, mais grave) — nenhum arquivo externo.

- `AudioContext` só é criado no primeiro gesto do usuário (ex: primeiro clique no tabuleiro) para respeitar a política de autoplay dos navegadores.
- Preferência de mudo: `localStorage` (`xadrez.sound_muted`), com um botão 🔊/🔇 perto de "Oferecer empate/Desistir" em `GameRoom`. Usado também em `ExerciseTrainer` (item 6), lendo a mesma chave.
- `GameRoom` toca o som certo (lance normal vs. captura, com base em `move.flags.capture`) a cada `move` recebido do socket (jogador e adversário/bot).

**Teste:** teste unitário do módulo `sound.ts` garantindo que chamadas não quebram quando `AudioContext` é `undefined` (ambiente sem suporte) e que respeita a flag de mudo.

## 5. Três temas de peças/tabuleiro

**Backend:** migração nova adiciona `board_theme` (enum `classic`/`staunton_3d`/`wood`, default `classic`) em `user_profiles`. `updateMeInputSchema` e o schema de perfil ganham o campo `boardTheme`. Endpoint `PATCH /v1/users/me` já existente passa a aceitar/retornar esse campo sem mudança de rota.

**Frontend:**
- `ChessBoard` ganha uma prop `pieceTheme: 'classic' | 'staunton_3d' | 'wood'` (default `'classic'`). Para `'classic'` e `'wood'`, continua renderizando `<ChessPiece>` (SVG inline) — `'wood'` usa um novo conjunto de `path`s desenhado à mão (mesmo padrão de código do conjunto atual) com paleta de cor terrosa/madeira aplicada via CSS. Para `'staunton_3d'`, renderiza `<img src="/piece-themes/staunton-3d/{color}-{piece}.png">` (os 12 arquivos já gerados a partir do modelo 3D enviado, recortados e centralizados).
- Board (`.chessBoard`/`.lightSquare`/`.darkSquare`) ganha variantes de cor por tema via um atributo `data-board-theme` no container, com blocos CSS adicionais (não mexe na estrutura de grid existente).
- Preferência é lida do perfil do usuário (`api.getMe()`) e passada via um Context simples (`PieceThemeContext`) para não ter que perfurar props em cada tela que usa `ChessBoard`; um hook `usePieceTheme()` expõe `theme` e `setTheme()` (que chama `api.updateMe({ boardTheme })` e atualiza o Context otimisticamente).
- Seletor fica na página Meus Dados: três cartões clicáveis com pré-visualização (peça de rei de cada tema), sem exigir salvar formulário à parte — troca já persiste ao clicar.

**Geração dos assets do tema Staunton 3D:** já concluída nesta sessão (script Node com Puppeteer + Three.js renderizando o `.glb` enviado, corrigindo o eixo Z-up→Y-up do modelo, recortando e centralizando cada peça); os 12 PNGs já estão em `apps/web/public/piece-themes/staunton-3d/`.

**Teste:** teste de componente do `ChessBoard` cobrindo os 3 valores de `pieceTheme` (renderiza `<img>` vs `<svg>` conforme esperado); teste de contrato/e2e da migração e do endpoint aceitando/persistindo `boardTheme`.

## 6. Som em Exercícios/Desafios

`ExerciseTrainer.playBoardMove()` passa a chamar `playMoveSound()`/`playCaptureSound()` (mesmo módulo do item 4) a cada lance aplicado no tabuleiro — captura detectada localmente via `chess.js` (`move.captured` no retorno de `chess.move()`), já que aqui não existe round-trip de servidor por lance.

## 7. Controles de histórico em Exercícios/Desafios

Já existe (`boardControls` com "← Voltar lance"/"↻ Repetir lance") para exercícios com `positionType === 'legal_position'`, em ambas as telas (`guided` e não-guided), como confirmado nesta sessão ao corrigir o estilo desses botões. Ação: verificação dirigida (não suposição) — teste manual/e2e explícito cobrindo um exercício guiado (Desafios) E um exercício livre (Exercícios) com tabuleiro, confirmando que os botões aparecem e funcionam nos dois. Se algum caso estiver quebrado, corrigir ali (bug pontual, não redesenho).

## 8. Balão de acerto/erro em Exercícios/Desafios

Reaproveita `MoveAnnouncement` (item 3). Em `ExerciseTrainer.submit()`:
- `attempt.correct === true` → balão tom `success`, texto "Você conseguiu!" (ou "Parabéns! Você concluiu todos os desafios." quando `status === 'completed'`, reaproveitando o texto que já existe em `message`).
- `attempt.correct === false` → balão tom `danger`, texto "Essa não era a jogada certa." — o banner atual (`.incorrectFeedback` com botão "Tentar novamente") continua existindo como está (ele já cumpre a função de ação, não é só mensagem); o balão é um reforço visual momentâneo a mais, não substitui o banner.

## Fora de escopo / débito técnico registrado

- Tabuleiro 3D navegável de verdade (Three.js no cliente) — não faz parte desta leva.
- Segundo modelo de peças enviado pelo usuário (arquivo não chegou) — tema "Madeira/Rústico" foi desenhado do zero em SVG como alternativa combinada com o usuário.
- Sincronizar preferência de tema entre abas abertas simultaneamente não é coberto (só recarregar a página reflete a troca feita em outra aba).
