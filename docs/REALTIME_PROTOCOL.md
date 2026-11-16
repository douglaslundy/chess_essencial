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

### `game.effects_consent`

```json
{ "event": "game.effects_consent", "data": { "gameId": "uuid", "enabled": true } }
```

Cada jogador aceita (`true`) ou retira (`false`) a aura, o vídeo e as cenas de captura (Medieval Cinema) da partida. Em partida entre pessoas os efeitos só valem quando os dois aceitam; o padrão é não aceitar. Contra o bot a configuração de cada jogador vale e o servidor recusa o comando. O estado traz `effectsConsent: { white, black }`. Resposta: `game.effects_updated` para a sala.

### `game.capture_film`

```json
{ "event": "game.capture_film", "data": { "gameId": "uuid", "ply": 12, "playing": true } }
```

Enviado pelo cliente que mostra o vídeo de captura: `playing: true` quando o vídeo do lance `ply` começa a tocar, `playing: false` quando termina, é pulado ou falha. O servidor ignora o aviso em partida entre pessoas se os dois não aceitaram os efeitos. Com `true`, o servidor segura o relógio até 11 s depois da captura (nunca mais que isso, e só se o aviso chegar em até 7 s). Com `false`, o relógio do próprio remetente volta a correr na hora. Sem aviso (vídeo desligado ou que não carregou) não há pausa. Resposta, quando o relógio muda: `game.clock_updated` para a sala.

## Eventos do servidor

- `auth.authenticated`: autenticação concluída.
- `game.snapshot`: snapshot de entrada ou reconexão.
- `game.move_committed`: lance persistido e estado atualizado; é transmitido a todos na sala.
- `game.clock_updated`: o relógio mudou sem lance (vídeo de captura segurou ou liberou); traz estado e relógio.
- `game.effects_updated`: um jogador aceitou ou retirou os efeitos; traz estado e relógio.
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
