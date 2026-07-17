# Matchmaking e Rating Xadrez Essencial

## Filas

- Uma conta mantém no máximo uma entrada de fila.
- A fila é separada por controle de tempo e pool de rating.
- A faixa inicial é de 100 pontos para cada lado e cresce 50 pontos a cada 15 segundos, até 800.
- O pareamento exige compatibilidade entre as faixas dos dois jogadores.
- Bloqueios impedem o pareamento; adversários das últimas 24 horas recebem menor prioridade.
- Um advisory lock transacional por controle de tempo e `FOR UPDATE SKIP LOCKED` impedem a criação duplicada.
- O histórico recente de cores é balanceado; empates usam aleatoriedade criptográfica do servidor.

## Desafios diretos

Desafios expiram em dez minutos. Somente a conta desafiada pode responder. Aceitar cria a partida na mesma transação e remove ambos os jogadores de qualquer fila existente.

## Rating

O nome público é **Rating Xadrez Essencial**. O cálculo é FIDE-style, usa a tabela local registrada em `packages/rating-domain`, diferença efetiva limitada a 400 quando o jogador está abaixo de 2650, fatores K 40/20/10 e arredondamento de metades para longe de zero.

Cada partida válida gera uma entrada por jogador no ledger. O banco impede `UPDATE` e `DELETE`; reprocessamentos são idempotentes. Correções são novas entradas `reversal`, ligadas por `reversal_of`, e nunca apagam o histórico original.

Os endpoints autenticados expõem perfis por pool, histórico e leaderboard. O JSON de cálculo preserva versão do algoritmo, expectativa, delta bruto e delta arredondado para auditoria.
