# Servidor de partidas em tempo real

## Estado canônico

```ts
type GameState = {
  gameId: string;
  version: bigint;
  fen: string;
  sideToMove: 'white'|'black';
  whiteClockMs: number;
  blackClockMs: number;
  activeClockStartedAt: string|null;
  status: 'waiting'|'active'|'finished';
  result: 'white_win'|'black_win'|'draw'|'none';
  termination: string;
};
```

## Regras de relógio

- O servidor calcula tempo efetivo: `storedClock - (now - activeClockStartedAt)`.
- Após lance legal: desconta tempo, adiciona incremento, troca lado, salva timestamp.
- Cliente mostra relógio interpolado, mas aceita correção do servidor.
- Timeout é decidido pelo servidor e deve considerar material insuficiente conforme regras do motor.

## Regras de xadrez

Usar biblioteca madura no backend para:
- legalidade;
- SAN;
- check, mate, stalemate;
- repetição;
- regra dos 50 lances;
- material insuficiente;
- FEN/PGN.

A biblioteca deve ser envolvida por uma interface própria para permitir substituição.

## Reconexão

- grace period configurável;
- usuário volta com `lastKnownVersion`;
- servidor envia eventos ausentes ou snapshot;
- desconexão não pausa relógio em partidas rated;
- partida casual pode ter regra configurável.

## Matchmaking

- amplia faixa de rating ao longo do tempo;
- evita repetir adversário recente quando possível;
- respeita bloqueios;
- escolhe cores por balanceamento histórico + aleatoriedade segura;
- usa lock distribuído para impedir match duplicado.
