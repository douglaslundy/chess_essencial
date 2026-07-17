# Contratos WebSocket

Namespace: `/games`

## Cliente → servidor

### `game.join`
```json
{"gameId":"uuid","lastKnownVersion":12}
```

### `move.submit`
```json
{
  "gameId":"uuid",
  "clientMoveId":"uuid",
  "expectedVersion":12,
  "uci":"e2e4"
}
```

### `draw.offer`, `draw.accept`, `draw.decline`, `game.resign`
Todos contêm `gameId` e `expectedVersion` quando pertinente.

## Servidor → cliente

### `game.state`
Snapshot completo autorizado para reconexão.

### `game.move_committed`
```json
{
  "gameId":"uuid",
  "version":13,
  "ply":1,
  "uci":"e2e4",
  "san":"e4",
  "fenAfter":"...",
  "whiteClockMs":299500,
  "blackClockMs":300000,
  "serverNow":"2026-07-16T20:00:00Z"
}
```

### `game.finished`
Inclui resultado, motivo, rating antes/depois/delta e PGN disponível.

### `command.rejected`
```json
{
  "commandId":"uuid",
  "code":"ILLEGAL_MOVE",
  "message":"O lance não é legal na posição atual.",
  "authoritativeVersion":13
}
```

## Regras
- Eventos sempre incluem versão do estado.
- Cliente deve solicitar ressincronização ao detectar lacuna.
- Token é validado no handshake e renovado fora do socket.
- Não enviar dados privados de outro usuário.
