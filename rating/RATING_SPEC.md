# Especificação do rating

## Posicionamento correto

- Nome público: `Rating Xadrez Essencial`.
- Subtítulo opcional: `calculado por método Elo compatível com parâmetros FIDE`.
- Não usar: `rating oficial FIDE`.

## Pools

- bullet;
- blitz;
- rapid;
- classical;
- correspondence, se implementado.

Cada pool possui histórico e rating independente.

## Algoritmo FIDE-style

Para cada partida:

1. Determine `D = playerRating - opponentRating`.
2. Para jogadores abaixo de 2650, aplique cap de diferença absoluta em 400, conforme regra efetiva indicada desde 1 de outubro de 2025; jogadores 2650+ podem usar diferença integral.
3. Obtenha `PD` pela tabela oficial 8.1.2. A implementação deve guardar a tabela em código, não depender de rede.
4. `deltaRaw = (score - PD) * K`.
5. Arredonde o fechamento conforme política configurada. Para atualização por partida, arredonde 0,5 para longe de zero e registre o valor bruto.

## K factor

Configuração de referência:

- K=40 para novo jogador até 30 jogos concluídos.
- K=20 enquanto rating < 2400.
- K=10 depois que rating publicado atingiu 2400; permanece 10.
- K=40 para menores até o fim do ano do 18º aniversário, enquanto rating < 2300, se a plataforma decidir usar esse dado e houver base legal/consentimento.
- Em rating period, `n*K` não pode exceder 700; no MVP por partida, documentar que esse teto é aplicado apenas em fechamento periódico, se habilitado.

## Rating inicial

A FIDE tem procedimento próprio para rating inicial. Para plataforma online, recomendação de produto:

- iniciar em 1200 com status provisório por 20 partidas; ou
- oferecer calibragem por teste e usar 800–1800.

Isso é regra interna, não regra oficial. Armazenar `provisional=true`.

## Integridade

- rating atualizado somente após partida finalizada e válida;
- transação única por jogador/partida;
- ledger imutável;
- partidas anuladas geram reversão explícita, nunca DELETE;
- snapshots `rating_before` em `game_players`.

## Testes mínimos

- igualdade de rating e vitória/empate/derrota;
- diferença em todos os limites da tabela;
- cap de 400;
- K 40/20/10;
- jogador que já atingiu 2400;
- arredondamento positivo e negativo;
- idempotência;
- rollback de partida anulada.
