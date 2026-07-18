# Protocolo de partidas em tempo real

## Transporte

- WebSocket em `/v1/ws`.
- Envelope JSON: `{"event":"nome.do_evento","data":{...}}`.
- A versão atual do protocolo é `1`.
- O token não é enviado na URL. A primeira mensagem deve ser `auth.authenticate`.
- Conexões não autenticadas são encerradas após cinco segundos.

## Comandos do cliente

### `auth.authenticate`

```json
{ "event": "auth.authenticate", "data": { "protocolVersion": 1, "accessToken": "..." } }
```

Resposta: `auth.authenticated`.

### `game.join`

```json
{ "event": "game.join", "data": { "gameId": "uuid", "lastKnownVersion": 0 } }
```

Resposta: `game.snapshot`, contendo estado canônico, relógio sincronizado e os lances posteriores a `lastKnownVersion`.

### `move.submit`

```json
{
  "event": "move.submit",
  "data": {
    "gameId": "uuid",
    "clientMoveId": "uuid",
    "expectedVersion": 0,
    "uci": "e2e4"
  }
}
```

O servidor valida autenticação, participação, turno, versão, legalidade e relógio sob lock transacional por partida.

## Eventos do servidor

- `auth.authenticated`: autenticação concluída.
- `game.snapshot`: snapshot de entrada ou reconexão.
- `game.move_committed`: lance persistido e estado atualizado; é transmitido a todos na sala.
- `game.draw_offered`: oferta persistida, com autor, estado canônico e relógio sincronizado.
- `game.finished`: encerramento autoritativo por regra, tempo, desistência ou acordo.
- `game.error`: erro do comando, sem expor token ou detalhes internos.

## Relógio e consistência

O PostgreSQL é a fonte de verdade. Em cada lance, o servidor usa seu próprio timestamp para descontar o tempo, aplicar delay/incremento e persistir `clock_before_ms`, `clock_after_ms`, `think_time_ms` e o novo `active_clock_started_at`. Timers em memória apenas disparam a verificação; a decisão final ocorre sob advisory lock e é idempotente no banco.

O cliente pode interpolar a exibição a partir de `serverNow` e `activeClockStartedAt`, mas deve aceitar qualquer correção do servidor.

## Contrato de reconexao para clientes mobile

- A cada nova conexao, obtenha um access token atual e envie `auth.authenticate` antes de qualquer outro comando.
- Depois de `auth.authenticated`, repita `game.join` com a ultima versao canonica persistida pelo cliente.
- `game.snapshot` e `game.move_committed` atualizam a versao conhecida; o cliente nunca inventa versoes.
- Use backoff exponencial limitado e apenas uma tentativa de refresh HTTP por falha de autenticacao.
- O token nunca vai na URL. O codigo 4401 exige renovar a sessao ou voltar ao login; 4429 indica rate limit; 1013 e transitorio.
- O pacote `@xadrez/sdk` implementa esse fluxo sem depender de Next.js.
