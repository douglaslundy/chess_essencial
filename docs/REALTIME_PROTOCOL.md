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
- `game.finished`: timeout confirmado pelo servidor mesmo sem novo lance.
- `game.error`: erro do comando, sem expor token ou detalhes internos.

## Relógio e consistência

O PostgreSQL é a fonte de verdade. Em cada lance, o servidor usa seu próprio timestamp para descontar o tempo, aplicar delay/incremento e persistir `clock_before_ms`, `clock_after_ms`, `think_time_ms` e o novo `active_clock_started_at`. Timers em memória apenas disparam a verificação; a decisão final ocorre sob advisory lock e é idempotente no banco.

O cliente pode interpolar a exibição a partir de `serverNow` e `activeClockStartedAt`, mas deve aceitar qualquer correção do servidor.
